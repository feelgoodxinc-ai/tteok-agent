import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { Star, Bookmark, Eye, FileText, TrendingUp, AlertCircle } from 'lucide-react'

const monthlyTrend = [
  { month: '11월', reviews: 18, saves: 62, blog: 4 },
  { month: '12월', reviews: 22, saves: 78, blog: 6 },
  { month: '1월', reviews: 19, saves: 71, blog: 5 },
  { month: '2월', reviews: 24, saves: 89, blog: 7 },
  { month: '3월', reviews: 31, saves: 104, blog: 9 },
  { month: '4월', reviews: 28, saves: 118, blog: 11 },
]

const keywordRankings = [
  { keyword: '용산 떡볶이', rank: 4, prev: 6, volume: '높음' },
  { keyword: '이태원 떡볶이', rank: 7, prev: 9, volume: '높음' },
  { keyword: '용산 분식', rank: 3, prev: 4, volume: '중간' },
  { keyword: '삼각지 떡볶이', rank: 2, prev: 3, volume: '중간' },
  { keyword: '용산역 맛집', rank: 11, prev: 14, volume: '매우높음' },
  { keyword: '이태원 맛집', rank: 15, prev: 18, volume: '매우높음' },
]

const competitors = [
  { name: '현선이네', reviews: 284, saves: 118, rating: 4.6, blog: 47 },
  { name: '경쟁A', reviews: 412, saves: 203, rating: 4.8, blog: 89 },
  { name: '경쟁B', reviews: 196, saves: 87, rating: 4.3, blog: 31 },
  { name: '경쟁C', reviews: 338, saves: 155, rating: 4.5, blog: 62 },
]

const radarData = [
  { subject: '리뷰 수', 현선이네: 58, 평균경쟁사: 75 },
  { subject: '별점', 현선이네: 92, 평균경쟁사: 87 },
  { subject: '저장 수', 현선이네: 55, 평균경쟁사: 72 },
  { subject: '블로그', 현선이네: 48, 평균경쟁사: 65 },
  { subject: '정보 완성도', 현선이네: 85, 평균경쟁사: 78 },
  { subject: '응답률', 현선이네: 70, 평균경쟁사: 55 },
]

const stats = [
  {
    label: '네이버플레이스 리뷰',
    value: '284개',
    sub: '이번 달 +28 (목표 30)',
    icon: Star,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    progress: 93,
    progressColor: 'bg-amber-400',
  },
  {
    label: 'MY플레이스 저장',
    value: '1,180개',
    sub: '이번 달 +118 (목표 150)',
    icon: Bookmark,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    progress: 79,
    progressColor: 'bg-blue-400',
  },
  {
    label: '블로그 포스팅',
    value: '47건',
    sub: '이번 달 +11 (목표 10) ✓',
    icon: FileText,
    color: 'text-green-500',
    bg: 'bg-green-50',
    progress: 100,
    progressColor: 'bg-green-400',
  },
  {
    label: '플레이스 조회수',
    value: '3,240회',
    sub: '전월 대비 +22.4%',
    icon: Eye,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    progress: 81,
    progressColor: 'bg-purple-400',
  },
]

const insights = [
  { icon: '🎯', text: '"용산 떡볶이" 키워드 순위가 6위→4위로 상승했습니다. 리뷰 10개 추가 시 3위 진입 가능성이 높습니다.' },
  { icon: '📸', text: '사진 등록 매장 대비 저장수가 평균 2.3배 높습니다. 메뉴 사진을 3장 이상 추가해 저장수를 늘리세요.' },
  { icon: '⚠️', text: '"용산역 맛집" 키워드 순위 11위로 상위 10위 진입까지 블로그 포스팅 5건이 필요합니다.' },
]

function RankBadge({ rank, prev }) {
  const diff = prev - rank
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-bold text-slate-800 text-sm">{rank}위</span>
      {diff > 0 ? (
        <span className="text-xs text-green-600 flex items-center gap-0.5">
          <TrendingUp size={11} />+{diff}
        </span>
      ) : diff < 0 ? (
        <span className="text-xs text-red-500">▼{Math.abs(diff)}</span>
      ) : (
        <span className="text-xs text-slate-400">-</span>
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="space-y-5">
      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon size={14} className={s.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1 mb-3">{s.sub}</p>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${s.progressColor}`}
                style={{ width: `${Math.min(s.progress, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 월별 트렌드 */}
        <div className="col-span-2 bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">월별 네이버플레이스 지표 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="reviews" name="리뷰 수" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="blog" name="블로그 포스팅" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            {[{ color: '#F59E0B', label: '리뷰 수' }, { color: '#22C55E', label: '블로그 포스팅' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* 경쟁사 레이더 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">경쟁사 대비 현황</h3>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="현선이네" dataKey="현선이네" stroke="#DC2626" fill="#DC2626" fillOpacity={0.25} />
              <Radar name="평균경쟁사" dataKey="평균경쟁사" stroke="#94A3B8" fill="#94A3B8" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center mt-1">
            {[{ color: '#DC2626', label: '현선이네' }, { color: '#94A3B8', label: '평균 경쟁사' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 키워드 순위 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">네이버플레이스 키워드 순위</h3>
          <div className="space-y-2.5">
            {keywordRankings.map((kw) => (
              <div key={kw.keyword} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <RankBadge rank={kw.rank} prev={kw.prev} />
                  <span className="text-sm text-slate-700">{kw.keyword}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  kw.volume === '매우높음' ? 'bg-red-50 text-red-600' :
                  kw.volume === '높음' ? 'bg-orange-50 text-orange-600' :
                  'bg-slate-50 text-slate-500'
                }`}>
                  검색량 {kw.volume}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 경쟁사 비교표 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">용산권 경쟁 매장 비교</h3>
          <div className="space-y-3">
            {competitors.map((c, i) => (
              <div key={c.name} className={`flex items-center gap-3 p-2.5 rounded-lg ${i === 0 ? 'bg-red-50 border border-red-100' : 'bg-slate-50'}`}>
                <span className={`text-xs font-bold w-16 ${i === 0 ? 'text-red-600' : 'text-slate-500'}`}>{c.name}</span>
                <div className="flex gap-3 text-xs text-slate-600 flex-1">
                  <span className="flex items-center gap-1"><Star size={10} className="text-amber-400" />{c.reviews}</span>
                  <span className="flex items-center gap-1"><Bookmark size={10} className="text-blue-400" />{c.saves}</span>
                  <span className="flex items-center gap-1"><FileText size={10} className="text-green-400" />{c.blog}</span>
                </div>
                <span className={`text-xs font-semibold ${c.rating >= 4.5 ? 'text-green-600' : 'text-slate-500'}`}>
                  ★ {c.rating}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
            <AlertCircle size={11} />
            아이콘 순서: 리뷰 수 · 저장 수 · 블로그 수
          </p>
        </div>
      </div>

      {/* AI 인사이트 */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 border border-red-100">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-red-600" />
          <h3 className="text-sm font-semibold text-slate-700">오늘의 상위노출 인사이트</h3>
          <span className="ml-auto text-xs text-slate-400">2026.04.26 기준</span>
        </div>
        <div className="space-y-2">
          {insights.map((item, i) => (
            <div key={i} className="bg-white rounded-lg px-4 py-2.5 text-sm text-slate-700 flex items-start gap-2.5">
              <span className="text-base leading-5">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
