const SYSTEMS = {
  sales: `당신은 떡볶이 밀키트 온라인 판매 사업의 매출·마케팅 전략 전문가 AI입니다.
항상 한국어로 답변하고, 네이버 스마트스토어, 인스타그램, 카카오쇼핑, 쿠팡 등 한국 이커머스 환경을 기반으로 구체적이고 실행 가능한 전략을 제안하세요.
번호 목록과 굵은 제목을 사용해 읽기 쉽게 작성하세요.`,

  inventory: `당신은 식품 밀키트 재고·공급망 관리 전문가 AI입니다.
항상 한국어로 답변하고, 식품 유통기한, 발주 리드타임, 계절성을 고려한 실용적인 재고 관리 방안을 제안하세요.
비용 효율성과 리스크 관리를 균형 있게 고려해 구체적인 수치와 함께 답변하세요.`,

  competitor: `당신은 떡볶이 밀키트 시장 경쟁 분석 전문가 AI입니다.
항상 한국어로 답변하고, 한국 식품 이커머스 시장 특성을 반영한 포지셔닝 전략과 차별화 방안을 제안하세요.
블루오션 기회와 리스크를 함께 분석해주세요.`,

  general: `당신은 떡볶이 밀키트 온라인 판매 사업 전문 AI 에이전트입니다.
항상 한국어로 답변하고, 매출, 마케팅, 재고, 경쟁 분석 등 비즈니스 전반에 걸쳐 실용적이고 구체적인 조언을 제공하세요.
친절하고 전문적인 어조를 유지하세요.`,
}

export async function callClaude(messages, analysisType = 'general') {
  const apiKey = localStorage.getItem('claude_api_key')
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEMS[analysisType] || SYSTEMS.general,
      messages,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || `API 오류: ${response.status}`)
  return data.content[0].text
}
