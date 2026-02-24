import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, Package, AlertTriangle, Bot } from 'lucide-react'

const monthlyRevenue = [
  { month: '1월', revenue: 820 }, { month: '2월', revenue: 910 },
  { month: '3월', revenue: 1150 }, { month: '4월', revenue: 1080 },
  { month: '5월', revenue: 1230 }, { month: '6월', revenue: 1310 },
  { month: '7월', revenue: 1190 }, { month: '8월', revenue: 1450 },
  { month: '9월', revenue: 1380 }, { month: '10월', revenue: 1520 },
  { month: '11월', revenue: 1680 }, { month: '12월', revenue: 1850 },
]

const productSales = [
  { name: '오리지널', sales: 320 },
  { name: '매운맛', sales: 280 },
  { name: '치즈', sales: 245 },
  { name: '로제', sales: 190 },
  { name: '짜장', sales: 145 },
]

const channelData = [
  { name: '인스타그램', value: 35 },
  { name: '네이버', value: 30 },
  { name: '카카오', value: 18 },
  { name: '배달앱', value: 12 },
  { name: '직접구매', value: 5 },
]

const COLORS = ['#DC2626', '#F97316', '#EAB308', '#22C55E', '#3B82F6']

const stats = [
  { label: '이번 달 매출', value: '1,850만원', sub: '전월 대비 +10.1%', icon: TrendingUp, color: 'text-green-500' },
  { label: '총 주문 수', value: '321건', sub: '전월 대비 +9.9%', icon: Package, color: 'text-blue-500' },
  { label: '재고 경고', value: '2개 품목', sub: '로제 · 짜장', icon: AlertTriangle, color: 'text-amber-500' },
  { label: 'AI 인사이트', value: '3개 제안', sub: '오늘 업데이트', icon: Bot, color: 'text-purple-500' },
]

export default function Dashboard() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <s.icon size={16} className={s.color} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">월별 매출 추이 (단위: 만원)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v.toLocaleString()}만원`, '매출']} />
              <Line type="monotone" dataKey="revenue" stroke="#DC2626" strokeWidth={2.5} dot={{ fill: '#DC2626', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">판매 채널 비중</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                {channelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v}%`]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {channelData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-medium text-slate-700">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">제품별 판매량 (이번 달)</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={productSales} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={55} />
            <Tooltip formatter={(v) => [`${v}개`, '판매량']} />
            <Bar dataKey="sales" fill="#DC2626" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 border border-red-100">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={16} className="text-red-600" />
          <h3 className="text-sm font-semibold text-slate-700">AI 오늘의 인사이트</h3>
        </div>
        <div className="space-y-2">
          {[
            '💡 로제 떡볶이 재고가 5일 이내 소진 예상됩니다. 긴급 발주를 권장합니다.',
            '📈 인스타그램 광고 ROI가 전월 대비 18% 상승했습니다. 예산 증액을 검토하세요.',
            '🎯 경쟁사 신제품 출시가 감지됐습니다. 경쟁사 분석 탭에서 상세 내용을 확인하세요.',
          ].map((msg, i) => (
            <div key={i} className="bg-white rounded-lg px-4 py-2.5 text-sm text-slate-700">{msg}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
