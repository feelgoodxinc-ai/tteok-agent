import { useState } from 'react'
import { Star, FileText, Users, Send, Loader2, Copy, Check, MessageSquare } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const REVIEW_MONTHLY = [
  { month: '11월', target: 25, actual: 18 },
  { month: '12월', target: 25, actual: 22 },
  { month: '1월', target: 28, actual: 19 },
  { month: '2월', target: 28, actual: 24 },
  { month: '3월', target: 30, actual: 31 },
  { month: '4월', target: 30, actual: 28 },
]

const REVIEW_TYPES = [
  { type: '영수증 리뷰', count: 158, pct: 56, color: '#DC2626', desc: '결제 후 자동 노출 — 전환율 향상의 핵심' },
  { type: '방문자 리뷰', count: 89, pct: 31, color: '#F97316', desc: '텍스트+사진 상세 리뷰 — 알고리즘 가점' },
  { type: '블로그 리뷰', count: 37, pct: 13, color: '#22C55E', desc: '네이버 블로그 연동 — 검색 노출 효과' },
]

const REPLY_TEMPLATES = [
  {
    case: '칭찬 리뷰 (긍정적)',
    template: `안녕하세요, 현선이네입니다 😊
따뜻하게 방문해주셔서 진심으로 감사드립니다.
맛있게 드셨다니 너무 기쁘네요! 저희 {메뉴명}을 사랑해주셔서 감사합니다.
다음에도 또 찾아주시면 더욱 맛있게 모시겠습니다. 감사합니다! 🌶️`,
  },
  {
    case: '불만 리뷰 (개선 요청)',
    template: `안녕하세요, 현선이네입니다.
불편하셨던 점을 솔직하게 말씀해주셔서 감사합니다.
{불만사항}에 대해 정말 죄송하게 생각하며, 말씀하신 부분 즉시 개선하겠습니다.
다음 방문 시에는 더 나은 모습으로 보답하겠습니다. 꼭 다시 찾아주세요.`,
  },
  {
    case: '별점만 있는 리뷰',
    template: `안녕하세요, 현선이네입니다 🙏
소중한 리뷰 감사드립니다!
다음 방문에서도 맛과 서비스 모두 만족드릴 수 있도록 최선을 다하겠습니다.
또 찾아주세요 😊`,
  },
  {
    case: '재방문 리뷰',
    template: `안녕하세요, 현선이네입니다!
항상 찾아주시는 단골 고객이시군요 😍
저희를 이렇게 사랑해주셔서 정말 감사드립니다.
{단골 혜택}으로 작은 감사의 마음 전해드릴게요. 다음에도 꼭 오세요!`,
  },
]

const BLOG_PLAN = [
  { week: '1주차', topic: '"용산 떡볶이 맛집" 리뷰', keyword: '용산 떡볶이', type: '방문 후기', status: 'done' },
  { week: '2주차', topic: '"즉석 떡볶이 맛집 이태원" 후기', keyword: '이태원 떡볶이', type: '방문 후기', status: 'done' },
  { week: '3주차', topic: '현선이네 대표 메뉴 총정리', keyword: '용산 분식', type: '메뉴 소개', status: 'done' },
  { week: '4주차', topic: '"삼각지 떡볶이 맛집" 주말 점심', keyword: '삼각지 떡볶이', type: '방문 후기', status: 'in_progress' },
  { week: '5주차', topic: '혼밥하기 좋은 용산 맛집', keyword: '용산역 맛집', type: '기획 콘텐츠', status: 'pending' },
  { week: '6주차', topic: '친구들과 가기 좋은 이태원 분식집', keyword: '이태원 맛집', type: '기획 콘텐츠', status: 'pending' },
]

const INFLUENCER_TIERS = [
  { tier: '마이크로 (팔로워 1~5만)', count: 3, budget: '식사 제공', effect: '블로그 포스팅 3건', roi: '높음' },
  { tier: '미들 (팔로워 5~20만)', count: 1, budget: '20~50만원', effect: '릴스/숏츠 1건', roi: '중간' },
  { tier: '체험단 (네이버)', count: 5, budget: '식사 제공', effect: '블로그 포스팅 5건', roi: '최고' },
]

const QUICK_Q = [
  '리뷰 답글을 어떻게 작성해야 알고리즘에 유리해?',
  '한 달에 리뷰 30개 이상 받는 방법은?',
  '네이버 블로그 체험단 모집하는 방법은?',
  '부정적인 리뷰 어떻게 대응해야 해?',
  '영수증 리뷰 유도하는 오프라인 방법은?',
  '블로그 포스팅 SEO 최적화 방법은?',
]

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? '복사됨' : '복사'}
    </button>
  )
}

export default function ReviewStrategy() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('overview')

  const ask = async (q) => {
    const text = (q || question).trim()
    if (!text || loading) return
    setQuestion('')
    setLoading(true)
    try {
      const reply = await callClaude([{ role: 'user', content: text }], 'review', 2000)
      setAnswer(reply)
    } catch (e) {
      setAnswer(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  const currentMonth = REVIEW_MONTHLY[REVIEW_MONTHLY.length - 1]
  const achieveRate = Math.round((currentMonth.actual / currentMonth.target) * 100)

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '이번 달 리뷰', value: `${currentMonth.actual}건`, sub: `목표 ${currentMonth.target}건 (${achieveRate}% 달성)`, icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: '누적 총 리뷰', value: '284건', sub: '전월 대비 +28건', icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: '이번 달 블로그', value: '11건', sub: '월 목표 10건 달성 ✓', icon: FileText, color: 'text-green-500', bg: 'bg-green-50' },
          { label: '체험단 운영', value: '9명', sub: '이번 달 협업 진행 중', icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
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
            { key: 'overview', label: '리뷰 현황' },
            { key: 'reply', label: '답글 템플릿' },
            { key: 'blog', label: '블로그 계획' },
            { key: 'influencer', label: '체험단·인플루언서' },
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
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* 월별 달성률 */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">월별 리뷰 목표 달성률</h4>
                <div className="grid grid-cols-6 gap-2">
                  {REVIEW_MONTHLY.map(m => {
                    const rate = Math.round((m.actual / m.target) * 100)
                    return (
                      <div key={m.month} className="text-center">
                        <div className="bg-slate-100 rounded-lg h-24 flex flex-col justify-end overflow-hidden relative">
                          <div
                            className={`w-full rounded-lg transition-all ${rate >= 100 ? 'bg-green-400' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ height: `${Math.min(rate, 100)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">{rate}%</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{m.month}</p>
                        <p className="text-xs font-medium text-slate-700">{m.actual}건</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 리뷰 유형 */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">리뷰 유형 분석</h4>
                <div className="space-y-3">
                  {REVIEW_TYPES.map(r => (
                    <div key={r.type} className="flex items-center gap-3">
                      <span className="text-sm text-slate-700 w-28">{r.type}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.color }} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 w-10 text-right">{r.count}건</span>
                      <span className="text-xs text-slate-400 w-6">{r.pct}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {REVIEW_TYPES.map(r => (
                    <div key={r.type} className="flex items-start gap-2 text-xs text-slate-500">
                      <div className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: r.color }} />
                      <span><span className="font-medium text-slate-600">{r.type}</span>: {r.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 유도 전략 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-700 mb-2">📌 영수증 리뷰 유도 오프라인 전략</p>
                <div className="space-y-1.5 text-xs text-amber-800">
                  {[
                    '계산대 옆 QR코드 스탠드: "리뷰 남기고 다음 방문 시 음료 무료!"',
                    '영수증 하단에 "네이버 리뷰 부탁드립니다 🙏" 문구 인쇄',
                    '테이블 텐트에 리뷰 안내 + 혜택 표시',
                    '포장 봉투에 "리뷰 이벤트" 스티커 부착',
                  ].map((tip, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">{i + 1}.</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'reply' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">리뷰 답글은 알고리즘 가점 + 고객 신뢰도 향상 — 모든 리뷰에 48시간 이내 답변을 목표로 하세요</p>
              {REPLY_TEMPLATES.map(t => (
                <div key={t.case} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-700">{t.case}</span>
                    <CopyButton text={t.template} />
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{t.template}</p>
                  </div>
                </div>
              ))}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
                <p className="font-semibold mb-1">💡 답글 작성 팁</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>{'{'} {'}'} 안의 내용은 각 리뷰에 맞게 개인화해서 작성하세요</li>
                  <li>이모지를 적절히 활용하면 친근감 UP</li>
                  <li>가게 이름("현선이네입니다")으로 시작하면 신뢰도 향상</li>
                  <li>불만 리뷰는 공개 답글 후 별도 DM으로 추가 응대 권장</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'blog' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-2">블로그 포스팅은 매주 1~2건 목표 — 키워드를 제목과 본문 첫 문단에 포함하는 것이 SEO 핵심입니다</p>
              <div className="space-y-2">
                {BLOG_PLAN.map((p, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    p.status === 'done' ? 'border-green-200 bg-green-50' :
                    p.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
                    'border-slate-200 bg-white'
                  }`}>
                    <span className={`text-xs font-bold w-12 ${
                      p.status === 'done' ? 'text-green-600' :
                      p.status === 'in_progress' ? 'text-blue-600' :
                      'text-slate-400'
                    }`}>
                      {p.status === 'done' ? '완료' : p.status === 'in_progress' ? '진행중' : p.week}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{p.topic}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{p.type}</span>
                        <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{p.keyword}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs text-green-800">
                <p className="font-semibold mb-1">📝 블로그 SEO 최적화 체크리스트</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>제목에 타겟 키워드 포함 (예: "용산 떡볶이 맛집 현선이네")</li>
                  <li>첫 문단 2~3줄 내에 키워드 자연스럽게 삽입</li>
                  <li>사진 5장 이상 + 사진 설명(alt)에 키워드 포함</li>
                  <li>네이버플레이스 지도 링크 본문 내 삽입</li>
                  <li>포스팅 길이 1,500자 이상 권장</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'influencer' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">체험단과 인플루언서 협업은 블로그 포스팅을 빠르게 늘리는 가장 효과적인 방법입니다</p>
              <div className="space-y-3">
                {INFLUENCER_TIERS.map(t => (
                  <div key={t.tier} className="p-4 rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">{t.tier}</p>
                        <div className="flex gap-3 text-xs text-slate-500">
                          <span>예산: <span className="text-slate-700 font-medium">{t.budget}</span></span>
                          <span>효과: <span className="text-slate-700 font-medium">{t.effect}</span></span>
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        t.roi === '최고' ? 'bg-green-100 text-green-700' :
                        t.roi === '높음' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        ROI {t.roi}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-xs text-purple-800">
                <p className="font-semibold mb-2">🎯 네이버 플레이스 체험단 모집 방법</p>
                <div className="space-y-1.5">
                  {[
                    '네이버 카페 "강남맛집", "서울맛집" 등에 체험단 모집 공고',
                    '인스타그램 스토리로 "체험단 모집" 게시 (DM 신청)',
                    '레뷰(revu.net), 미블(mble.kr) 등 체험단 플랫폼 활용',
                    '조건: 네이버 블로그 이웃 500명 이상 + 포스팅 월 4건 이상',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">{i + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI 리뷰 전략 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <Star size={16} className="text-red-600" />
          <h3 className="font-semibold text-slate-800">AI 리뷰·블로그 전략 분석</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">리뷰 유도, 답글 작성, 블로그 전략을 AI에게 물어보세요</p>

        <div className="flex gap-2 mb-3">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
            placeholder="예: 리뷰 한 달에 30개 받는 방법은?"
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
            리뷰 전략을 분석하고 있습니다...
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
