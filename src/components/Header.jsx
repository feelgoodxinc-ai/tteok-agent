import { useLocation } from 'react-router-dom'
import { Settings } from 'lucide-react'

const titles = {
  '/dashboard': '대시보드',
  '/naver-place': '네이버플레이스 최적화 전략',
  '/keywords': '키워드 분석 & 광고 전략',
  '/reviews': '리뷰·블로그 전략',
  '/expert': '전문가 회의',
  '/agent': 'AI 에이전트',
}

export default function Header({ onChangeKey }) {
  const { pathname } = useLocation()

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-800">{titles[pathname] || '대시보드'}</h2>
        <p className="text-xs text-slate-400 mt-0.5">현선이네 용산점 · 네이버플레이스 상위노출 전략</p>
      </div>
      <button
        onClick={onChangeKey}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        title="API 키 변경"
      >
        <Settings size={14} />
        API 키 변경
      </button>
    </header>
  )
}
