/**
 * 카카오톡 '나에게 보내기' 단독 발송 (GitHub Actions "Kakao Notify" 워크플로에서 실행)
 * 입력(환경변수): NOTIFY_MESSAGE, NOTIFY_URL, NOTIFY_BUTTON
 * Claude 예약 실행(구독)이 노션에 리포트를 쓴 뒤 이 워크플로를 호출합니다.
 */
import { sendToMe } from './lib/kakao.mjs'

const message = (process.env.NOTIFY_MESSAGE || '').trim()
const url = (process.env.NOTIFY_URL || '').trim()
const button = (process.env.NOTIFY_BUTTON || '').trim() || '리포트 보기'

if (!message) {
  console.error('❌ 보낼 메시지가 비어 있습니다.')
  process.exit(1)
}
// 카카오에 등록한 도메인(www.notion.so, github.com)으로만 링크 — 노션 주소는 페이지 ID로 정규화
function normalize(u) {
  const id = u.match(/[0-9a-f]{32}/i)?.[0] || u.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.replace(/-/g, '')
  if (/notion\.(so|com)/.test(u) && id) return `https://www.notion.so/${id}`
  if (u.startsWith('https://github.com/')) return u
  return 'https://www.notion.so'
}
const link = normalize(url)

await sendToMe(message, link, button)
console.log('✅ 카카오톡 전송 완료')
