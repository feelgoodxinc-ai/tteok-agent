/**
 * 카카오 연결 마무리 (GitHub Actions "Kakao Setup" 워크플로에서 실행)
 * 입력: 카카오 로그인 후 이동한 주소 전체(https://localhost/?code=...) 또는 code 값
 * 동작: 인가 코드 → 리프레시 토큰 교환 → GitHub Secret KAKAO_REFRESH_TOKEN 저장 → 테스트 카톡 발송
 */
import { execFileSync } from 'node:child_process'

const REDIRECT_URI = process.env.KAKAO_REDIRECT_URI || 'https://localhost'
const raw = (process.env.KAKAO_AUTH_INPUT || '').trim()

function fail(msg) {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

let code = raw
try {
  if (raw.startsWith('http')) code = new URL(raw).searchParams.get('code') || ''
} catch { /* code 값만 넣은 경우 */ }
if (!code) fail('주소에서 code 값을 찾지 못했습니다. 카카오 로그인 후 주소창의 주소 전체를 붙여넣으세요.')
if (!process.env.KAKAO_REST_API_KEY) fail('GitHub Secret KAKAO_REST_API_KEY 가 없습니다.')
if (!process.env.GH_PAT) fail('GitHub Secret GH_PAT 가 없습니다.')

const params = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: process.env.KAKAO_REST_API_KEY,
  redirect_uri: REDIRECT_URI,
  code,
})
if (process.env.KAKAO_CLIENT_SECRET) params.set('client_secret', process.env.KAKAO_CLIENT_SECRET)

const res = await fetch('https://kauth.kakao.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
  body: params,
})
const data = await res.json()
if (!res.ok) {
  const hint = {
    KOE320: '코드가 만료됐거나 이미 사용됐습니다. 카카오 로그인 주소를 다시 열어 새 코드를 받으세요(코드는 몇 분 안에 1번만 사용 가능).',
    KOE006: 'Redirect URI가 카카오에 등록된 값과 다릅니다. https://localhost 로 등록했는지 확인하세요.',
    KOE010: 'Client Secret 설정을 확인하세요(카카오에서 켰다면 GitHub Secret KAKAO_CLIENT_SECRET 필요).',
  }[data.error_code]
  fail(`토큰 발급 실패: ${data.error_description || data.error} ${hint ? '\n👉 ' + hint : ''}`)
}
if (!String(data.scope || '').includes('talk_message')) {
  fail('카카오톡 메시지 전송 동의가 빠졌습니다. 동의항목에서 "카카오톡 메시지 전송"을 켠 뒤, 로그인 화면에서 동의하고 다시 시도하세요.')
}

execFileSync('gh', ['secret', 'set', 'KAKAO_REFRESH_TOKEN', '--repo', process.env.GITHUB_REPOSITORY, '--body', data.refresh_token], {
  env: { ...process.env, GH_TOKEN: process.env.GH_PAT },
  stdio: 'inherit',
})
console.log('✅ KAKAO_REFRESH_TOKEN 저장 완료')

const template = {
  object_type: 'text',
  text: '🎉 투자전략봇 연결 성공!\n이제 개장일마다 08시 모닝 브리핑, 16시 장 마감 리포트를 보내드릴게요.',
  link: { web_url: 'https://www.notion.so', mobile_web_url: 'https://www.notion.so' },
  button_title: '노션 열기',
}
const send = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
  method: 'POST',
  headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
  body: new URLSearchParams({ template_object: JSON.stringify(template) }),
})
const sent = await send.json()
if (sent.result_code !== 0) fail(`토큰 저장은 됐지만 테스트 카톡 전송 실패: ${sent.msg || JSON.stringify(sent)}`)
console.log('✅ 테스트 카톡 전송 완료 — 카카오톡 "나와의 채팅"을 확인하세요')
