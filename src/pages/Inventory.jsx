import { useState } from 'react'
import { Package, AlertTriangle, CheckCircle, Send, Loader2 } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const initialItems = [
  { id: 1, name: '오리지널 떡볶이', sku: 'TBK-001', stock: 145, min: 50, cost: 8500, status: 'ok' },
  { id: 2, name: '매운맛 떡볶이', sku: 'TBK-002', stock: 88, min: 50, cost: 9000, status: 'ok' },
  { id: 3, name: '치즈 떡볶이', sku: 'TBK-003', stock: 62, min: 50, cost: 9500, status: 'ok' },
  { id: 4, name: '로제 떡볶이', sku: 'TBK-004', stock: 23, min: 50, cost: 10000, status: 'warning' },
  { id: 5, name: '짜장 떡볶이', sku: 'TBK-005', stock: 15, min: 50, cost: 9800, status: 'critical' },
]

function StatusBadge({ status }) {
  if (status === 'ok') return <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} />정상</span>
  if (status === 'warning') return <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><AlertTriangle size={12} />주의</span>
  return <span className="flex items-center gap-1 text-red-600 text-xs font-semibold"><AlertTriangle size={12} />긴급발주</span>
}

export default function Inventory() {
  const [items] = useState(initialItems)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async () => {
    setLoading(true)
    const text = items.map(i => `${i.name} (${i.sku}): 재고 ${i.stock}개, 최소 ${i.min}개, 단가 ${i.cost.toLocaleString()}원`).join('\n')
    try {
      const result = await callClaude([{ role: 'user', content: `떡볶이 밀키트 재고 현황을 분석해주세요:\n\n${text}\n\n1. 긴급 발주 필요 품목과 발주량\n2. 재고 최적화 방안\n3. 공급망 리스크와 대응책\n4. 월별 발주 스케줄 제안` }], 'inventory')
      setAnalysis(result)
    } catch (e) {
      setAnalysis(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  const counts = { warning: items.filter(i => i.status === 'warning').length, critical: items.filter(i => i.status === 'critical').length }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <p className="text-xs text-slate-500">전체 SKU</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{items.length}개</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
          <p className="text-xs text-amber-700">주의 품목</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{counts.warning}개</p>
        </div>
        <div className="bg-red-50 rounded-xl p-5 border border-red-200">
          <p className="text-xs text-red-700">긴급 발주 필요</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{counts.critical}개</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={17} className="text-red-600" />
            <h3 className="text-sm font-semibold text-slate-800">재고 현황</h3>
          </div>
          <button onClick={handleAnalyze} disabled={loading}
            className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            AI 재고 최적화 분석
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['제품명', 'SKU', '현재 재고', '최소 재고', '단가', '상태'].map((h, i) => (
                <th key={h} className={`px-5 py-3 text-xs font-medium text-slate-500 ${i < 2 ? 'text-left' : i === 5 ? 'text-center' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className={item.status === 'critical' ? 'bg-red-50' : item.status === 'warning' ? 'bg-amber-50' : ''}>
                <td className="px-5 py-3.5 font-medium text-slate-800">{item.name}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">{item.sku}</td>
                <td className="px-5 py-3.5 text-right font-medium">{item.stock}개</td>
                <td className="px-5 py-3.5 text-right text-slate-500">{item.min}개</td>
                <td className="px-5 py-3.5 text-right">{item.cost.toLocaleString()}원</td>
                <td className="px-5 py-3.5"><div className="flex justify-center"><StatusBadge status={item.status} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis && (
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-3">AI 재고 최적화 분석</h3>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{analysis}</div>
        </div>
      )}
    </div>
  )
}
