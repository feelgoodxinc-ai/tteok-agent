import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import ApiKeyModal from './components/ApiKeyModal.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SalesMarketing from './pages/SalesMarketing.jsx'
import Inventory from './pages/Inventory.jsx'
import CompetitorAnalysis from './pages/CompetitorAnalysis.jsx'
import AIAgent from './pages/AIAgent.jsx'

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '')

  const saveKey = (key) => {
    localStorage.setItem('claude_api_key', key)
    setApiKey(key)
  }

  const clearKey = () => {
    localStorage.removeItem('claude_api_key')
    setApiKey('')
  }

  return (
    <HashRouter>
      {!apiKey && <ApiKeyModal onSave={saveKey} />}
      <div className={`flex h-screen bg-slate-50 overflow-hidden ${!apiKey ? 'blur-sm pointer-events-none select-none' : ''}`}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onChangeKey={clearKey} />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/sales" element={<SalesMarketing />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/competitor" element={<CompetitorAnalysis />} />
              <Route path="/agent" element={<AIAgent />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
