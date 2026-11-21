// See who has your data, change what is shared, take it back. Every state shown here is
// what the server returned after the action, never an optimistic guess.
import { Building2, HandHelping, Eye, ShieldOff, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { consentApi } from '../../api/consent'
import type { AccessEvent, Consent } from '../../api/types'
import ListenButton from '../../components/ListenButton'
import Notice from '../../components/Notice'
import Sheet from '../../components/Sheet'
import { useI18n, type TKey } from '../../i18n'
import { ApiError, isNetworkError } from '../../lib/errors'

const ALL_SCOPES = ['name', 'cnic', 'phone', 'household', 'income', 'case_status', 'documents']

export function actionLabel(a: string): TKey {
  if (a.startsWith('access_denied')) return 'act_access_denied'
  if (a.startsWith('case.route')) return 'act_case_route'
  if (a.startsWith('case.review')) return 'act_case_review'
  const m: Record<string, TKey> = { 'family.read': 'act_family_read', 'case.read': 'act_case_read', 'case.create': 'act_case_create', 'document.upload': 'act_document_upload' }
  return m[a] ?? 'act_other'
}

export default function ConsentPage() {
  const { t, lang } = useI18n()
  const [items, setItems] = useState<Consent[] | null>(null)
  const [log, setLog] = useState<AccessEvent[]>([])
  const [confirm, setConfirm] = useState<Consent | null>(null)
  const [editing, setEditing] = useState<{ c: Consent; scope: string[] } | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    consentApi.list().then(r => setItems(r.items)).catch(e => setMsg({ tone: 'danger', text: isNetworkError(e) ? t('net_offline') : String(e.message) }))
    consentApi.accessLog().then(setLog).catch(() => {})
  }
  useEffect(load, [])

  const act = async (fn: () => Promise<Consent>) => {
    setBusy(true); setMsg(null)
    try {
      const c = await fn()
      setMsg({ tone: 'ok', text: t('consent_server_ok', { status: c.status === 'active' ? t('consent_active') : t('consent_withdrawn', { date: fmt(c.withdrawn_at) }) }) })
      load()
    } catch (e) {
      setMsg({ tone: 'danger', text: isNetworkError(e) ? t('net_offline') : e instanceof ApiError ? e.message : String(e) })
    } finally { setBusy(false); setConfirm(null); setEditing(null) }
  }
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium' }) : '')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{t('consent_title')}</h1>
        <p className="text-ink-soft mt-1">{t('consent_intro')}</p>
        <div className="mt-2"><ListenButton text={`${t('consent_title')}. ${t('consent_intro')}`} /></div>
      </header>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!items && <p role="status">{t('loading')}</p>}

      <ul className="space-y-4">
        {items?.map(c => {
          const on = c.status === 'active'
          const RIcon = c.recipient_type === 'department' ? Building2 : HandHelping
          return (
            <li key={c.id} className={`slip p-5 space-y-4 ${on ? '' : 'opacity-90 border-dashed'}`}>
              <div className="flex items-start gap-3">
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-teal text-paper' : 'bg-ink/10 text-ink-soft'}`}><RIcon aria-hidden /></span>
                <div className="flex-1">
                  <h2 className="font-bold text-lg">{c.recipient_name}</h2>
                  <div className={`inline-flex items-center gap-1 text-sm font-bold ${on ? 'text-safe' : 'text-danger'}`}>
                    {on ? <ShieldCheck size={16} aria-hidden /> : <ShieldOff size={16} aria-hidden />}
                    {on ? `${t('consent_active')}. ${t('consent_since', { date: fmt(c.granted_at) })}` : t('consent_withdrawn', { date: fmt(c.withdrawn_at) })}
                  </div>
                </div>
              </div>
              <div><div className="text-sm text-ink-soft">{t('consent_purpose')}</div><div dir="auto">{c.purpose}</div></div>
              <div>
                <div className="text-sm text-ink-soft mb-1">{t('consent_shares')}</div>
                <ul className="flex flex-wrap gap-2">{c.data_scope.map(s => <li key={s} className="rounded-full bg-paper-deep px-3 py-0.5 text-sm">{t(`scope_${s}` as TKey)}</li>)}</ul>
              </div>
              {c.recipient_type === 'community_helper' && (
                <div className="flex flex-wrap gap-3">
                  {on ? <>
                    <button className="btn-danger flex-1" disabled={busy} onClick={() => setConfirm(c)}><ShieldOff aria-hidden /> {t('consent_stop')}</button>
                    <button className="btn-quiet flex-1" disabled={busy} onClick={() => setEditing({ c, scope: c.data_scope })}><SlidersHorizontal aria-hidden /> {t('consent_change')}</button>
                  </> : (
                    <button className="btn-primary flex-1" disabled={busy} onClick={() => act(() => consentApi.grant({ recipient_id: c.recipient_id, purpose: c.purpose, data_scope: c.data_scope, confirmed_by_citizen: true }))}>
                      <ShieldCheck aria-hidden /> {t('consent_again')}</button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <section className="slip p-5">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Eye aria-hidden className="text-teal" /> {t('access_title')}</h2>
        {log.length === 0 ? <p className="text-ink-soft">{t('access_empty')}</p> : (
          <ul className="divide-y-2 divide-ink/5">
            {log.map((a, i) => (
              <li key={i} className={`py-2 ${a.action.startsWith('access_denied') ? 'text-danger font-bold' : ''}`}>
                <span className="font-bold">{a.who}</span> {t(actionLabel(a.action))}
                <div className="text-xs text-ink-soft latin">{new Date(a.at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={t('consent_stop')}>
        <p className="mb-5">{confirm && t('consent_stop_confirm', { name: confirm.recipient_name })}</p>
        {confirm && <div className="mb-4"><ListenButton text={t('consent_stop_confirm', { name: confirm.recipient_name })} /></div>}
        <div className="grid gap-3">
          <button className="btn-danger" disabled={busy} onClick={() => confirm && act(() => consentApi.withdraw(confirm.id))}>{t('consent_stop_yes')}</button>
          <button className="btn-quiet" onClick={() => setConfirm(null)}>{t('cancel')}</button>
        </div>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('consent_change')}>
        {editing && (
          <div className="space-y-2 mb-5">
            {ALL_SCOPES.map(s => (
              <label key={s} className="flex items-center gap-3 min-h-[52px] rounded-xl bg-white border-2 border-ink/10 px-4 cursor-pointer">
                <input type="checkbox" className="w-6 h-6 accent-teal" checked={editing.scope.includes(s)}
                  onChange={e => setEditing({ ...editing, scope: e.target.checked ? [...editing.scope, s] : editing.scope.filter(x => x !== s) })} />
                {t(`scope_${s}` as TKey)}
              </label>
            ))}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy || !editing?.scope.length} onClick={() => editing && act(() => consentApi.updateScope(editing.c.id, editing.scope))}>{t('consent_save')}</button>
      </Sheet>
    </div>
  )
}
