// Helper Mode: 40 families, one shared phone. Fast search that tolerates spelling variants,
// a deliberate confirm step before switching, per-family colours, and no automatic merging.
import { Search, Lock, ShieldOff, Users, MapPin, AlertTriangle, PencilLine, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { familiesApi } from '../../api/families'
import type { Family } from '../../api/types'
import { useAuth } from '../../auth/AuthProvider'
import Notice from '../../components/Notice'
import OfflineBanner from '../../components/OfflineBanner'
import Sheet from '../../components/Sheet'
import StatusPill from '../../components/StatusPill'
import { useI18n } from '../../i18n'
import { isNetworkError } from '../../lib/errors'
import { nameMatchesQuery } from '../../lib/names'
import { drafts } from '../../offline/db'
import { familyColor, initials, useHelper } from './HelperContext'

type Filter = 'all' | 'action' | 'locked'
const LIST_CACHE = 'lm_family_list' // names + status only, for opening the list with no signal

export function Avatar({ f, size = 48 }: { f: Family; size?: number }) {
  const c = familyColor(f.id)
  return <span className="latin flex shrink-0 items-center justify-center rounded-full text-white font-bold" style={{ background: c.solid, width: size, height: size, fontSize: size / 2.6 }} aria-hidden>{initials(f.head_name)}</span>
}

export default function HelperDashboard() {
  const { t, lang } = useI18n()
  const { me } = useAuth()
  const { select, lockedReason, dismissLock, active } = useHelper()
  const nav = useNavigate()
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pick, setPick] = useState<Family | null>(null)
  const [draftFor, setDraftFor] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    familiesApi.list().then(r => { setFamilies(r.items); try { sessionStorage.setItem(LIST_CACHE, JSON.stringify(r.items)) } catch { /* ignore */ } })
      .catch(e => {
        if (isNetworkError(e)) setFamilies(JSON.parse(sessionStorage.getItem(LIST_CACHE) || '[]'))
        else setErr(String(e.message))
      })
    if (me) drafts.listForOwner(me.id).then(ds => setDraftFor(new Set(ds.map(d => d.family_id ?? ''))))
  }, [me])

  const byId = useMemo(() => new Map((families ?? []).map(f => [f.id, f])), [families])
  const shown = useMemo(() => (families ?? []).filter(f => {
    if (q && !nameMatchesQuery(f.head_name, q) && !f.head_name_ur.includes(q.trim())) return false
    if (filter === 'locked') return f.consent_status !== 'active'
    if (filter === 'action') return f.consent_status === 'active' && (f.latest_case_status === null || f.latest_case_status === 'info_needed' || draftFor.has(f.id))
    return true
  }), [families, q, filter, draftFor])

  const name = (f: Family) => (lang === 'ur' ? f.head_name_ur : f.head_name)

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">{t('helper_title')}</h1>
        {families && <span className="text-ink-soft">{t('helper_count', { n: families.length })}</span>}
      </header>
      {lockedReason === 'idle' && <div onClick={dismissLock}><Notice tone="info">{t('idle_locked')}</Notice></div>}
      <OfflineBanner />
      {err && <Notice tone="danger">{err}</Notice>}

      <div className="sticky top-[58px] z-20 bg-paper pt-1 pb-2 space-y-2">
        <label className="relative block">
          <span className="sr-only">{t('helper_search')}</span>
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input className="field ps-12" dir="auto" type="search" placeholder={t('helper_search')} value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <div className="flex gap-2" role="radiogroup">
          {(['all', 'action', 'locked'] as Filter[]).map(f => (
            <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`btn-small ${filter === f ? 'bg-ink text-paper border-ink' : 'bg-white'}`}>
              {t(f === 'all' ? 'helper_filter_all' : f === 'action' ? 'helper_filter_action' : 'helper_filter_locked')}
            </button>
          ))}
        </div>
      </div>

      {!families && <p role="status">{t('loading')}</p>}
      <ul className="space-y-2">
        {shown.map(f => {
          const locked = f.consent_status !== 'active'
          const isActive = active?.id === f.id
          return (
            <li key={f.id}>
              <button onClick={() => setPick(f)} className={`slip w-full flex items-center gap-3 p-3 text-start hover:border-teal ${isActive ? 'border-teal' : ''} ${locked ? 'bg-paper-deep/60' : ''}`}>
                <Avatar f={f} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 font-bold">
                    <span className="truncate">{name(f)}</span>
                    {draftFor.has(f.id) && <PencilLine size={16} className="text-saffron-dark shrink-0" aria-label="draft" />}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-sm text-ink-soft">
                    <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden />{f.district}</span>
                    <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden /><span className="latin">{f.members_count}</span></span>
                    <span className="latin">•••{f.cnic_last4}</span>
                  </span>
                  {f.possible_duplicates.length > 0 && (
                    <span className="mt-1 flex items-start gap-1 text-xs font-bold text-saffron-dark">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
                      {t('helper_dup', { names: f.possible_duplicates.map(id => byId.get(id)?.head_name ?? id).join(', ') })}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  {locked
                    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-danger">{f.consent_status === 'withdrawn' ? <ShieldOff size={14} aria-hidden /> : <Lock size={14} aria-hidden />}{t(f.consent_status === 'withdrawn' ? 'helper_locked' : 'helper_no_consent')}</span>
                    : f.latest_case_status && <StatusPill status={f.latest_case_status} />}
                  <ChevronRight className="rtl:rotate-180 text-ink-faint" aria-hidden />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick ? t('switch_title', { name: name(pick) }) : ''}>
        {pick && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: familyColor(pick.id).soft }}>
              <Avatar f={pick} size={64} />
              <div>
                <div className="text-xl font-bold latin">{pick.head_name}</div>
                <div className="text-lg font-urdu" dir="rtl" lang="ur">{pick.head_name_ur}</div>
              </div>
            </div>
            <p className="font-bold">{t('switch_check')}</p>
            <ul className="grid grid-cols-3 gap-2 text-center text-sm">
              <li className="slip p-2"><MapPin className="mx-auto" aria-hidden />{pick.district}</li>
              <li className="slip p-2"><Users className="mx-auto" aria-hidden />{t('family_members', { n: pick.members_count })}</li>
              <li className="slip p-2 latin"><span className="block text-lg font-bold">{pick.cnic_last4}</span>CNIC</li>
            </ul>
            {pick.consent_status !== 'active' && <Notice tone="warn">{t(pick.consent_status === 'withdrawn' ? 'helper_locked' : 'helper_no_consent')}</Notice>}
            <button className="btn-primary w-full" onClick={() => { select(pick); setPick(null); nav(`/helper/families/${pick.id}`) }}>{t('switch_yes')}</button>
            <button className="btn-quiet w-full" onClick={() => setPick(null)}>{t('cancel')}</button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
