// Family detail for the helper. Everything here comes from consent-checked endpoints:
// if permission was withdrawn, the SERVER refuses and this page shows why.
import { FilePlus2, Lock, ShieldCheck, MapPin, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { casesApi } from '../../api/cases'
import { consentApi } from '../../api/consent'
import { familiesApi } from '../../api/families'
import type { CitizenCase, Consent, Family } from '../../api/types'
import { useAuth } from '../../auth/AuthProvider'
import HelperBar from '../../components/HelperBar'
import ListenButton from '../../components/ListenButton'
import Notice from '../../components/Notice'
import OfflineBanner from '../../components/OfflineBanner'
import Sheet from '../../components/Sheet'
import { useI18n, type TKey } from '../../i18n'
import { ApiError, isNetworkError } from '../../lib/errors'
import { CaseDetailView, CaseList } from '../citizen/TrackCasePage'
import { Avatar } from './HelperDashboard'
import { useHelper } from './HelperContext'

export default function FamilyDetailPage() {
  const { t, lang } = useI18n()
  const { id = '' } = useParams()
  const { me } = useAuth()
  const { active, select } = useHelper()
  const [family, setFamily] = useState<Family | null>(null)
  const [cases, setCases] = useState<CitizenCase[]>([])
  const [consent, setConsent] = useState<Consent | null>(null)
  const [blocked, setBlocked] = useState<ApiError | null>(null)
  const [offline, setOffline] = useState(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setBlocked(null); setOffline(false)
    consentApi.list(id).then(r => setConsent(r.items[0] ?? null)).catch(() => {})
    Promise.all([familiesApi.get(id), casesApi.list(id)])
      .then(([f, c]) => { setFamily(f); setCases(c.items); select(f) })
      .catch(e => { if (e instanceof ApiError) setBlocked(e); else if (isNetworkError(e)) setOffline(true) })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])

  if (!active || active.id !== id) return <Navigate to="/helper" replace />
  const who = lang === 'ur' ? active.head_name_ur : active.head_name
  const script = t('consent_script', { helper: me?.full_name ?? '' })

  const grant = async () => {
    if (!me) return
    setBusy(true)
    try {
      await consentApi.grant({ family_id: id, recipient_id: me.id, purpose: 'Help with relief application', data_scope: ['name', 'cnic', 'phone', 'household', 'income', 'case_status'], confirmed_by_citizen: true })
      setAsking(false); load()
    } catch (e) { setBlocked(e instanceof ApiError ? e : null) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <HelperBar />
      <OfflineBanner />
      {offline && <Notice tone="warn">{t('net_offline')}</Notice>}

      {blocked && (
        <section className="slip p-5 space-y-4 border-danger">
          <div className="flex items-center gap-3"><Lock className="text-danger" size={32} aria-hidden /><h1 className="text-xl font-bold">{t('access_blocked_title')}</h1></div>
          <p dir="auto">{blocked.message}</p>
          <p className="latin text-xs text-ink-faint" dir="ltr">HTTP {blocked.status} {blocked.code}</p>
          {(blocked.code === 'CONSENT_WITHDRAWN' || blocked.code === 'CONSENT_REQUIRED') && (
            <button className="btn-primary w-full" onClick={() => setAsking(true)}><ShieldCheck aria-hidden /> {t('ask_consent')}</button>
          )}
        </section>
      )}

      {family && !blocked && (
        <>
          <section className="slip p-5 space-y-3">
            <div className="flex items-center gap-4">
              <Avatar f={family} size={60} />
              <div>
                <h1 className="text-xl font-bold">{who}</h1>
                <div className="text-sm text-ink-soft flex flex-wrap gap-x-3">
                  <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{t('family_district', { d: family.district })}</span>
                  <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden />{t('family_members', { n: family.members_count })}</span>
                  <span>{t('family_cnic', { d: family.cnic_last4 })}</span>
                </div>
              </div>
            </div>
            {consent && consent.status === 'active' && (
              <div className="text-sm">
                <span className="font-bold text-safe inline-flex items-center gap-1"><ShieldCheck size={16} aria-hidden />{t('consent_active')}</span>{' '}
                <span className="text-ink-soft">{consent.data_scope.map(s => t(`scope_${s}` as TKey)).join(', ')}</span>
              </div>
            )}
            <Link to={`/helper/families/${id}/apply`} className="btn-primary w-full"><FilePlus2 aria-hidden /> {t('start_apply')}</Link>
          </section>
          <section>
            <h2 className="font-bold mb-2">{t('family_cases')}</h2>
            <CaseList cases={cases} base="/helper/cases" />
          </section>
        </>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title={t('consent_script_title', { name: who })}>
        <p className="text-lg mb-4 rounded-xl bg-white border-2 border-ink/10 p-4">{script}</p>
        <div className="mb-4"><ListenButton text={script} /></div>
        <div className="grid gap-3">
          <button className="btn-primary" disabled={busy} onClick={grant}><ShieldCheck aria-hidden /> {t('consent_citizen_yes', { name: who })}</button>
          <button className="btn-quiet" onClick={() => setAsking(false)}>{t('cancel')}</button>
        </div>
      </Sheet>
    </div>
  )
}

export function HelperCasePage() {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const [c, setC] = useState<CitizenCase | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => { casesApi.get(id).then(setC).catch(e => setErr(e instanceof ApiError ? e.message : isNetworkError(e) ? t('net_offline') : String(e))) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id])
  return (
    <div className="space-y-4">
      <HelperBar />
      {err && <Notice tone="danger">{err}</Notice>}
      {c && <CaseDetailView c={c} onChanged={load} />}
    </div>
  )
}
