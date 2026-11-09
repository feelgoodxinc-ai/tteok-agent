import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LineChart, Play, Loader2, CheckCircle2, XCircle, Clock, Copy, Download, History, Trash2, Send, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { ANALYSTS, RISK, CIO, runTeam, askCio } from '../lib/investTeam.js'
import { estimateCost, addUsage, MODEL } from '../lib/claudeClient.js'

const PROFILE_KEY = 'invest_profile'
const REPORTS_KEY = 'invest_reports'
const MAX_REPORTS = 30

const COLORS = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  slate: 'border-slate-300 bg-slate-100 text-slate-800',
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장 공간 부족 등 무시 */ }
}

function todayKST() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function Md({ children }) {
  return (
    <div className="prose-report text-sm text-slate-700 leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={15} className="animate-spin text-red-600" />
  if (status === 'done') return <CheckCircle2 size={15} className="text-green-600" />
  if (status === 'error') return <XCircle size={15} className="text-red-500" />
  return <Clock size={15} className="text-slate-300" />
}

function Sources({ sources }) {
  if (!sources?.length) return null
  return (
    <details className="mt-3 text-xs text-slate-500">
      <summary className="cursor-pointer flex items-center gap-1"><Link2 size={12} />참고 출처 {sources.length}건</summary>
      <ul className="mt-2 space-y-1">
        {sources.map(s => (
          <li key={s.url} className="truncate">
            <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-red-600 underline">{s.title || s.url}</a>
            {s.age && <span className="text-slate-400"> · {s.age}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

function AgentCard({ agent, state, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const status = state?.status || 'idle'
  useEffect(() => { if (status === 'done' && defaultOpen) setOpen(true) }, [status, defaultOpen])
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => state?.text && setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <span className={`w-9 h-9 rounded-lg border flex items-center justify-center text-lg ${COLORS[agent.color]}`}>{agent.icon}</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">{agent.name}</p>
            <p className="text-xs text-slate-400">{agent.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon status={status} />
          {state?.text && (open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />)}
        </div>
      </button>
      {open && state?.text && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
          {status === 'error' ? <p className="text-sm text-red-600">{state.text}</p> : <Md>{state.text}</Md>}
          <Sources sources={state.sources} />
        </div>
      )}
    </div>
  )
}

function toMarkdown(report) {
  const parts = [report.cio, '\n\n---\n\n# 부록: 팀 보고서']
  report.analysts.forEach(a => parts.push(`\n\n## ${a.name}\n\n${a.text}`))
  if (report.risk) parts.push(`\n\n## 리스크 매니저\n\n${report.risk}`)
  if (report.sources?.length) parts.push('\n\n## 출처\n\n' + report.sources.map(s => `- [${s.title || s.url}](${s.url})`).join('\n'))
  return parts.join('')
}

function FollowUp({ report, onUsage }) {
  const [history, setHistory] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const ask = async () => {
    const text = q.trim()
    if (!text || loading) return
    setQ('')
    setLoading(true)
    const prior = history
    setHistory(h => [...h, { role: 'user', content: text }])
    try {
      const res = await askCio(report, prior, text)
      onUsage(res.usage)
      setHistory(h => [...h, { role: 'assistant', content: res.text }])
    } catch (e) {
      setHistory(h => [...h, { role: 'assistant', content: `오류: ${e.message}` }])
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm font-semibold text-slate-800 mb-3">🧭 CIO에게 후속 질문</p>
      <div className="space-y-3 mb-3">
        {history.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-sm font-medium text-slate-800' : 'bg-slate-50 rounded-lg p-4'}>
            {m.role === 'user' ? `Q. ${m.content}` : <Md>{m.content}</Md>}
          </div>
        ))}
        {loading && <Loader2 size={16} className="animate-spin text-red-600" />}
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && ask()}
          placeholder="예: 반도체 비중을 줄여야 할 신호는 뭐야?"
          disabled={loading}
          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <button onClick={ask} disabled={loading || !q.trim()} className="bg-slate-800 text-white p-2.5 rounded-xl hover:bg-slate-900 disabled:opacity-50">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

export default function InvestmentTeam() {
  const [profile, setProfile] = useState(() => load(PROFILE_KEY, {
    market: 'KR', risk: '중립', horizon: '스윙(수주~수개월)', holdings: '', watchlist: '',
  }))
  const [date, setDate] = useState(todayKST())
  const [memo, setMemo] = useState('')
  const [reports, setReports] = useState(() => load(REPORTS_KEY, []))
  const [agentState, setAgentState] = useState({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => save(PROFILE_KEY, profile), [profile])
  useEffect(() => save(REPORTS_KEY, reports), [reports])

  const set = (k) => (e) => setProfile(p => ({ ...p, [k]: e.target.value }))
  const hasPortfolio = Boolean(profile.holdings.trim() || profile.watchlist.trim())
  const activeAnalysts = ANALYSTS.filter(a => !a.optional || hasPortfolio)

  const start = async () => {
    if (running) return
    setRunning(true)
    setError('')
    setCurrent(null)
    setAgentState({})
    const previousReport = reports.find(r => r.date < date && r.market === profile.market)
    try {
      const result = await runTeam(
        { ...profile, date, memo, previousReport: previousReport ? { date: previousReport.date, text: previousReport.cio } : null },
        (id, patch) => setAgentState(s => ({ ...s, [id]: { ...s[id], ...patch } }))
      )
      const report = { id: Date.now(), date, market: profile.market, createdAt: new Date().toISOString(), memo, ...result }
      setCurrent(report)
      setReports(rs => [report, ...rs.filter(r => !(r.date === date && r.market === profile.market))].slice(0, MAX_REPORTS))
    } catch (e) {
      setError(e.message)
    }
    setRunning(false)
  }

  const openReport = (r) => {
    setCurrent(r)
    const s = {}
    r.analysts.forEach(a => { s[a.id] = a })
    s[RISK.id] = { status: r.risk ? 'done' : 'error', text: r.risk || '검토 실패' }
    s[CIO.id] = { status: 'done', text: r.cio }
    setAgentState(s)
    window.scrollTo?.({ top: 0 })
  }

  const addFollowUsage = (u) => {
    setCurrent(c => {
      if (!c) return c
      const next = { ...c, usage: addUsage(c.usage, u) }
      setReports(rs => rs.map(r => (r.id === next.id ? next : r)))
      return next
    })
  }

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(current))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([toMarkdown(current)], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `market-report-${current.market}-${current.date}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
      {/* Left: 설정 + 히스토리 */}
      <div className="space-y-5">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <LineChart size={18} className="text-red-600" />
            <h3 className="font-semibold text-slate-800">장 마감 분석 브리핑</h3>
          </div>
          <p className="text-xs text-slate-400 mb-2">애널리스트 {activeAnalysts.length}인 병렬 리서치 → 리스크 매니저 검증 → CIO 종합</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">오닐 · CAN SLIM / 분산일 / 손절 -7~8%</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">드러켄밀러 · 유동성 / 18개월 / 확신 베팅</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">시장
                <select value={profile.market} onChange={set('market')} className={inputCls}>
                  <option value="KR">한국 (코스피·코스닥)</option>
                  <option value="US">미국 (S&P·나스닥)</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">기준일
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
              </label>
              <label className="text-xs text-slate-500">투자 성향
                <select value={profile.risk} onChange={set('risk')} className={inputCls}>
                  <option>보수</option><option>중립</option><option>공격</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">투자 기간
                <select value={profile.horizon} onChange={set('horizon')} className={inputCls}>
                  <option>단기(수일)</option><option>스윙(수주~수개월)</option><option>중장기(1년+)</option>
                </select>
              </label>
            </div>
            <label className="block text-xs text-slate-500">보유 종목 <span className="text-slate-300">(종목 / 비중 / 평단 — 선택)</span>
              <textarea rows={3} value={profile.holdings} onChange={set('holdings')} placeholder={'삼성전자 30% 평단 68,000\nSK하이닉스 20%\nKODEX 200 15%'} className={inputCls} />
            </label>
            <label className="block text-xs text-slate-500">관심 종목
              <input value={profile.watchlist} onChange={set('watchlist')} placeholder="한화에어로스페이스, 알테오젠, NVDA" className={inputCls} />
            </label>
            <label className="block text-xs text-slate-500">오늘 내 관찰 메모 <span className="text-slate-300">(선택)</span>
              <textarea rows={2} value={memo} onChange={e => setMemo(e.target.value)} placeholder="장 막판 외국인 선물 매도 급증, 2차전지 반등 의문" className={inputCls} />
            </label>
            <button
              onClick={start}
              disabled={running}
              className="w-full bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? '팀 분석 진행 중... (수 분 소요)' : '장 마감 분석 시작'}
            </button>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              모델 {MODEL} · 웹 검색으로 실시간 데이터 수집 · 1회 실행 예상 비용 약 $0.5~1.5 (검색량에 따라 변동). 설정은 이 브라우저에만 저장됩니다.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">리포트 아카이브</h3>
            <span className="text-xs text-slate-400">최근 {MAX_REPORTS}건</span>
          </div>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-400">아직 저장된 리포트가 없습니다. 다음 날 실행 시 전일 전망을 자동으로 복기합니다.</p>
          ) : (
            <ul className="space-y-1 max-h-80 overflow-y-auto">
              {reports.map(r => (
                <li key={r.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${current?.id === r.id ? 'bg-red-50 text-red-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                  <button onClick={() => openReport(r)} className="flex-1 text-left">
                    {r.date} <span className="text-xs text-slate-400">{r.market === 'US' ? '미국' : '한국'}</span>
                  </button>
                  <button onClick={() => setReports(rs => rs.filter(x => x.id !== r.id))} className="text-slate-300 hover:text-red-500" title="삭제">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right: 팀 진행 + 리포트 */}
      <div className="space-y-4 min-w-0">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">{error}</div>}

        {(running || Object.keys(agentState).length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 px-1">1단계 · 애널리스트 리서치 (병렬)</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
              {activeAnalysts.map(a => <AgentCard key={a.id} agent={a} state={agentState[a.id]} />)}
            </div>
            <p className="text-xs font-semibold text-slate-500 px-1 pt-2">2단계 · 검증</p>
            <AgentCard agent={RISK} state={agentState[RISK.id]} />
          </div>
        )}

        {current ? (
          <>
            <div className="bg-white rounded-xl border-2 border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-800 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{CIO.icon}</span>
                  <p className="text-sm font-semibold">3단계 · CIO 최종 리포트</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={copy} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-700"><Copy size={13} />{copied ? '복사됨' : '복사'}</button>
                  <button onClick={download} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-700"><Download size={13} />.md</button>
                </div>
              </div>
              <div className="p-6">
                <Md>{current.cio}</Md>
                <Sources sources={current.sources} />
                <p className="mt-4 text-[11px] text-slate-400">
                  토큰 입력 {current.usage.input.toLocaleString()} / 출력 {current.usage.output.toLocaleString()} · 웹 검색 {current.usage.searches}회 · 추정 비용 ${estimateCost(current.usage).toFixed(2)}
                </p>
              </div>
            </div>
            <FollowUp key={current.id} report={current} onUsage={addFollowUsage} />
          </>
        ) : running ? (
          <AgentCard agent={CIO} state={agentState[CIO.id]} />
        ) : Object.keys(agentState).length === 0 && (
          <div className="bg-white rounded-xl p-14 border border-slate-200 text-center text-slate-400">
            <LineChart size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">장 마감 후 '분석 시작'을 누르면 투자전략 팀이 브리핑을 작성합니다.</p>
            <p className="text-xs mt-2 text-slate-300 leading-relaxed">
              오닐의 시장 방향(M)·주도주 규율과 드러켄밀러의 유동성·확신 베팅 관점으로<br />
              애널리스트가 동시에 조사하고, 리스크 매니저 검증 후 CIO가 내일 전략을 정리합니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
