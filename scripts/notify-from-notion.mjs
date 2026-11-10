/**
 * 노션 리포트 DB를 확인해 오늘자 '모닝 브리핑' / '장 마감' 페이지가 있고
 * 아직 카톡으로 보내지 않았다면 카카오톡 '나에게 보내기'로 발송한다.
 * (GitHub Actions "Kakao Notify (Notion Poll)" 워크플로가 주기적으로 실행)
 *
 * 필요한 환경변수: NOTION_TOKEN, NOTION_DATABASE_ID, KAKAO_REST_API_KEY,
 *                 KAKAO_CLIENT_SECRET, KAKAO_REFRESH_TOKEN, GH_PAT(토큰 갱신 저장용)
 * 중복 발송 방지: DB의 '카톡발송' 체크박스 속성(없으면 자동 생성)
 */
import { sendToMe } from './lib/kakao.mjs'
import { todayKST, isKrxTradingDay } from './lib/calendar.mjs'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'
const DB = process.env.NOTION_DATABASE_ID
const SENT = '카톡발송'
const KINDS = [
  { kind: '모닝 브리핑', icon: '🌅' },
  { kind: '장 마감', icon: '🌆' },
]

async function notion(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Notion ${method} ${path} 실패 (${res.status}): ${data.message}`)
  return data
}

const text = (prop) => (prop?.rich_text || prop?.title || []).map(t => t.plain_text).join('')

function normalize(u) {
  const id = u.match(/[0-9a-f]{32}/i)?.[0] || u.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.replace(/-/g, '')
  return id ? `https://www.notion.so/${id}` : 'https://www.notion.so'
}

if (!process.env.NOTION_TOKEN || !DB) {
  console.error('❌ NOTION_TOKEN / NOTION_DATABASE_ID 가 설정되지 않았습니다.')
  process.exit(1)
}

const today = todayKST()
if (!isKrxTradingDay(today)) {
  console.log(`${today} 휴장일 — 종료`)
  process.exit(0)
}

// '카톡발송' 속성이 없으면 만든다
const db = await notion(`/databases/${DB}`, 'GET')
if (!db.properties[SENT]) {
  await notion(`/databases/${DB}`, 'PATCH', { properties: { [SENT]: { checkbox: {} } } })
  console.log(`'${SENT}' 속성을 생성했습니다.`)
}

let failed = false
for (const { kind, icon } of KINDS) {
  const q = await notion(`/databases/${DB}/query`, 'POST', {
    filter: {
      and: [
        { property: '구분', select: { equals: kind } },
        { property: '날짜', date: { equals: today } },
      ],
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: 1,
  })
  const page = q.results[0]
  if (!page) { console.log(`[${kind}] 오늘 페이지 없음`); continue }
  if (page.properties[SENT]?.checkbox) { console.log(`[${kind}] 이미 발송됨`); continue }
  const summary = text(page.properties['한줄요약']).trim()
  if (!summary) { console.log(`[${kind}] 한줄요약 비어 있음 — 다음 실행에서 재확인`); continue }

  const mmdd = today.slice(5).replace('-', '/')
  const message = `${icon} ${mmdd} ${kind}\n\n${summary}`.slice(0, 200)
  try {
    await sendToMe(message, normalize(page.url), '리포트 보기')
    await notion(`/pages/${page.id}`, 'PATCH', { properties: { [SENT]: { checkbox: true } } })
    console.log(`✅ [${kind}] 카카오톡 전송 완료`)
  } catch (e) {
    failed = true
    console.error(`❌ [${kind}] 전송 실패: ${e.message}`)
  }
}
if (failed) process.exit(1)
