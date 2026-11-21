// Application status and history. Two views of every decision (Challenge 05):
// a plain-words reason for the citizen, and an expandable trace (confidence, rule version, sources).
import { Camera, ChevronRight, FileQuestion } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { casesApi } from '../../api/cases'
import type { CitizenCase } from '../../api/types'
import ConfidenceMeter from '../../components/ConfidenceMeter'
import ListenButton from '../../components/ListenButton'
import Notice from '../../components/Notice'
import OfflineBanner from '../../components/OfflineBanner'
import SourceCitation from '../../components/SourceCitation'
import StatusPill from '../../components/StatusPill'
import StatusTimeline from '../../components/StatusTimeline'
import { useI18n, type TKey } from '../../i18n'
import { ApiError, isNetworkError } from '../../lib/errors'
import { checkImage } from '../../lib/imageQuality'

const CACHE = 'lm_cases_cache' // last server copy, so status can be read with no signal (no CNIC/phone stored)

export function CaseList({ cases, base }: { cases: CitizenCase[]; base: string }) {
  const { t } = useI18n()
  if (!cases.length) return <p className="text-ink-soft">{t('track_empty')}</p>
  return (
    <ul className="space-y-3">
      {cases.map(c => (
        <li key={c.id}>
          <Link to={`${base}/${c.id}`} className="slip flex items-center gap-3 p-4 hover:border-teal">
            <div className="flex-1 min-w-0">
              <div className="latin font-bold whitespace-nowrap" dir="ltr">{c.reference}</div>
              <div className="text-sm text-ink-soft truncate">{c.applicant_name} <span className="latin">{new Date(c.submitted_at).toLocaleDateString()}</span></div>
            </div>
            <StatusPill status={c.status} />
            <ChevronRight className="rtl:rotate-180 text-ink-faint" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function TrackCasePage() {
  const { t } = useI18n()
  const { id } = useParams()
  const [cases, setCases] = useState<CitizenCase[] | null>(null)
  const [one, setOne] = useState<CitizenCase | null>(null)
  const [stale, setStale] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    setErr(null)
    const p = id ? casesApi.get(id).then(c => { setOne(c); return [c] }) : casesApi.list().then(r => { setCases(r.items); return r.items })
    p.then(list => {
      setStale(false)
      try {
        const prev: CitizenCase[] = JSON.parse(sessionStorage.getItem(CACHE) || '[]')
        const merged = [...list, ...prev.filter(x => !list.some(y => y.id === x.id))]
        sessionStorage.setItem(CACHE, JSON.stringify(merged.map(({ ...c }) => c)))
      } catch { /* ignore */ }
    }).catch(e => {
      if (isNetworkError(e)) {
        const cached: CitizenCase[] = JSON.parse(sessionStorage.getItem(CACHE) || '[]')
        setStale(true)
        if (id) setOne(cached.find(c => c.id === id) ?? null); else setCases(cached)
      } else setErr(e instanceof ApiError ? e.message : String(e))
    })
  }
  useEffect(load, [id])

  if (!id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('track_title')}</h1>
        <OfflineBanner />
        {err && <Notice tone="danger">{err}</Notice>}
        {cases ? <CaseList cases={cases} base="/citizen/cases" /> : <p role="status">{t('loading')}</p>}
      </div>
    )
  }
  if (err) return <Notice tone="danger">{err}</Notice>
  if (!one) return <p role="status">{stale ? t('net_offline') : t('loading')}</p>
  return <CaseDetailView c={one} stale={stale} onChanged={load} />
}

export function CaseDetailView({ c, stale, onChanged }: { c: CitizenCase; stale?: boolean; onChanged: () => void }) {
  const { t } = useI18n()
  const routeKey = c.route ? (`route_${c.route}` as TKey) : null
  const plain = `${t(`status_${c.status}` as TKey)}. ${c.user_explanation} ${c.missing_fields.length ? `${t('missing_title')}: ${c.missing_fields.map(m => t(`missing_${m}` as TKey)).join(', ')}` : ''}`
  return (
    <div className="space-y-5">
      {stale && <Notice tone="warn">{t('net_offline')}</Notice>}
      <section className="slip p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="latin text-xl font-bold whitespace-nowrap" dir="ltr">{c.reference}</span>
          <StatusPill status={c.status} />
        </div>
        {routeKey && (c.status === 'pending' || c.status === 'info_needed') && <div className="text-ink-soft font-bold">{t(routeKey)}</div>}
        <p className="text-lg" dir="auto">{c.user_explanation}</p>
        <ListenButton text={plain} />
      </section>

      {c.missing_fields.length > 0 && (
        <section className="slip p-5 border-saffron space-y-3">
          <h2 className="font-bold flex items-center gap-2"><FileQuestion aria-hidden className="text-saffron-dark" /> {t('missing_title')}</h2>
          <ul className="list-disc ps-6">{c.missing_fields.map(m => <li key={m}>{t(`missing_${m}` as TKey)}</li>)}</ul>
          {c.missing_fields.includes('cnic_photo') && <AddPhoto caseId={c.id} onDone={onChanged} />}
        </section>
      )}

      <section className="slip p-5 space-y-3">
        <h2 className="font-bold">{t('why_title')}</h2>
        <ul className="space-y-2">{c.reasons.map((r, i) => <li key={i} className="flex gap-2" dir="auto"><span className="text-teal font-bold" aria-hidden>•</span>{r}</li>)}</ul>
        <p className="text-sm font-bold text-teal-dark">{t('computer_never_approves')}</p>
        <details className="pt-2">
          <summary className="cursor-pointer font-bold text-ink-soft min-h-[44px] flex items-center">{t('rule_used', { rule: c.rule_version_id ?? '—' })}</summary>
          <div className="space-y-4 pt-3">
            <ConfidenceMeter value={c.ai_confidence} showThresholds tone="teal" />
            <SourceCitation sources={c.sources} model="rules + guardrails-v1" />
            <div className="text-sm text-ink-soft">{t('submitted_by', { name: c.submitted_by })}</div>
          </div>
        </details>
      </section>

      <section className="slip p-5">
        <h2 className="font-bold mb-4">{t('history_title')}</h2>
        <StatusTimeline events={[...c.history].reverse()} />
      </section>
    </div>
  )
}

function AddPhoto({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    setBusy(true); setMsg(null)
    try {
      const q = await checkImage(f).catch(() => ({ quality: 'low' as const, sharpness: 0, brightness: 0 }))
      if (q.quality !== 'good') { setMsg({ tone: 'warn', text: t('photo_blurry') }) }
      const r = await casesApi.uploadDocument(caseId, 'cnic', f, q.quality, q.sharpness)
      setMsg({ tone: r.requires_human_review ? 'warn' : 'ok', text: `${r.explanation} ${t('ocr_note')}` })
      onDone()
    } catch (e) {
      setMsg({ tone: 'danger', text: isNetworkError(e) ? t('photo_offline') : String((e as Error).message) })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => pick(e.target.files?.[0])} />
      <button className="btn-primary w-full" disabled={busy} onClick={() => ref.current?.click()}><Camera aria-hidden /> {busy ? t('sending') : t('add_photo')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  )
}
