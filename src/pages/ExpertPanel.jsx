import { useState } from 'react'
import { Users, Send, Loader2 } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const EXPERTS = [
  { key: '퍼포먼스 마케터', icon: '🎯', bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-700', sub: 'text-red-400', desc: '광고·전환율·매출 중심' },
  { key: '브랜드 디렉터',   icon: '🎨', bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', sub: 'text-purple-400', desc: '포지셔닝·스토리·감성' },
  { key: '유통 전략가',     icon: '📦', bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', sub: 'text-blue-400', desc: '채널 설계·물량 증가' },
  { key: '소비자 인사이트 분석가', icon: '🔍', bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', sub: 'text-green-400', desc: '고객 심리·구매 트리거' },
  { key: 'CFO',             icon: '💰', bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-700', sub: 'text-amber-400', desc: '비용·마진·리스크', wide: true },
  { key: '통합 실행 전략',  icon: '⚡', bg: 'bg-slate-800', border: 'border-slate-700', title: 'text-white', sub: 'text-slate-400', desc: '최종 실행 계획', wide: true, dark: true },
]

const WIDE_KEYS = new Set(['CFO', '통합 실행 전략'])

const QUICK_Q = [
  '카카오톡딜 매출을 2배로 늘리려면?',
  '21년 브랜드 스토리를 마케팅에 활용하는 방법은?',
  '월 1000만원 달성을 위한 우선순위는?',
  '신규 고객 유입 채널 전략은?',
  '공동구매 진행 시 주의할 점은?',
  '오프라인 채널 진출 타이밍은?',
]

const MARKERS = ['[퍼포먼스 마케터]', '[브랜드 디렉터]', '[유통 전략가]', '[소비자 인사이트 분석가]', '[CFO]', '[통합 실행 전략]']

function parseResponse(text) {
  const sections = []
  for (let i = 0; i < MARKERS.length; i++) {
    const start = text.indexOf(MARKERS[i])
    if (start === -1) continue
    const nextIdx = MARKERS.slice(i + 1).findIndex(m => text.indexOf(m) !== -1)
    const nextMarker = nextIdx !== -1 ? MARKERS[i + 1 + nextIdx] : null
    const end = nextMarker ? text.indexOf(nextMarker) : text.length
    const content = text.slice(start + MARKERS[i].length, end).trim()
    sections.push({ key: MARKERS[i].replace(/[\[\]]/g, ''), content })
  }
  return sections.length > 0 ? sections : [{ key: '전문가 패널 답변', content: text }]
}

function ExpertCard({ expertKey, content }) {
  const e = EXPERTS.find(x => x.key === expertKey) ?? EXPERTS[5]
  return (
    <div className={`rounded-xl p-5 border ${e.bg} ${e.border} ${WIDE_KEYS.has(expertKey) ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{e.icon}</span>
        <div>
          <p className={`text-sm font-bold ${e.title}`}>{expertKey}</p>
          <p className={`text-xs ${e.sub}`}>{e.desc}</p>
        </div>
      </div>
      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${e.dark ? 'text-slate-300' : 'text-slate-700'}`}>
        {content}
      </p>
    </div>
  )
}

export default function ExpertPanel() {
  const [question, setQuestion] = useState('')
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || loading) return
    setQuestion('')
    setLoading(true)
    const id = Date.now()
    setSessions(prev => [{ id, question: text, sections: null }, ...prev])

    try {
      const reply = await callClaude([{ role: 'user', content: text }], 'expert', 3000)
      setSessions(prev => prev.map(s => s.id === id ? { ...s, sections: parseResponse(reply) } : s))
    } catch (e) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, sections: [{ key: '오류', content: e.message }] } : s))
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <Users size={18} className="text-red-600" />
          <h3 className="font-semibold text-slate-800">전문가 회의</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">퍼포먼스 마케터 · 브랜드 디렉터 · 유통 전략가 · 소비자 인사이트 분석가 · CFO — 5인이 각자의 관점으로 답변합니다</p>

        <div className="flex gap-2 mb-3">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
            placeholder="비즈니스 질문을 입력하세요..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {loading ? '회의 중...' : '질문하기'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_Q.map(q => (
            <button key={q} onClick={() => ask(q)} disabled={loading}
              className="px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions */}
      {sessions.map(session => (
        <div key={session.id} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full shrink-0">Q. {session.question}</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {!session.sections ? (
            <div className="bg-white rounded-xl p-10 border border-slate-200 flex items-center justify-center gap-3 text-slate-500 text-sm">
              <Loader2 size={18} className="animate-spin text-red-600" />
              전문가 5인이 검토 중입니다...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {session.sections.map(({ key, content }) => (
                <ExpertCard key={key} expertKey={key} content={content} />
              ))}
            </div>
          )}
        </div>
      ))}

      {sessions.length === 0 && (
        <div className="bg-white rounded-xl p-14 border border-slate-200 text-center text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">질문을 입력하면 5인의 전문가가 각자의 관점으로 답변합니다.</p>
          <p className="text-xs mt-1 text-slate-300">위의 빠른 질문을 눌러 바로 시작해보세요.</p>
        </div>
      )}
    </div>
  )
}
