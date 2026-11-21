// Suspicious-message check. Three outcomes, never a guarantee of genuineness.
// The words that triggered each warning are marked inside the person's own message.
import { ShieldAlert, ShieldCheck, ShieldQuestion, Ban, Link2Off, PhoneOff, Trash2, Search, UserCheck, ClipboardPaste } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { scamApi } from '../../api/scam'
import type { AIResult } from '../../api/types'
import ConfidenceMeter from '../../components/ConfidenceMeter'
import ListenButton from '../../components/ListenButton'
import Notice from '../../components/Notice'
import SourceCitation from '../../components/SourceCitation'
import VoiceButton from '../../components/VoiceButton'
import { useI18n } from '../../i18n'
import { ApiError, isNetworkError } from '../../lib/errors'
import { spansFor } from '../../lib/scamRules'

// Synthetic examples only. Numbers and links are fake.
export const SCAM_EXAMPLES = [
  'URGENT: Your BISP relief payment of Rs 25,000 is ready. Send your CNIC and OTP to claim now: bit.ly/relief-pk26',
  'Mubarak ho! Aap ka inaam nikla hai. Processing fee Rs 500 JazzCash send karein foran warna amount cancel.',
  'Claim your relief package of this month at www.relief-help-pk.org',
  'Your relief application has been received. Please visit the tehsil office with your original ID card during working hours.',
]

const LOOK = {
  suspicious: { Icon: ShieldAlert, bg: 'bg-danger', soft: 'bg-danger-light', tone: 'danger' as const, mark: 'bg-danger/20 decoration-danger' },
  likely_legitimate: { Icon: ShieldCheck, bg: 'bg-safe', soft: 'bg-safe-light', tone: 'safe' as const, mark: 'bg-safe/20 decoration-safe' },
  unknown: { Icon: ShieldQuestion, bg: 'bg-unsure', soft: 'bg-unsure-light', tone: 'unsure' as const, mark: 'bg-unsure/20 decoration-unsure' },
}
const STEP_ICON = (s: string) => /link|click/i.test(s) ? Link2Off : /money|send/i.test(s) ? Ban : /report|delete/i.test(s) ? Trash2 : /number|helpline|official/i.test(s) ? PhoneOff : /person|review/i.test(s) ? UserCheck : Search

export function Highlighted({ text, evidence, markCls }: { text: string; evidence: string[]; markCls: string }) {
  const parts = useMemo(() => {
    const spans = spansFor(text, evidence)
    const out: { s: string; label?: string }[] = []
    let pos = 0
    for (const sp of spans) {
      if (sp.start < pos) continue // overlap: keep the first
      if (sp.start > pos) out.push({ s: text.slice(pos, sp.start) })
      out.push({ s: text.slice(sp.start, sp.end), label: sp.label })
      pos = sp.end
    }
    if (pos < text.length) out.push({ s: text.slice(pos) })
    return out
  }, [text, evidence])
  return (
    <p className="rounded-xl bg-white border-2 border-ink/10 p-4 leading-loose break-words" dir="auto">
      {parts.map((p, i) => p.label
        ? <mark key={i} title={p.label} className={`rounded px-0.5 text-ink underline decoration-2 underline-offset-4 ${markCls}`}>{p.s}</mark>
        : <span key={i}>{p.s}</span>)}
    </p>
  )
}

export default function ScamCheckPage() {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const [checked, setChecked] = useState('')
  const [res, setRes] = useState<AIResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const resultRef = useRef<HTMLElement>(null)
  useEffect(() => { if (res) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [res])

  const run = async (msg = text) => {
    setBusy(true); setErr(null); setRes(null)
    try { const r = await scamApi.check(msg, lang); setRes(r); setChecked(msg) }
    catch (e) { setErr(isNetworkError(e) ? t('net_offline') : e instanceof ApiError ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const paste = async () => { try { const s = await navigator.clipboard.readText(); if (s) setText(s) } catch { /* permission denied */ } }

  const look = res ? LOOK[res.result] : null
  const verdictText = res ? t(`verdict_${res.result}`) : ''
  const spoken = res ? `${verdictText}. ${res.explanation} ${t('scam_steps')}: ${res.safe_next_steps.join('. ')}. ${t('scam_never_guarantee')}` : ''

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{t('scam_title')}</h1>
        <p className="text-ink-soft mt-1">{t('scam_intro')}</p>
      </header>

      <div className="space-y-3">
        <label className="label" htmlFor="msg">{t('scam_label')}</label>
        <textarea id="msg" className="field min-h-[140px] py-3 text-lg" dir="auto" value={text} onChange={e => setText(e.target.value)} />
        <div className="flex items-center gap-3">
          <VoiceButton size="inline" onConfirm={s => setText(s)} onTypeInstead={() => document.getElementById('msg')?.focus()} />
          <button className="btn-quiet" onClick={paste}><ClipboardPaste aria-hidden /> <span className="sr-only sm:not-sr-only">Paste</span></button>
          <button className="btn-primary flex-1" disabled={busy || !text.trim()} onClick={() => run()}>{busy ? t('loading') : t('scam_check')}</button>
        </div>
        <details>
          <summary className="cursor-pointer text-teal-dark font-bold min-h-[44px] flex items-center">{t('scam_examples')}</summary>
          <div className="grid gap-2 mt-2">
            {SCAM_EXAMPLES.map(ex => (
              <button key={ex} className="text-start text-sm rounded-xl border-2 border-ink/10 bg-white p-3 hover:border-teal latin" dir="ltr" onClick={() => { setText(ex); run(ex) }}>{ex}</button>
            ))}
          </div>
        </details>
      </div>

      {err && <Notice tone="danger">{err}</Notice>}

      {res && look && (
        <section ref={resultRef} className="slip overflow-hidden scroll-mt-20" aria-live="polite" aria-labelledby="verdict">
          <div className={`${look.bg} text-white px-5 py-5 flex items-center gap-4`}>
            <look.Icon size={52} aria-hidden strokeWidth={2.2} />
            <div className="flex-1">
              <h2 id="verdict" className="text-2xl font-bold">{verdictText}</h2>
              {res.requires_human_review && <div className="text-sm opacity-95 mt-1">{t('scam_human')}</div>}
            </div>
          </div>
          <div className="p-5 space-y-5">
            <ListenButton text={spoken} />
            <p className="text-lg" dir="auto">{res.explanation}</p>

            <div>
              <h3 className="font-bold mb-2">{res.evidence.length ? t('scam_marked') : t('scam_why')}</h3>
              <Highlighted text={checked} evidence={res.evidence} markCls={look.mark} />
              {res.evidence.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {res.evidence.map(e => <li key={e} className="flex gap-2 items-start"><span className={`mt-2 h-2.5 w-2.5 rounded-full shrink-0 ${look.bg}`} aria-hidden /><span className="latin" dir="ltr">{e}</span></li>)}
                </ul>
              ) : <p className="text-sm text-ink-soft mt-2">{t('scam_none_found')}</p>}
            </div>

            <div>
              <h3 className="font-bold mb-2">{t('scam_steps')}</h3>
              <ul className="grid gap-2">
                {res.safe_next_steps.map(s => { const I = STEP_ICON(s); return (
                  <li key={s} className={`flex items-center gap-3 rounded-xl ${look.soft} px-4 py-3`}><I aria-hidden className="shrink-0" /> <span dir="auto">{s}</span></li>) })}
              </ul>
            </div>

            <ConfidenceMeter value={res.confidence} tone={look.tone} />
            <Notice tone="warn">{t('scam_never_guarantee')}</Notice>
            <SourceCitation sources={res.sources} model={res.model_version} />
          </div>
        </section>
      )}
    </div>
  )
}
