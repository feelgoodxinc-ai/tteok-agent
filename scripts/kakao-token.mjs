/**
 * 카카오 리프레시 토큰 최초 발급 (1회, 내 PC에서 실행)
 *   1) 브라우저로 인가 코드 받기:
 *      https://kauth.kakao.com/oauth/authorize?client_id=<REST_API_KEY>&redirect_uri=<REDIRECT_URI>&response_type=code&scope=talk_message
 *      → 리다이렉트된 주소의 ?code=XXXX 값을 복사 (코드는 1회용, 수 분 내 사용)
 *   2) KAKAO_REST_API_KEY=... KAKAO_REDIRECT_URI=... [KAKAO_CLIENT_SECRET=...] npm run kakao:token -- <code>
 *   3) 출력된 refresh_token을 GitHub Secret KAKAO_REFRESH_TOKEN 에 저장
 */
const code = process.argv[2]
const { KAKAO_REST_API_KEY, KAKAO_REDIRECT_URI, KAKAO_CLIENT_SECRET } = process.env
if (!code || !KAKAO_REST_API_KEY || !KAKAO_REDIRECT_URI) {
  console.error('사용법: KAKAO_REST_API_KEY=... KAKAO_REDIRECT_URI=... npm run kakao:token -- <인가코드>')
  process.exit(1)
}

const params = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: KAKAO_REST_API_KEY,
  redirect_uri: KAKAO_REDIRECT_URI,
  code,
})
if (KAKAO_CLIENT_SECRET) params.set('client_secret', KAKAO_CLIENT_SECRET)

const res = await fetch('https://kauth.kakao.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
  body: params,
})
const data = await res.json()
if (!res.ok) {
  console.error('발급 실패:', data)
  process.exit(1)
}
console.log('\nKAKAO_REFRESH_TOKEN =', data.refresh_token)
console.log(`(유효기간 약 ${Math.round(data.refresh_token_expires_in / 86400)}일, scope: ${data.scope})`)
