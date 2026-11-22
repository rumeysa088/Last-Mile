// frontend/src/pages/admin/components/AIContextPanel.tsx
import type { CaseDetail } from '../../../api/client'

export default function AIContextPanel({ detail }: { detail: CaseDetail }) {
  const e = detail.ai_explanation
  return (
    <div className="bg-white p-6 rounded shadow space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">AI context (suggestion — not a final decision)</h2>
        <span className="text-xs text-slate-500">rule version {detail.rule_version_id ?? '—'}</span>
      </div>
      {!e && <div className="text-slate-500">No AI explanation attached.</div>}
      {e && (
        <>
          <p className="text-slate-700">{e.summary}</p>
          <div>
            <div className="text-sm font-medium mb-1">Reasons</div>
            <ul className="list-disc list-inside text-sm text-slate-700">{e.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Sources</div>
            <ul className="list-disc list-inside text-sm text-slate-500">{e.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </>
      )}
      {detail.missing_fields && detail.missing_fields.length > 0 && (
        <div>
          <div className="text-sm font-medium text-amber-700">Missing fields</div>
          <div className="text-sm">{detail.missing_fields.join(', ')}</div>
        </div>
      )}
      {detail.ocr_warnings && detail.ocr_warnings.length > 0 && (
        <div>
          <div className="text-sm font-medium text-amber-700">OCR warnings</div>
          <ul className="list-disc list-inside text-sm">{detail.ocr_warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}