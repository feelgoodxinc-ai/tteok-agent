import { useState } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Send, Loader2, MapPin } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const CHECKLIST = [
  {
    category: '기본 정보',
    icon: '📋',
    weight: 20,
    items: [
      { label: '상호명 정확 등록', done: true },
      { label: '주소 정확 등록 (상세 주소 포함)', done: true },
      { label: '전화번호 등록 및 연결 확인', done: true },
      { label: '영업시간 등록 (요일별, 브레이크타임)', done: true },
      { label: '대표 카테고리 설정 (분식/떡볶이)', done: true },
      { label: '편의시설 정보 입력', done: false },
    ],
  },
  {
    category: '메뉴 & 가격',
    icon: '🍽️',
    weight: 20,
    items: [
      { label: '전체 메뉴 등록', done: true },
      { label: '메뉴별 가격 정보 입력', done: true },
      { label: '대표 메뉴 설정', done: true },
      { label: '메뉴별 사진 첨부', done: false },
      { label: '시즌 메뉴 업데이트', done: false },
    ],
  },
  {
    category: '사진 최적화',
    icon: '📸',
    weight: 25,
    items: [
      { label: '대표 사진 등록 (가로형 비율)', done: true },
      { label: '메뉴 사진 5장 이상', done: false },
      { label: '매장 내부 사진', done: true },
      { label: '매장 외부/간판 사진', done: true },
      { label: '음식 클로즈업 사진', done: false },
    ],
  },
  {
    category: '리뷰 관리',
    icon: '⭐',
    weight: 20,
    items: [
      { label: '현재 리뷰 수 50개 이상', done: true },
      { label: '모든 리뷰에 답글 작성', done: false },
      { label: '평균 별점 4.0 이상 유지', done: true },
      { label: '영수증 리뷰 유도 안내 부착', done: false },
    ],
  },
  {
    category: '저장 & 블로그',
    icon: '📌',
    weight: 15,
    items: [
      { label: 'MY플레이스 저장수 100 이상', done: true },
      { label: '네이버 블로그 포스팅 10건 이상', done: true },
      { label: '체험단 블로그 포스팅 운영', done: false },
      { label: '인플루언서 협업 포스팅', done: false },
    ],
  },
]

const ALGO_FACTORS = [
  { name: '리뷰 수 & 질', score: 68, max: 100, desc: '방문자 리뷰 284개, 평점 4.6', color: '#F59E0B' },
  { name: '저장 수 (MY플레이스)', score: 55, max: 100, desc: '1,180개 저장, 목표까지 320개 부족', color: '#3B82F6' },
  { name: '블로그 포스팅', score: 52, max: 100, desc: '총 47건, 최근 1개월 11건', color: '#22C55E' },
  { name: '정보 완성도', score: 80, max: 100, desc: '기본정보·메뉴 등록 완료, 사진 보강 필요', color: '#8B5CF6' },
  { name: '방문 빈도 (영수증 리뷰)', score: 60, max: 100, desc: '영수증 리뷰 유도 강화 필요', color: '#EC4899' },
  { name: '리뷰 답글 응답률', score: 70, max: 100, desc: '최근 답글률 70%, 목표 90%', color: '#DC2626' },
]

const QUICK_Q = [
  '플레이스 상위노출을 위해 지금 당장 해야 할 3가지는?',
  '리뷰 수를 한 달에 30개 이상 늘리는 방법은?',
  '사진 등록 시 상위노출에 유리한 전략은?',
  '블로그 포스팅과 플레이스 연동을 최대화하는 방법은?',
  '네이버 플레이스 알고리즘에서 가장 중요한 요소는?',
  '경쟁 매장 대비 저장수를 빠르게 늘리는 방법은?',
]

function ScoreBar({ factor }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium">{factor.name}</span>
        <span className="font-bold text-slate-800">{factor.score}<span className="text-slate-400 font-normal text-xs">/100</span></span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${factor.score}%`, backgroundColor: factor.color }}
        />
      </div>
      <p className="text-xs text-slate-400">{factor.desc}</p>
    </div>
  )
}

function ChecklistCategory({ cat, open, onToggle, onToggleItem }) {
  const done = cat.items.filter(i => i.done).length
  const total = cat.items.length
  const pct = Math.round((done / total) * 100)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="text-lg">{cat.icon}</span>
        <div className="flex-1 text-left">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{cat.category}</span>
            <span className="text-xs text-slate-400">{done}/{total} 완료</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1 mt-1.5">
            <div
              className={`h-1 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-green-50 text-green-600' : pct >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
          {pct}%
        </span>
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
          {cat.items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onToggleItem(idx)}
              className="w-full flex items-center gap-2.5 text-left hover:bg-white rounded-lg px-2 py-1.5 transition-colors"
            >
              {item.done
                ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                : <Circle size={16} className="text-slate-300 flex-shrink-0" />
              }
              <span className={`text-sm ${item.done ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NaverPlace() {
  const [checklist, setChecklist] = useState(CHECKLIST)
  const [openCats, setOpenCats] = useState({ '기본 정보': true })
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const allItems = checklist.flatMap(c => c.items)
  const totalDone = allItems.filter(i => i.done).length
  const totalItems = allItems.length
  const overallScore = Math.round((totalDone / totalItems) * 100)

  const algoAvg = Math.round(ALGO_FACTORS.reduce((s, f) => s + f.score, 0) / ALGO_FACTORS.length)

  const toggleCat = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }))

  const toggleItem = (catIdx, itemIdx) => {
    setChecklist(prev => prev.map((cat, ci) => {
      if (ci !== catIdx) return cat
      return {
        ...cat,
        items: cat.items.map((item, ii) => ii === itemIdx ? { ...item, done: !item.done } : item),
      }
    }))
  }

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || loading) return
    setQuestion('')
    setLoading(true)
    try {
      const reply = await callClaude([{ role: 'user', content: text }], 'naverplace', 2000)
      setAnswer(reply)
    } catch (e) {
      setAnswer(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      {/* 점수 개요 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col items-center justify-center">
          <p className="text-xs text-slate-500 mb-2">체크리스트 완성도</p>
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="32" fill="none" stroke="#DC2626" strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 32 * overallScore / 100} ${2 * Math.PI * 32}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-slate-800">{overallScore}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">{totalDone}/{totalItems} 항목 완료</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col items-center justify-center">
          <p className="text-xs text-slate-500 mb-2">알고리즘 점수</p>
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="40" cy="40" r="32" fill="none" stroke="#3B82F6" strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 32 * algoAvg / 100} ${2 * Math.PI * 32}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-slate-800">{algoAvg}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">상위 35% 수준</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={14} className="text-red-500" />
            <p className="text-xs font-semibold text-slate-700">현재 플레이스 순위</p>
          </div>
          <div className="space-y-2">
            {[
              { kw: '용산 떡볶이', rank: 4, target: 1 },
              { kw: '삼각지 떡볶이', rank: 2, target: 1 },
              { kw: '용산역 맛집', rank: 11, target: 5 },
            ].map(r => (
              <div key={r.kw} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 text-xs">{r.kw}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-800">{r.rank}위</span>
                  <span className="text-xs text-slate-400">→ 목표 {r.target}위</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 알고리즘 요소 점수 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">상위노출 알고리즘 요소 분석</h3>
          <div className="space-y-4">
            {ALGO_FACTORS.map(f => <ScoreBar key={f.name} factor={f} />)}
          </div>
        </div>

        {/* 체크리스트 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">플레이스 최적화 체크리스트</h3>
          <div className="space-y-2">
            {checklist.map((cat, ci) => (
              <ChecklistCategory
                key={cat.category}
                cat={cat}
                open={!!openCats[cat.category]}
                onToggle={() => toggleCat(cat.category)}
                onToggleItem={(ii) => toggleItem(ci, ii)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* AI 전략 질문 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <MapPin size={16} className="text-red-600" />
          <h3 className="font-semibold text-slate-800">네이버플레이스 전략 AI</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">현선이네 상위노출 전략을 물어보세요</p>

        <div className="flex gap-2 mb-3">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
            placeholder="예: 리뷰 수를 빠르게 늘리는 방법은?"
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {loading ? '분석 중...' : '전략 요청'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_Q.map(q => (
            <button key={q} onClick={() => ask(q)} disabled={loading}
              className="px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition-colors">
              {q}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-8 text-slate-500 text-sm">
            <Loader2 size={18} className="animate-spin text-red-600" />
            네이버플레이스 전략을 분석하고 있습니다...
          </div>
        )}

        {answer && !loading && (
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{answer}</p>
          </div>
        )}
      </div>
    </div>
  )
}
