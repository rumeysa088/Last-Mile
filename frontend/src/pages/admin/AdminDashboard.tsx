// frontend/src/pages/admin/AdminDashboard.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, USE_MOCK, type CaseSummary } from '../../api/client'

export default function AdminDashboard() {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.listCases({ status: 'submitted' }).then(setCases).catch(e => setErr(String(e)))
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Officer / Admin Dashboard</h1>
        {USE_MOCK && <span className="text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded">MOCK MODE</span>}
      </div>
      {err && <div className="bg-red-100 text-red-800 p-3 rounded mb-4">{err}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/admin/review" className="block p-6 bg-white rounded-lg shadow hover:shadow-md">
          <div className="text-3xl font-bold">{cases.length}</div>
          <div className="text-slate-600">Pending cases</div>
        </Link>
        <Link to="/admin/rules" className="block p-6 bg-white rounded-lg shadow hover:shadow-md">
          <div className="text-3xl font-bold">Manage</div>
          <div className="text-slate-600">Eligibility rules</div>
        </Link>
        <div className="p-6 bg-white rounded-lg shadow">
          <div className="text-3xl font-bold">{cases.filter(c => (c.ai_confidence ?? 1) < 0.7).length}</div>
          <div className="text-slate-600">Low-confidence (needs human)</div>
        </div>
      </div>
    </div>
  )
}