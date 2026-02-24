import { useState, useRef, useEffect } from 'react'
import { Bot, User, Send, Loader2, RotateCcw } from 'lucide-react'
import { callClaude } from '../lib/anthropic.js'

const INIT = [{ role: 'assistant', content: '안녕하세요! 저는 떡볶이 밀키트 사업 전문 AI 에이전트입니다. 🌶️\n\n매출 전략, 마케팅, 재고 관리, 경쟁사 분석 등 무엇이든 질문해주세요!' }]

const quickQ = ['이번 달 매출을 높이려면?', '인스타그램 마케팅 전략', '재구매율 올리는 방법', '재고 관리 효율화', '신제품 아이디어 추천', '경쟁사 대비 차별화 포인트']

export default function AIAgent() {
  const [messages, setMessages] = useState(INIT)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setLoading(true)
    try {
      const reply = await callClaude(next.map(m => ({ role: m.role, content: m.content })), 'general')
      setMessages(p => [...p, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(p => [...p, { role: 'assistant', content: `오류가 발생했습니다: ${e.message}` }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: 'calc(100vh - 112px)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
            <Bot size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">전략 AI 에이전트</p>
            <p className="text-xs text-green-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />온라인</p>
          </div>
        </div>
        <button onClick={() => setMessages(INIT)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><RotateCcw size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${msg.role === 'user' ? 'bg-slate-700' : 'bg-red-600'}`}>
              {msg.role === 'user' ? <User size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
            </div>
            <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
              msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center"><Bot size={13} className="text-white" /></div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3"><Loader2 size={15} className="animate-spin text-red-600" /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-5 py-2 border-t border-slate-100 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {quickQ.map((q) => (
            <button key={q} onClick={() => send(q)} disabled={loading}
              className="flex-shrink-0 px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-xs hover:bg-red-100 disabled:opacity-50 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="AI 에이전트에게 질문하세요..." disabled={loading}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="bg-red-600 text-white p-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
