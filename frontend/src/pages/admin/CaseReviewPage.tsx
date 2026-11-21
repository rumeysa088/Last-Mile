// frontend/src/pages/admin/CaseReviewPage.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type CaseDetail } from '../../api/client'
import AIContextPanel from './components/AIContextPanel'

export default function CaseReviewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [c, setC] = useState<CaseDetail | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { api.getCase(id).then(setC) }, [id])

  async function decide(decision: 'approve' | 'reject' | 'request_info') {
    if (!reason.trim()) { setMsg('A reason is required.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await api.reviewCase(id, decision, reason.trim())
      setMsg(`Server confirmed: ${r.status}`)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  if (!c) return <div className="p-6">Loading…</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => nav('/admin/review')} className="text-sm text-blue-600 hover:underline">← Back to queue</button>
      <div className="bg-white p-6 rounded shadow">
        <h1 className="text-xl font-bold mb-1">{c.citizen_name}</h1>
        <div className="text-sm text-slate-500">{c.program_code} · submitted {new Date(c.submitted_at).toLocaleString()}</div>
      </div>

      <AIContextPanel detail={c} />

      <div className="bg-white p-6 rounded shadow">
        <h2 className="font-semibold mb-2">Decision</h2>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" className="w-full border rounded p-2 mb-3" rows={3} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => decide('approve')} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">Approve</button>
          <button disabled={busy} onClick={() => decide('reject')} className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50">Reject</button>
          <button disabled={busy} onClick={() => decide('request_info')} className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50">Request info</button>
        </div>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
      </div>
    </div>
  )
}