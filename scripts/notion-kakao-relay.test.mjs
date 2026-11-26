// 노션 → 카톡 중계 오프라인 테스트: node scripts/notion-kakao-relay.test.mjs
import assert from 'node:assert/strict'
import { relay, buildMessage, kstNow, makeNotion } from './notion-kakao-relay.mjs'

const page = (id, kind, summary, sent = false) => ({
  id, url: `https://www.notion.so/${id}`,
  properties: {
    제목: { title: [{ plain_text: `${kind} 리포트` }] },
    구분: { select: { name: kind } },
    한줄요약: { rich_text: [{ plain_text: summary }] },
    카톡발송: { checkbox: sent },
  },
})

function fakeNotion(pages) {
  const marked = []
  return { marked, pagesOn: async () => pages, markSent: async (id) => { marked.push(id); const p = pages.find((x) => x.id === id); p.properties.카톡발송.checkbox = true } }
}
const at = (date, hm) => ({ date, hm, minutes: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) })
const trading = () => true
const quiet = () => {}

// 1) 미발송 페이지만 보내고 체크 → 다음 회차엔 재발송 없음
{
  const pages = [page('a1', '모닝 브리핑', '신규 매수 없음 — 조정 국면'), page('b2', '장 마감', '이미 보냄', true)]
  const n = fakeNotion(pages); const sent = []
  const r = await relay({ notion: n, send: async (...a) => sent.push(a), now: at('2026-11-26', '08:35'), isTradingDay: trading, log: quiet })
  assert.equal(r.sent, 1); assert.deepEqual(n.marked, ['a1'])
  assert.match(sent[0][0], /^🌅 11\/26 모닝 브리핑\n\n신규 매수 없음/)
  assert.equal(sent[0][1], 'https://www.notion.so/a1')
  const r2 = await relay({ notion: n, send: async (...a) => sent.push(a), now: at('2026-11-26', '08:50'), isTradingDay: trading, log: quiet })
  assert.equal(r2.sent, 0); assert.equal(sent.length, 1)
}

// 2) 카톡 전송 실패 → 체크하지 않음(다음 회차 재시도)
{
  const n = fakeNotion([page('c3', '장 마감', '요약')])
  await assert.rejects(relay({ notion: n, send: async () => { throw new Error('kakao down') }, now: at('2026-11-26', '16:35'), isTradingDay: trading, log: quiet }))
  assert.deepEqual(n.marked, [])
}

// 3) 휴장일이면 아무것도 안 함
{
  const n = fakeNotion([page('d4', '장 마감', 'x')]); const sent = []
  const r = await relay({ notion: n, send: async (...a) => sent.push(a), now: at('2026-11-28', '16:35'), isTradingDay: () => false, log: quiet })
  assert.equal(r.skipped, 'holiday'); assert.equal(sent.length, 0)
}

// 4) 마감 시각 회차에만 미생성 경고 (모닝 09:30~09:44, 장 마감 17:45~17:59)
{
  const sent = []
  const run = (hm, pages = []) => relay({ notion: fakeNotion(pages), send: async (...a) => sent.push(a), now: at('2026-11-26', hm), isTradingDay: trading, log: quiet })
  assert.equal((await run('09:20')).alerts, 0)
  assert.equal((await run('09:35')).alerts, 1)
  assert.equal((await run('09:50')).alerts, 0)
  assert.equal((await run('17:50', [page('m', '모닝 브리핑', 'x', true)])).alerts, 1)
  assert.match(sent.at(-1)[0], /장 마감 미생성/)
}

// 5) 카톡발송 속성이 DB에 없으면 중단 (중복 발송 방지)
{
  const p = page('e5', '장 마감', 'x'); delete p.properties.카톡발송
  await assert.rejects(relay({ notion: fakeNotion([p]), send: async () => {}, now: at('2026-11-26', '16:35'), isTradingDay: trading, log: quiet }), /카톡발송/)
}

// 6) 메시지 200자 제한, KST 변환
{
  assert.ok(buildMessage('장 마감', '2026-11-26', 'ㄱ'.repeat(300)).length <= 200)
  const k = kstNow(new Date('2026-11-25T23:20:00Z'))
  assert.equal(k.date, '2026-11-26'); assert.equal(k.hm, '08:20')
}

// 7) 노션 API 호출 형식 + 예전 DB 조회 실패 시 데이터 소스 조회로 재시도
{
  const calls = []
  const fakeFetch = async (url, opt) => {
    calls.push({ url, opt })
    if (url.includes('/databases/')) return { ok: false, status: 400, json: async () => ({ code: 'validation_error', message: 'multiple data sources' }) }
    return { ok: true, status: 200, json: async () => ({ results: [page('f6', '장 마감', 'x')] }) }
  }
  const n = makeNotion('secret', fakeFetch)
  const res = await n.pagesOn('2026-11-26')
  assert.equal(res.length, 1)
  assert.match(calls[0].url, /\/v1\/databases\/8c77ed355ce74fed9b115a98dcd676b7\/query$/)
  assert.equal(calls[0].opt.headers['Notion-Version'], '2022-06-28')
  assert.deepEqual(JSON.parse(calls[0].opt.body).filter, { property: '날짜', date: { equals: '2026-11-26' } })
  assert.match(calls[1].url, /\/v1\/data_sources\/211805af-a065-4c71-aa4a-052bacf5ed12\/query$/)
  assert.equal(calls[1].opt.headers['Notion-Version'], '2025-09-03')
  // 권한 오류(401)는 재시도하지 않고 바로 실패
  const n2 = makeNotion('bad', async () => ({ ok: false, status: 401, json: async () => ({ code: 'unauthorized', message: 'API token is invalid.' }) }))
  await assert.rejects(n2.pagesOn('2026-11-26'), /401/)
}

console.log('7 relay tests passed')
