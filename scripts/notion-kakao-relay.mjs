/**
 * 노션 → 카카오톡 중계 (GitHub Actions "Kakao Relay" 워크플로에서 실행)
 *
 * 배경: Claude 예약 실행(구독)에서 쓰는 GitHub 앱에는 Actions 실행 권한이 없어
 *       봇이 kakao-notify.yml을 직접 실행하면 403으로 거절된다.
 * 방식: 이 스크립트가 15분마다 📈 투자전략 리포트 DB를 확인해, 오늘 날짜이면서
 *       '카톡발송' 체크가 꺼진 페이지를 카톡으로 보내고 체크를 켠다(중복 발송 방지).
 *       마감 시각까지 리포트가 없으면 ⚠️ 알림을 한 번 보낸다.
 *
 * 환경변수: NOTION_TOKEN(필수), NOTION_DATABASE_ID, NOTION_DATA_SOURCE_ID(선택),
 *          KAKAO_* · GH_PAT (lib/kakao.mjs가 사용), RELAY_FORCE_DATE(테스트용 YYYY-MM-DD)
 */
const DEFAULT_DATABASE_ID = '8c77ed355ce74fed9b115a98dcd676b7'
const DEFAULT_DATA_SOURCE_ID = '211805af-a065-4c71-aa4a-052bacf5ed12'
const SENT_PROP = '카톡발송'
const KINDS = {
  '모닝 브리핑': { icon: '🌅', deadline: '09:30' },
  '장 마감': { icon: '🌆', deadline: '17:45' },
}
const ALERT_WINDOW_MIN = 15 // 마감 시각부터 15분 안에 실행된 회차에서만 ⚠️ 알림 (예약 회차 1번)
const REPO_URL = 'https://github.com/feelgoodxinc-ai/tteok-agent'

export function kstNow(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000)
  const iso = k.toISOString()
  return { date: iso.slice(0, 10), hm: iso.slice(11, 16), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() }
}

const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))
const plain = (rich = []) => rich.map((r) => r.plain_text ?? r.text?.content ?? '').join('').trim()

export function buildMessage(kind, date, summary) {
  const icon = KINDS[kind]?.icon || '📈'
  const mmdd = `${date.slice(5, 7)}/${date.slice(8, 10)}`
  const body = summary || '(한줄요약 없음 — 노션 페이지에서 확인)'
  const text = `${icon} ${mmdd} ${kind}\n\n${body}`
  return text.length > 200 ? text.slice(0, 197) + '...' : text
}

export function makeNotion(token, fetchImpl = fetch, ids = {}) {
  const databaseId = ids.databaseId || DEFAULT_DATABASE_ID
  const dataSourceId = ids.dataSourceId || DEFAULT_DATA_SOURCE_ID
  async function call(method, path, body, version) {
    const res = await fetchImpl(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(`노션 API ${res.status} ${data.code || ''}: ${data.message || ''}`.trim())
      err.status = res.status
      throw err
    }
    return data
  }
  return {
    /** 오늘 날짜 페이지 전체(발송 여부 무관). 예전 API(DB 조회)가 안 되면 데이터 소스 조회로 재시도 */
    async pagesOn(date) {
      const filter = { property: '날짜', date: { equals: date } }
      try {
        return (await call('POST', `/databases/${databaseId}/query`, { filter, page_size: 50 }, '2022-06-28')).results
      } catch (e) {
        if (e.status === 401 || e.status === 403) throw e
        return (await call('POST', `/data_sources/${dataSourceId}/query`, { filter, page_size: 50 }, '2025-09-03')).results
      }
    },
    async markSent(pageId) {
      await call('PATCH', `/pages/${pageId}`, { properties: { [SENT_PROP]: { checkbox: true } } }, '2022-06-28')
    },
  }
}

export function describe(page) {
  const p = page.properties || {}
  return {
    id: page.id,
    url: page.url,
    kind: p['구분']?.select?.name || '',
    summary: plain(p['한줄요약']?.rich_text),
    title: plain(p['제목']?.title),
    sent: p[SENT_PROP]?.checkbox === true,
    hasSentProp: SENT_PROP in p,
  }
}

/** 핵심 로직 — 외부 의존성을 주입받아 테스트할 수 있게 분리 */
export async function relay({ notion, send, now, isTradingDay, log = console.log }) {
  const { date, minutes, hm } = now
  if (!isTradingDay(date)) {
    log(`${date} 휴장일 — 종료`)
    return { sent: 0, alerts: 0, skipped: 'holiday' }
  }
  const pages = (await notion.pagesOn(date)).map(describe)
  if (pages.length && !pages.some((p) => p.hasSentProp)) {
    throw new Error(`노션 DB에 '${SENT_PROP}' 체크박스 속성이 없습니다. 중복 발송을 막기 위해 중단합니다.`)
  }
  let sent = 0
  for (const p of pages.filter((x) => !x.sent && KINDS[x.kind])) {
    await send(buildMessage(p.kind, date, p.summary), p.url, '리포트 보기')
    await notion.markSent(p.id) // 발송 성공 후에만 체크 — 실패하면 다음 회차에 재시도
    sent++
    log(`✅ ${p.kind} 발송: ${p.title || p.id}`)
  }
  let alerts = 0
  for (const [kind, cfg] of Object.entries(KINDS)) {
    const d = toMin(cfg.deadline)
    const exists = pages.some((p) => p.kind === kind)
    if (!exists && minutes >= d && minutes < d + ALERT_WINDOW_MIN) {
      await send(`⚠️ ${date.slice(5, 7)}/${date.slice(8, 10)} ${kind} 미생성\n${cfg.deadline}까지 노션 리포트가 없습니다. 예약 실행 기록을 확인하세요.`, REPO_URL, '확인하기')
      alerts++
      log(`⚠️ ${kind} 미생성 알림 (${hm})`)
    }
  }
  if (!sent && !alerts) log(`${date} ${hm} 보낼 항목 없음 (오늘 페이지 ${pages.length}개)`)
  return { sent, alerts }
}

// ---------------------------------------------------------------- 실행부
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const token = process.env.NOTION_TOKEN
  if (!token) {
    console.error('❌ NOTION_TOKEN 이 없습니다 (GitHub Secrets 확인).')
    process.exit(1)
  }
  const { sendToMe } = await import('./lib/kakao.mjs')
  const { isKrxTradingDay } = await import('./lib/calendar.mjs')
  const now = kstNow()
  if (process.env.RELAY_FORCE_DATE) now.date = process.env.RELAY_FORCE_DATE
  const notion = makeNotion(token, fetch, {
    databaseId: process.env.NOTION_DATABASE_ID,
    dataSourceId: process.env.NOTION_DATA_SOURCE_ID,
  })
  try {
    await relay({ notion, send: sendToMe, now, isTradingDay: isKrxTradingDay })
  } catch (e) {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  }
}
