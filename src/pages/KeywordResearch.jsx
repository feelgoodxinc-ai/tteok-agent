import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { Search, TrendingUp, Target, Send, Loader2, Tag } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const LOCAL_KEYWORDS = [
  { keyword: '용산 떡볶이', volume: 8400, competition: 72, cpc: 580, rank: 4, priority: 'top' },
  { keyword: '이태원 떡볶이', volume: 6200, competition: 68, cpc: 520, rank: 7, priority: 'top' },
  { keyword: '용산역 맛집', volume: 12100, competition: 85, cpc: 720, rank: 11, priority: 'high' },
  { keyword: '삼각지 떡볶이', volume: 3800, competition: 42, cpc: 380, rank: 2, priority: 'top' },
  { keyword: '이태원 맛집', volume: 18600, competition: 91, cpc: 980, rank: 15, priority: 'high' },
  { keyword: '용산 분식', volume: 4200, competition: 38, cpc: 340, rank: 3, priority: 'top' },
  { keyword: '한강진 맛집', volume: 2900, competition: 35, cpc: 310, rank: 8, priority: 'mid' },
  { keyword: '숙대입구 떡볶이', volume: 2100, competition: 28, cpc: 280, rank: 5, priority: 'mid' },
  { keyword: '용산구 떡볶이', volume: 1800, competition: 22, cpc: 240, rank: 2, priority: 'mid' },
  { keyword: '삼각지 맛집', volume: 3400, competition: 44, cpc: 360, rank: 6, priority: 'mid' },
]

const TREND_KEYWORDS = [
  { keyword: '즉석 떡볶이', volume: 21000, trend: '+34%', category: '메뉴 트렌드', hot: true },
  { keyword: '국물 떡볶이', volume: 15800, trend: '+28%', category: '메뉴 트렌드', hot: true },
  { keyword: '마라 떡볶이', volume: 9200, trend: '+41%', category: '메뉴 트렌드', hot: true },
  { keyword: '로제 떡볶이', volume: 12400, trend: '+19%', category: '메뉴 트렌드', hot: false },
  { keyword: '떡볶이 혼밥', volume: 7800, trend: '+22%', category: '소비 트렌드', hot: false },
  { keyword: '떡볶이 배달', volume: 31000, trend: '+8%', category: '소비 트렌드', hot: false },
  { keyword: '늦은밤 떡볶이', volume: 5400, trend: '+55%', category: '소비 트렌드', hot: true },
  { keyword: '점심 분식', volume: 8900, trend: '+14%', category: '소비 트렌드', hot: false },
]

const SEASON_KEYWORDS = [
  { season: '봄 (3~5월)', keywords: ['봄 소풍 떡볶이', '벚꽃 맛집', '따뜻한 국물 분식'], note: '피크닉 시즌 — 테이크아웃 강화' },
  { season: '여름 (6~8월)', keywords: ['시원한 떡볶이', '냉떡볶이', '여름 야식'], note: '냉면·아이스 메뉴 병행 검색 증가' },
  { season: '가을 (9~11월)', keywords: ['가을 분식', '야식 떡볶이', '단풍 맛집'], note: '배달 수요 및 야간 방문 증가' },
  { season: '겨울 (12~2월)', keywords: ['겨울 길거리음식', '따뜻한 분식', '연말 회식 분식'], note: '즉석 떡볶이 검색 40% 상승 시즌' },
]

const AD_STRATEGY = [
  {
    type: '즉시 집행 (ROI 높음)',
    color: 'border-green-200 bg-green-50',
    badge: 'bg-green-100 text-green-700',
    keywords: ['삼각지 떡볶이', '용산 분식', '용산구 떡볶이', '숙대입구 떡볶이'],
    reason: '경쟁 낮음 + 현재 상위권 → 저비용 광고로 1위 방어',
  },
  {
    type: '집중 공략 (성장 여지)',
    color: 'border-blue-200 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    keywords: ['용산 떡볶이', '이태원 떡볶이', '한강진 맛집'],
    reason: '검색량 높고 현재 4~8위 → 광고+리뷰 병행으로 상위노출 가능',
  },
  {
    type: '장기 투자 (고경쟁)',
    color: 'border-orange-200 bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
    keywords: ['용산역 맛집', '이태원 맛집'],
    reason: '검색량 최고지만 경쟁 치열 → 블로그+체험단 먼저 확보 후 광고',
  },
]

const volumeData = LOCAL_KEYWORDS.slice(0, 8).map(k => ({
  name: k.keyword.replace(/ /g, '\n'),
  volume: k.volume,
  competition: k.competition,
}))

const QUICK_Q = [
  '"용산 떡볶이" 1위를 위한 키워드 전략은?',
  '광고 예산 10만원으로 최대 효율 내는 방법은?',
  '경쟁이 적으면서 검색량 높은 롱테일 키워드 추천해줘',
  '계절별로 어떤 키워드를 공략해야 해?',
  '네이버 파워링크와 플레이스 광고 차이점은?',
]

const PRIORITY_STYLE = {
  top: 'bg-red-50 text-red-600 border border-red-200',
  high: 'bg-orange-50 text-orange-600 border border-orange-200',
  mid: 'bg-slate-50 text-slate-500 border border-slate-200',
}
const PRIORITY_LABEL = { top: '최우선', high: '우선', mid: '관찰' }

export default function KeywordResearch() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('local')

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || loading) return
    setQuestion('')
    setLoading(true)
    try {
      const reply = await callClaude([{ role: 'user', content: text }], 'keyword', 2000)
      setAnswer(reply)
    } catch (e) {
      setAnswer(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '추적 키워드 수', value: `${LOCAL_KEYWORDS.length}개`, sub: '로컬 키워드 기준', icon: Tag, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: '상위 5위 이내', value: '4개', sub: '삼각지·용산구·용산분식·삼각지분식', icon: Target, color: 'text-green-500', bg: 'bg-green-50' },
          { label: '최고 검색량', value: '18,600', sub: '이태원 맛집 (월 검색)', icon: Search, color: 'text-purple-500', bg: 'bg-purple-50' },
          { label: '트렌드 키워드', value: '3개 ↑', sub: '즉석·마라·늦은밤 HOT', icon: TrendingUp, color: 'text-red-500', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{s.label}</p>
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon size={14} className={s.color} />
              </div>
            </div>
            <p className="text-xl font-bold text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {[
            { key: 'local', label: '로컬 키워드' },
            { key: 'trend', label: '트렌드 키워드' },
            { key: 'season', label: '시즌 키워드' },
            { key: 'strategy', label: '광고 전략' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-red-50 text-red-600 border-b-2 border-red-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'local' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">키워드별 월간 검색량</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={volumeData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => [`${v.toLocaleString()}회`, '월 검색량']} />
                      <Bar dataKey="volume" fill="#DC2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">키워드 상세 현황</h4>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {LOCAL_KEYWORDS.map(kw => (
                      <div key={kw.keyword} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[kw.priority]}`}>
                          {PRIORITY_LABEL[kw.priority]}
                        </span>
                        <span className="text-sm text-slate-700 flex-1">{kw.keyword}</span>
                        <div className="text-right text-xs">
                          <p className="font-bold text-slate-800">{kw.rank}위</p>
                          <p className="text-slate-400">{kw.volume.toLocaleString()}/월</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'trend' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">현재 네이버에서 상승 중인 떡볶이 관련 트렌드 키워드 — 광고 및 블로그 콘텐츠에 빠르게 활용하세요</p>
              <div className="grid grid-cols-2 gap-3">
                {TREND_KEYWORDS.map(kw => (
                  <div key={kw.keyword} className={`p-4 rounded-xl border ${kw.hot ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {kw.hot && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">HOT</span>}
                        <span className="text-sm font-semibold text-slate-800">{kw.keyword}</span>
                      </div>
                      <span className="text-sm font-bold text-green-600">{kw.trend}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{kw.category}</span>
                      <span>월 {kw.volume.toLocaleString()}회</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'season' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">계절별 검색 트렌드에 맞춰 광고 키워드와 블로그 콘텐츠를 미리 준비하세요</p>
              {SEASON_KEYWORDS.map(s => (
                <div key={s.season} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-2">{s.season}</p>
                      <div className="flex flex-wrap gap-2">
                        {s.keywords.map(kw => (
                          <span key={kw} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">{kw}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 text-right w-40 flex-shrink-0">{s.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'strategy' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">키워드 경쟁 강도와 현재 플레이스 순위를 기반으로 광고 집행 우선순위를 제안합니다</p>
              {AD_STRATEGY.map(s => (
                <div key={s.type} className={`p-4 rounded-xl border ${s.color}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.badge}`}>{s.type}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {s.keywords.map(kw => (
                      <span key={kw} className="text-sm font-medium text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200">{kw}</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI 키워드 전략 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <Search size={16} className="text-red-600" />
          <h3 className="font-semibold text-slate-800">AI 키워드 전략 분석</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">로컬 키워드·광고 전략·트렌드 활용법을 AI에게 물어보세요</p>

        <div className="flex gap-2 mb-3">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
            placeholder="예: 광고 예산 10만원으로 최대 효율 내는 방법은?"
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {loading ? '분석 중...' : '분석'}
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
            키워드 전략을 분석하고 있습니다...
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
