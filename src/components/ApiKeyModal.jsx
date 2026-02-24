import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  const handleSave = () => {
    const trimmed = key.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setError('올바른 API 키 형식이 아닙니다. (sk-ant-... 로 시작해야 합니다)')
      return
    }
    onSave(trimmed)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🌶️</span>
          <div>
            <h1 className="font-bold text-lg text-slate-800">떡볶이 전략 AI 에이전트</h1>
            <p className="text-xs text-slate-500">Powered by Claude AI</p>
          </div>
        </div>

        <div className="mb-5 p-4 bg-blue-50 rounded-xl text-xs text-slate-600 leading-relaxed space-y-1">
          <p className="font-semibold text-slate-700">Anthropic API 키를 입력해주세요.</p>
          <p>· 키는 이 브라우저에만 저장되며 외부 서버로 전송되지 않습니다.</p>
          <p>· 발급처: <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline font-medium">console.anthropic.com</a></p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => { setKey(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="sk-ant-api03-..."
              autoFocus
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm pr-11 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={!key}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
