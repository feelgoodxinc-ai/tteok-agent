import { useState } from 'react'
import { Search, Plus, Trash2, Send, Loader2 } from 'lucide-react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { callClaude } from '../lib/anthropic.js'

const defaultCompetitors = [
  { id: 1, name: '맛있는떡볶이', price: 12900, rating: 4.2, reviews: 1250, channels: '인스타, 쿠팡' },
  { id: 2, name: '집에서떡볶이', price: 11500, rating: 4.5, reviews: 3400, channels: '네이버, 마켓컬리' },
  { id: 3, name: '국민떡볶이키트', price: 14900, rating: 4.0, reviews: 890, channels: '쿠팡, 자사몰' },
]

const radarData = [
  { subject: '가격경쟁력', 우리: 75, 경쟁사: 70 },
  { subject: '브랜드인지도', 우리: 55, 경쟁사: 68 },
  { subject: '제품다양성', 우리: 80, 경쟁사: 65 },
  { subject: '고객평점', 우리: 72, 경쟁사: 75 },
  { subject: '마케팅', 우리: 60, 경쟁사: 72 },
  { subject: '배송속도', 우리: 85, 경쟁사: 78 },
]

const blank = { name: '', price: '', rating: '', reviews: '', channels: '' }

export default function CompetitorAnalysis() {
  const [competitors, setCompetitors] = useState(defaultCompetitors)
  const [newComp, setNewComp] = useState(blank)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async () => {
    setLoading(true)
    const text = competitors.map(c => `${c.name}: 가격 ${Number(c.price).toLocaleString()}원, 평점 ${c.rating}, 리뷰 ${Number(c.reviews).toLocaleString()}개, 채널: ${c.channels}`).join('\n')
    try {
      const result = await callClaude([{ role: 'user', content: `떡볶이 밀키트 경쟁사 분석:\n\n[경쟁사]\n${text}\n\n[우리] 가격 9,900~13,900원, 평점 4.3, 리뷰 920개\n\n1. 강점·약점\n2. 포지셔닝 전략\n3. 차별화 방안\n4. 가격 전략` }], 'competitor')
      setAnalysis(result)
    } catch (e) {
      setAnalysis(`오류: ${e.message}`)
    }
    setLoading(false)
  }

  const add = () => {
    if (!newComp.name) return
    setCompetitors(p => [...p, { ...newComp, id: Date.now() }])
    setNewComp(blank)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Search size={17} className="text-red-600" />
              <h3 className="text-sm font-semibold text-slate-800">경쟁사 목록</h3>
            </div>
            <button onClick={handleAnalyze} disabled={loading}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}AI 분석
            </button>
          </div>
          <div className="space-y-2.5">
            {competitors.map((c) => (
              <div key={c.id} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{Number(c.price).toLocaleString()}원 · ⭐{c.rating} · 리뷰 {Number(c.reviews).toLocaleString()}개</p>
                  <p className="text-xs text-slate-400">{c.channels}</p>
                </div>
                <button onClick={() => setCompetitors(p => p.filter(x => x.id !== c.id))} className="text-slate-300 hover:text-red-500 p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-600 mb-2">경쟁사 추가</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[['name','브랜드명'],['price','가격(원)'],['rating','평점'],['reviews','리뷰수']].map(([k,p]) => (
                <input key={k} value={newComp[k]} onChange={e => setNewComp(x => ({...x,[k]:e.target.value}))} placeholder={p}
                  className="px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-400" />
              ))}
              <input value={newComp.channels} onChange={e => setNewComp(x => ({...x,channels:e.target.value}))} placeholder="판매채널"
                className="col-span-2 px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-400" />
            </div>
            <button onClick={add} className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 border border-dashed border-slate-300 rounded text-xs text-slate-500 hover:border-red-400 hover:text-red-500 transition-colors">
              <Plus size={12} />추가
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">경쟁력 비교 분석</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Radar name="우리" dataKey="우리" stroke="#DC2626" fill="#DC2626" fillOpacity={0.35} />
              <Radar name="경쟁사평균" dataKey="경쟁사" stroke="#94A3B8" fill="#94A3B8" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-600 opacity-70" />우리</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-400 opacity-70" />경쟁사 평균</div>
          </div>
        </div>
      </div>

      {analysis && (
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-3">AI 경쟁사 분석 결과</h3>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{analysis}</div>
        </div>
      )}
    </div>
  )
}
