import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-opus-5-5'
// Claude Opus 5.5 단가 (USD / 1M tokens), 웹 검색 $10 / 1,000회
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, search: 0.01 }

const MAX_CONTINUATIONS = 5

function getClient() {
  // Node(자동 실행) 환경: 환경변수 / 브라우저: localStorage
  const apiKey = globalThis.process?.env?.ANTHROPIC_API_KEY || globalThis.localStorage?.getItem('claude_api_key')
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 }
}

export function addUsage(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    searches: a.searches + b.searches,
  }
}

export function estimateCost(u) {
  return (
    (u.input * PRICE.input + u.output * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1e6 +
    u.searches * PRICE.search
  )
}

function usageFrom(resp) {
  const u = resp.usage || {}
  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    searches: u.server_tool_use?.web_search_requests || 0,
  }
}

/**
 * 단일 에이전트 실행.
 * - webSearch: 서버측 웹 검색 도구 사용 (장 마감 데이터 실시간 수집)
 * - pause_turn(서버 도구 루프 한도) 발생 시 자동 재개
 * - 안전 분류기 거절 시 서버측 fallback 모델로 자동 재시도
 */
export async function runAgent({ system, prompt, messages, webSearch = false, maxSearches = 5, effort = 'medium', maxTokens = 16000 }) {
  const client = getClient()
  let convo = messages ? [...messages] : [{ role: 'user', content: prompt }]
  const tools = webSearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' } }]
    : undefined

  let usage = emptyUsage()
  const sources = new Map()
  const textParts = []

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    let resp
    try {
      resp = await client.beta.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort },
        messages: convo,
        ...(tools ? { tools } : {}),
      })
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('API 키가 유효하지 않습니다.')
      if (e instanceof Anthropic.RateLimitError) throw new Error('요청 한도 초과 — 잠시 후 다시 시도하세요.')
      if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) {
        throw new Error('Claude API 크레딧(잔액) 부족 — platform.claude.com → Billing에서 충전하세요.')
      }
      if (e instanceof Anthropic.APIError) throw new Error(`API 오류 ${e.status ?? ''}: ${e.message}`)
      throw e
    }

    usage = addUsage(usage, usageFrom(resp))

    for (const block of resp.content) {
      if (block.type === 'text') textParts.push(block.text)
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === 'web_search_result' && !sources.has(r.url)) sources.set(r.url, { url: r.url, title: r.title, age: r.page_age })
        }
      }
    }

    if (resp.stop_reason === 'refusal') {
      throw new Error('모델이 요청을 거절했습니다' + (resp.stop_details?.explanation ? `: ${resp.stop_details.explanation}` : '.'))
    }
    if (resp.stop_reason === 'pause_turn') {
      // 서버 도구 루프 재개: 어시스턴트 응답을 그대로 이어붙여 재요청
      convo = [...convo, { role: 'assistant', content: resp.content }]
      continue
    }
    break
  }

  return { text: textParts.join('').trim(), usage, sources: [...sources.values()] }
}
