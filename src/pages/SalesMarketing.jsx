import { useState } from 'react'
import { TrendingUp, Send, Loader2 } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const quickQ = [
  '인스타그램 마케팅 효율을 높이는 방법은?',
  '재구매율을 높이기 위한 CRM 전략은?',
  '구독 모델 도입 가능성과 전략은?',
  '시즌별 프로모션 전략 추천해줘',
  '신제품 출시 마케팅 플랜 만들어줘',
  '매출 2배 달성을 위한 로드맵은?',
]

export default function SalesMarketing() {
  const [form, setForm] = useState({ monthlyRevenue: '', mainChannel: '', marketingBudget: '', targetGrowth: '', currentChallenges: '' })
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleAnalyze = async () => {
    setLoading(true)
    const prompt = `다음 떡볶이 밀키트 사업 데이터를 분석하고 전략을 제안해주세요:\n\n- 월 평균 매출: ${form.monthlyRevenue || '미입력'}\n- 주요 판매 채널: ${form.mainChannel || '미입력'}\n- 마케팅 예산: ${form.marketingBudget || '미입력'}\n- 목표 성장률: ${form.targetGrowth || '미입력'}\n- 현재 주요 과제: ${form.currentChallenges || '미입력'}\n\n다음 항목별로 구체적인 전략을 제안해주세요:\n1. 채널별 최적화 전략\n2. 마케팅 예산 배분 제안\n3. 단기(1개월) / 중기(3개월) 액션 플랜\n4. 핵심 KPI 목표`
    try {
      const text = await callClaude([{ role: 'user', content: prompt }], 'sales')
      setAnalysis(text)
    } catch (e) {
      setAnalysis(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-red-600" />
            <h3 className="font-semibold text-slate-800">현황 데이터 입력</h3>
          </div>
          <div className="space-y-4">
            {[
              { key: 'monthlyRevenue', label: '월 평균 매출', placeholder: '예: 1,500만원' },
              { key: 'mainChannel', label: '주요 판매 채널', placeholder: '예: 인스타그램, 네이버 스마트스토어' },
              { key: 'marketingBudget', label: '월 마케팅 예산', placeholder: '예: 200만원' },
              { key: 'targetGrowth', label: '목표 성장률', placeholder: '예: 월 20% 성장' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                <input value={form[key]} onChange={set(key)} placeholder={placeholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">현재 주요 과제</label>
              <textarea value={form.currentChallenges} onChange={set('currentChallenges')} rows={3}
                placeholder="예: 신규 고객 획득 비용이 높고 재구매율이 낮습니다."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            </div>
            <button onClick={handleAnalyze} disabled={loading}
              className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {loading ? 'AI 분석 중...' : 'AI 전략 분석 실행'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 flex flex-col">
          <h3 className="font-semibold text-slate-800 mb-4">AI 전략 분석 결과</h3>
          {analysis ? (
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed overflow-y-auto flex-1">{analysis}</div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              <div className="text-center">
                <TrendingUp size={40} className="mx-auto mb-3 opacity-20" />
                <p>현황 데이터를 입력하고</p>
                <p>AI 분석을 실행해주세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">빠른 전략 질문</h3>
        <div className="grid grid-cols-3 gap-2">
          {quickQ.map((q) => (
            <button key={q} onClick={() => setForm((f) => ({ ...f, currentChallenges: q }))}
              className="text-left px-3 py-2.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:border-red-400 hover:text-red-600 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
