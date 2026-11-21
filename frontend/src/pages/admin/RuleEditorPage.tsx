// frontend/src/pages/admin/RuleEditorPage.tsx
import { useEffect, useState } from 'react'
import { api, type RuleVersion } from '../../api/client'
import RuleVersionHistory from './RuleVersionHistory'

const PROGRAM = 'BISP-2026'

export default function RuleEditorPage() {
  const [history, setHistory] = useState<RuleVersion[]>([])
  const [draft, setDraft] = useState({ max_income_pkr: 50000, min_age: 18, requires_cnic: true })
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const reload = () => api.listRules(PROGRAM).then(setHistory)
  useEffect(() => { reload() }, [])

  async function saveDraft() {
    setMsg(null)
    try {
      const r = await api.createRuleDraft(PROGRAM, draft, notes || undefined)
      setMsg(`Draft v${r.version} created.`)
      setNotes('')
      reload()
    } catch (e) { setMsg(String(e)) }
  }

  async function publish(id: string) {
    setMsg(null)
    try {
      const r = await api.publishRule(id)
      setMsg(`Published v${r.version}. Earlier versions remain archived.`)
      reload()
    } catch (e) { setMsg(String(e)) }
  }

  const active = history.find(r => r.status === 'active')

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Eligibility Rule Editor</h1>
      {active && (
        <div className="bg-white p-4 rounded shadow text-sm">
          Active version: <b>v{active.version}</b> — {JSON.stringify(active.rules_json)}
        </div>
      )}
      <div className="bg-white p-6 rounded shadow space-y-3">
        <h2 className="font-semibold">Create new draft</h2>
        <p className="text-xs text-slate-500">Publishing a draft makes it the active version; earlier versions stay intact for audit.</p>
        <label className="block text-sm">Max income (PKR)
          <input type="number" value={draft.max_income_pkr} onChange={e => setDraft({ ...draft, max_income_pkr: Number(e.target.value) })} className="block border rounded px-2 py-1 w-full" />
        </label>
        <label className="block text-sm">Min age
          <input type="number" value={draft.min_age} onChange={e => setDraft({ ...draft, min_age: Number(e.target.value) })} className="block border rounded px-2 py-1 w-full" />
        </label>
        <label className="block text-sm">Requires CNIC
          <input type="checkbox" checked={draft.requires_cnic} onChange={e => setDraft({ ...draft, requires_cnic: e.target.checked })} className="ml-2" />
        </label>
        <label className="block text-sm">Change notes
          <input value={notes} onChange={e => setNotes(e.target.value)} className="block border rounded px-2 py-1 w-full" />
        </label>
        <button onClick={saveDraft} className="px-4 py-2 bg-blue-600 text-white rounded">Save as draft</button>
        {msg && <div className="text-sm">{msg}</div>}
      </div>
      <RuleVersionHistory history={history} onPublish={publish} />
    </div>
  )
}
