// frontend/src/pages/admin/RuleVersionHistory.tsx
import type { RuleVersion } from '../../api/client'

interface Props {
  history: RuleVersion[]
  onPublish: (id: string) => void
}

export default function RuleVersionHistory({ history, onPublish }: Props) {
  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="font-semibold mb-3">Version history (immutable)</h2>
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th className="p-2">v</th>
            <th className="p-2">Status</th>
            <th className="p-2">Rules</th>
            <th className="p-2">Author</th>
            <th className="p-2">When</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {history.map(r => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.version}</td>
              <td className="p-2"><span className="px-2 py-0.5 rounded text-xs bg-slate-200">{r.status}</span></td>
              <td className="p-2 text-xs">{JSON.stringify(r.rules_json)}</td>
              <td className="p-2 text-xs">{r.created_by}</td>
              <td className="p-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2 text-right">
                {r.status === 'draft' && <button onClick={() => onPublish(r.id)} className="text-blue-600 hover:underline">Publish</button>}
              </td>
            </tr>
          ))}
          {history.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-slate-500">No versions yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
