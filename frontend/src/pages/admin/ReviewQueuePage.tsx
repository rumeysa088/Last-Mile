// frontend/src/pages/admin/ReviewQueuePage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type CaseSummary, type CaseStatus } from '../../api/client'

const STATUSES: CaseStatus[] = ['pending', 'info_needed', 'approved', 'rejected']

export default function ReviewQueuePage() {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [status, setStatus] = useState<CaseStatus>('pending')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.listCases({ status, q: q || undefined }).then(setCases).finally(() => setLoading(false))
  }, [status, q])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Review Queue</h1>
      <div className="flex gap-2 mb-4">
        <select value={status} onChange={e => setStatus(e.target.value as CaseStatus)} className="border rounded px-3 py-2">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search citizen name" className="border rounded px-3 py-2 flex-1" />
      </div>
      {loading ? <div>Loading…</div> : (
        <table className="w-full bg-white rounded shadow text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Citizen</th>
              <th className="p-3">Program</th>
              <th className="p-3">Route</th>
              <th className="p-3">AI confidence</th>
              <th className="p-3">Submitted</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.citizen_name}</td>
                <td className="p-3">{c.program_code}</td>
                <td className="p-3"><span className="px-2 py-1 bg-slate-200 rounded text-xs">{c.route ?? '—'}</span></td>
                <td className="p-3">{c.ai_confidence != null ? (c.ai_confidence * 100).toFixed(0) + '%' : '—'}</td>
                <td className="p-3 text-slate-500">{new Date(c.submitted_at).toLocaleString()}</td>
                <td className="p-3 text-right"><Link className="text-blue-600 hover:underline" to={`/admin/cases/${c.id}`}>Open</Link></td>
              </tr>
            ))}
            {cases.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No cases</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}