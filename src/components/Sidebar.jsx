import { NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Package, Search, Bot } from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/sales', icon: TrendingUp, label: '매출·마케팅' },
  { to: '/inventory', icon: Package, label: '재고·공급망' },
  { to: '/competitor', icon: Search, label: '경쟁사 분석' },
  { to: '/agent', icon: Bot, label: 'AI 에이전트' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌶️</span>
          <div>
            <h1 className="font-bold text-sm">떡볶이 전략</h1>
            <p className="text-xs text-slate-400 mt-0.5">AI 에이전트</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">Powered by Claude AI</p>
      </div>
    </aside>
  )
}
