import { execFileSync } from 'node:child_process'

/** 리프레시 토큰으로 액세스 토큰 발급. 리프레시 토큰이 갱신되면 GitHub Secret도 자동 갱신(GH_PAT 설정 시) */
async function accessToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.KAKAO_REST_API_KEY,
    refresh_token: process.env.KAKAO_REFRESH_TOKEN,
  })
  if (process.env.KAKAO_CLIENT_SECRET) params.set('client_secret', process.env.KAKAO_CLIENT_SECRET)

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: params,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`카카오 토큰 갱신 실패: ${data.error_description || data.error || res.status}`)

  if (data.refresh_token) {
    // 만료 1개월 전부터 새 리프레시 토큰이 발급됨 → 저장하지 않으면 약 2개월 후 알림 중단
    if (process.env.GH_PAT && process.env.GITHUB_REPOSITORY) {
      execFileSync('gh', ['secret', 'set', 'KAKAO_REFRESH_TOKEN', '--repo', process.env.GITHUB_REPOSITORY, '--body', data.refresh_token], {
        env: { ...process.env, GH_TOKEN: process.env.GH_PAT },
        stdio: 'ignore',
      })
      console.log('카카오 리프레시 토큰 갱신 → GitHub Secret 업데이트 완료')
    } else {
      console.warn('⚠️ 카카오 리프레시 토큰이 새로 발급됐지만 GH_PAT이 없어 저장하지 못했습니다. 1개월 내 토큰을 재발급하세요.')
    }
  }
  return data.access_token
}

/** 카카오톡 '나에게 보내기' (텍스트 템플릿: 본문 최대 200자 + 링크 버튼) */
export async function sendToMe(text, url, buttonTitle = '리포트 보기') {
  const token = await accessToken()
  const template = {
    object_type: 'text',
    text: text.length > 200 ? text.slice(0, 197) + '...' : text,
    link: { web_url: url, mobile_web_url: url },
    button_title: buttonTitle,
  }
  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  })
  const data = await res.json()
  if (!res.ok || data.result_code !== 0) throw new Error(`카카오톡 전송 실패: ${data.msg || JSON.stringify(data)}`)
}
