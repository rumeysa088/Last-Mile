// Multi-step relief application. One question per screen, icon + spoken prompt + voice answer,
// autosaved to this phone after every change, idempotent submission, offline queue fallback.
// Used by citizens (/citizen/apply) and by helpers for the active family (/helper/families/:id/apply).
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Coins, Home, IdCard, MapPin, Phone, User, Users, Accessibility, HeartHandshake, Clock, Minus, Plus, Send } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { casesApi } from '../../api/cases'
import { DISTRICTS, PROGRAM } from '../../api/mockServer'
import type { CaseCreate, CitizenCase, HouseholdSituation, IncomeBand } from '../../api/types'
import { useAuth } from '../../auth/AuthProvider'
import HelperBar from '../../components/HelperBar'
import ListenButton from '../../components/ListenButton'
import Notice from '../../components/Notice'
import OfflineBanner from '../../components/OfflineBanner'
import Sheet from '../../components/Sheet'
import VoiceButton from '../../components/VoiceButton'
import { useI18n, type TKey } from '../../i18n'
import { ApiError, isNetworkError } from '../../lib/errors'
import { checkImage, type Quality } from '../../lib/imageQuality'
import { isOnline } from '../../lib/net'
import { uuid } from '../../lib/uid'
import { draftKey, drafts, type Draft } from '../../offline/db'
import { enqueue } from '../../offline/queue'
import { useSync } from '../../offline/SyncProvider'
import { useHelper } from '../helper/HelperContext'

type Answers = Partial<CaseCreate> & { exact_known?: boolean }
type StepId = 'name' | 'cnic' | 'phone' | 'district' | 'household' | 'situation' | 'income' | 'photo' | 'review'
const STEPS: StepId[] = ['name', 'cnic', 'phone', 'district', 'household', 'situation', 'income', 'photo', 'review']
const ICONS: Record<StepId, typeof User> = { name: User, cnic: IdCard, phone: Phone, district: MapPin, household: Users, situation: Home, income: Coins, photo: Camera, review: CheckCircle2 }
const BANDS: IncomeBand[] = ['lt_20k', '20k_35k', '35k_50k', 'gt_50k']
const SITUATIONS: { v: HouseholdSituation; icon: typeof User }[] = [
  { v: 'widow', icon: HeartHandshake }, { v: 'disability', icon: Accessibility }, { v: 'elderly', icon: Clock }, { v: 'none', icon: Minus },
]
const READ_ALOUD = 'lm_read_aloud'

export function formatCnic(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join('-')
}
export function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d
}
export function validateStep(step: StepId, a: Answers): TKey | null {
  switch (step) {
    case 'name': return a.applicant_name?.trim() ? null : 'err_required'
    case 'cnic': return /^\d{5}-\d{7}-\d$/.test(a.cnic ?? '') ? null : 'err_cnic'
    case 'phone': return /^03\d{2}-\d{7}$/.test(a.phone ?? '') ? null : 'err_phone'
    case 'district': return a.district ? null : 'err_required'
    case 'household': return a.household_size && a.household_size >= 1 && a.household_size <= 30 ? null : 'err_household'
    case 'situation': return a.household_situation ? null : 'err_required'
    case 'income':
      if (!a.income_band) return 'err_required'
      if (a.exact_known && !(a.monthly_income_pkr != null && a.monthly_income_pkr >= 0)) return 'err_income'
      return null
    default: return null
  }
}

/** Match a spoken answer to one of several labelled options (any language). */
function matchOption<T extends string>(spoken: string, options: { v: T; labels: string[] }[]): T | null {
  const s = spoken.toLowerCase()
  for (const o of options) if (o.labels.some(l => l && (s.includes(l.toLowerCase()) || l.toLowerCase().includes(s)))) return o.v
  return null
}

export default function ApplyPage() {
  const { t, lang } = useI18n()
  const { me } = useAuth()
  const { active } = useHelper()
  const { id: routeFamilyId } = useParams()
  const { online } = useSync()
  const isHelper = me?.role === 'community_helper'
  const familyId = isHelper ? routeFamilyId ?? null : me?.family_id ?? null
  const key = me ? draftKey(me.id, familyId) : ''

  const [answers, setAnswers] = useState<Answers>({})
  const [step, setStep] = useState(0)
  const [idem, setIdem] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [resume, setResume] = useState<Draft | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<TKey | null>(null)
  const [serverError, setServerError] = useState<{ msg: string; dup?: { id?: string; reference?: string } } | null>(null)
  const [photo, setPhoto] = useState<{ file: File; q: Quality; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceUsed, setVoiceUsed] = useState(false)
  const [done, setDone] = useState<{ kind: 'sent'; c: CitizenCase; photoMsg?: string } | { kind: 'queued' } | null>(null)
  const [readAloud, setReadAloud] = useState(() => localStorage.getItem(READ_ALOUD) === '1')
  const inputRef = useRef<HTMLInputElement>(null)

  const defaults = useCallback((): Answers => isHelper && active
    ? { applicant_name: active.head_name, district: active.district, household_size: active.members_count }
    : { applicant_name: me?.full_name, household_size: 1 }, [isHelper, active, me])

  // load draft for THIS person + family only
  useEffect(() => {
    if (!me) return
    let off = false
    drafts.get(key).then(d => {
      if (off) return
      if (d && Object.keys(d.answers).length) { setResume(d); setIdem(d.idempotency_key) }
      else { setAnswers(defaults()); setIdem(uuid()) }
      setLoaded(true)
    }).catch(() => { setAnswers(defaults()); setIdem(uuid()); setLoaded(true) })
    return () => { off = true }
  }, [key, me, defaults])

  // autosave after every change
  useEffect(() => {
    if (!loaded || resume || done || !me || !idem) return
    const id = setTimeout(() => {
      drafts.put({ key, owner_id: me.id, family_id: familyId, step, answers, idempotency_key: idem, updated_at: Date.now() })
        .then(() => setSavedAt(Date.now())).catch(() => {})
    }, 350)
    return () => clearTimeout(id)
  }, [answers, step, loaded, resume, done, me, idem, key, familyId])

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const set = (p: Answers) => { setAnswers(a => ({ ...a, ...p })); setError(null); setServerError(null) }
  const id = STEPS[step]
  const Icon = ICONS[id]

  const go = (dir: 1 | -1) => {
    if (dir === 1) {
      const e = validateStep(id, answers)
      if (e) { setError(e); inputRef.current?.focus(); return }
    }
    setError(null)
    setStep(s => Math.max(0, Math.min(STEPS.length - 1, s + dir)))
    window.scrollTo({ top: 0 })
  }

  const payload = useMemo((): CaseCreate => ({
    program_code: PROGRAM, family_id: familyId, applicant_name: (answers.applicant_name ?? '').trim(), cnic: answers.cnic ?? '', phone: answers.phone ?? '',
    district: answers.district ?? '', household_size: answers.household_size ?? 0, household_situation: answers.household_situation ?? 'none',
    monthly_income_pkr: answers.exact_known ? answers.monthly_income_pkr ?? null : null, income_band: answers.income_band ?? 'lt_20k',
    submitted_via: isHelper ? 'helper' : 'self', voice_used: voiceUsed,
  }), [answers, familyId, isHelper, voiceUsed])

  async function submit() {
    if (!me) return
    for (let i = 0; i < STEPS.length - 1; i++) { const e = validateStep(STEPS[i], answers); if (e) { setStep(i); setError(e); return } }
    setBusy(true); setServerError(null)
    const label = payload.applicant_name
    try {
      if (!isOnline()) throw new TypeError('network offline')
      const c = await casesApi.create(payload, idem)
      await drafts.delete(key)
      let photoMsg: string | undefined
      if (photo) {
        try { const ocr = await casesApi.uploadDocument(c.id, 'cnic', photo.file, photo.q.quality, photo.q.sharpness); photoMsg = ocr.explanation }
        catch { photoMsg = t('photo_offline') }
      }
      setDone({ kind: 'sent', c, photoMsg })
    } catch (e) {
      if (isNetworkError(e)) {
        // Keep it on the phone with the SAME idempotency key. The photo is not queued (privacy).
        await enqueue({ id: idem, owner_id: me.id, family_id: familyId, label, payload })
        await drafts.delete(key)
        setDone({ kind: 'queued' })
      } else if (e instanceof ApiError) {
        if (e.code === 'DUPLICATE_APPLICATION') setServerError({ msg: e.message, dup: e.details as { id?: string; reference?: string } })
        else if (e.code === 'CONSENT_WITHDRAWN' || e.code === 'CONSENT_REQUIRED') setServerError({ msg: e.message })
        else setServerError({ msg: e.message })
      } else setServerError({ msg: String(e) })
    } finally { setBusy(false) }
  }

  if (!me) return null
  if (isHelper && (!active || active.id !== routeFamilyId)) return <Navigate to="/helper" replace />

  const casesPath = isHelper ? `/helper/families/${familyId}` : '/citizen/cases'

  if (done) {
    return (
      <div className="space-y-5">
        {isHelper && <HelperBar />}
        {done.kind === 'sent' ? (
          <section className="slip p-6 text-center space-y-4">
            <CheckCircle2 size={64} className="mx-auto text-safe" aria-hidden />
            <h1 className="text-2xl font-bold">{t('sent_title')}</h1>
            <div>
              <div className="text-ink-soft">{t('sent_ref')}</div>
              <div className="latin text-3xl font-bold tracking-wider my-2" dir="ltr">{done.c.reference}</div>
              <ListenButton text={`${t('sent_ref')}: ${done.c.reference.split('').join(' ')}`} />
            </div>
            {done.c.idempotent_replay && <Notice tone="info">{t('replay_note')}</Notice>}
            <p className="text-start">{done.c.user_explanation}</p>
            {done.photoMsg && <p className="text-sm text-ink-soft text-start">{done.photoMsg}</p>}
            <Link className="btn-primary w-full" to={isHelper ? casesPath : `/citizen/cases/${done.c.id}`}>{t('track_title')}</Link>
          </section>
        ) : (
          <section className="slip p-6 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-saffron-light flex items-center justify-center"><Send className="text-saffron-dark" aria-hidden /></div>
            <h1 className="text-2xl font-bold">{t('queued_title')}</h1>
            <p>{t('queued_body')}</p>
            <ListenButton text={`${t('queued_title')}. ${t('queued_body')}`} auto={readAloud} />
            {photo && <Notice tone="warn">{t('photo_offline')}</Notice>}
            <OfflineBanner />
            <Link className="btn-quiet w-full" to={isHelper ? '/helper' : '/citizen'}>{t('home')}</Link>
          </section>
        )}
      </div>
    )
  }

  const question: Record<StepId, [TKey, TKey | null]> = {
    name: ['q_name', 'q_name_hint'], cnic: ['q_cnic', 'q_cnic_hint'], phone: ['q_phone', 'q_phone_hint'], district: ['q_district', null],
    household: ['q_household', 'q_household_hint'], situation: ['q_situation', null], income: ['q_income', 'q_income_hint'], photo: ['q_photo', 'q_photo_hint'], review: ['review_title', 'review_hint'],
  }
  const [qk, hk] = question[id]

  const onVoice = (text: string) => {
    setVoiceUsed(true)
    if (id === 'name') set({ applicant_name: text })
    else if (id === 'cnic') set({ cnic: formatCnic(text) })
    else if (id === 'phone') set({ phone: formatPhone(text) })
    else if (id === 'household') { const n = parseInt(text.replace(/\D/g, ''), 10); if (n) set({ household_size: n }) }
    else if (id === 'income') { const n = parseInt(text.replace(/\D/g, ''), 10); if (!isNaN(n)) set({ exact_known: true, monthly_income_pkr: n, income_band: n < 20000 ? 'lt_20k' : n < 35000 ? '20k_35k' : n <= 50000 ? '35k_50k' : 'gt_50k' }) }
    else if (id === 'district') { const d = matchOption(text, DISTRICTS.map(x => ({ v: x, labels: [x] }))); if (d) set({ district: d }) }
    else if (id === 'situation') { const s = matchOption(text, SITUATIONS.map(x => ({ v: x.v, labels: [t(`sit_${x.v}` as TKey), x.v] }))); if (s) set({ household_situation: s }) }
  }
  const voiceKind = id === 'cnic' || id === 'phone' || id === 'household' || id === 'income' ? 'digits' : 'text'
  const showVoice = id !== 'photo' && id !== 'review'

  return (
    <div className="pb-32">
      {isHelper && <HelperBar />}
      {/* progress: one segment per step, it IS a sequence */}
      <div className="flex items-center justify-between mb-2 text-sm text-ink-soft">
        <span>{t('step_of', { n: step + 1, total: STEPS.length })}</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-5 h-5 accent-teal" checked={readAloud} onChange={e => { setReadAloud(e.target.checked); localStorage.setItem(READ_ALOUD, e.target.checked ? '1' : '0') }} />
          {t('read_aloud_auto')}
        </label>
      </div>
      <div className="flex gap-1 mb-6" aria-hidden>
        {STEPS.map((s, i) => <span key={s} className={`h-2 flex-1 rounded-full ${i < step ? 'bg-teal' : i === step ? 'bg-saffron' : 'bg-ink/10'}`} />)}
      </div>

      <section aria-labelledby="q">
        <div className="flex items-start gap-4 mb-5">
          <span className="w-16 h-16 shrink-0 rounded-2xl bg-teal text-paper flex items-center justify-center"><Icon size={34} aria-hidden /></span>
          <div className="flex-1">
            <h1 id="q" className="text-2xl font-bold">{t(qk)}</h1>
            {hk && <p className="text-ink-soft mt-1">{t(hk)}</p>}
          </div>
        </div>
        <div className="mb-5"><ListenButton key={id + lang} text={`${t(qk)}. ${hk ? t(hk) : ''}`} auto={readAloud} /></div>

        {id === 'name' && <Input ref={inputRef} label={t('q_name')} value={answers.applicant_name ?? ''} onChange={v => set({ applicant_name: v })} autoComplete="name" />}
        {id === 'cnic' && <Input ref={inputRef} label={t('q_cnic')} value={answers.cnic ?? ''} onChange={v => set({ cnic: formatCnic(v) })} inputMode="numeric" placeholder="42201-1234567-1" latin />}
        {id === 'phone' && <Input ref={inputRef} label={t('q_phone')} value={answers.phone ?? ''} onChange={v => set({ phone: formatPhone(v) })} inputMode="tel" placeholder="0300-1234567" latin />}
        {id === 'district' && (
          <Choices value={answers.district} onPick={v => set({ district: v })} options={DISTRICTS.map(d => ({ v: d, label: d, icon: MapPin }))} />
        )}
        {id === 'household' && (
          <div className="flex items-center justify-center gap-5" role="group" aria-label={t('q_household')}>
            <button className="w-20 h-20 rounded-full bg-white border-2 border-ink/20 flex items-center justify-center" aria-label="-1" onClick={() => set({ household_size: Math.max(1, (answers.household_size ?? 1) - 1) })}><Minus size={32} aria-hidden /></button>
            <output className="latin text-[3.5rem] font-bold w-24 text-center" aria-live="polite">{answers.household_size ?? 1}</output>
            <button className="w-20 h-20 rounded-full bg-teal text-paper flex items-center justify-center" aria-label="+1" onClick={() => set({ household_size: Math.min(30, (answers.household_size ?? 0) + 1) })}><Plus size={32} aria-hidden /></button>
          </div>
        )}
        {id === 'situation' && (
          <Choices value={answers.household_situation} onPick={v => set({ household_situation: v })} options={SITUATIONS.map(s => ({ v: s.v, label: t(`sit_${s.v}` as TKey), icon: s.icon }))} />
        )}
        {id === 'income' && (
          <div className="space-y-4">
            <Choices value={answers.income_band} onPick={v => set({ income_band: v })} options={BANDS.map((b, i) => ({ v: b, label: t(`band_${b}` as TKey), coins: i + 1 }))} />
            <label className="flex items-center gap-3 min-h-[48px] cursor-pointer">
              <input type="checkbox" className="w-6 h-6 accent-teal" checked={!!answers.exact_known} onChange={e => set({ exact_known: e.target.checked })} />
              {t('exact_income')}
            </label>
            {answers.exact_known && <Input ref={inputRef} label={t('exact_income_label')} value={answers.monthly_income_pkr?.toString() ?? ''} inputMode="numeric" latin
              onChange={v => { const n = v.replace(/\D/g, ''); set({ monthly_income_pkr: n ? Number(n) : undefined }) }} />}
          </div>
        )}
        {id === 'photo' && <PhotoStep photo={photo} setPhoto={setPhoto} online={online} />}
        {id === 'review' && (
          <dl className="slip divide-y-2 divide-ink/5">
            {STEPS.slice(0, -1).map((s, i) => (
              <div key={s} className="flex items-center gap-3 px-4 py-3">
                {(() => { const I = ICONS[s]; return <I size={22} className="text-teal shrink-0" aria-hidden /> })()}
                <div className="flex-1 min-w-0">
                  <dt className="text-sm text-ink-soft">{t(question[s][0])}</dt>
                  <dd className="font-bold break-words">{reviewValue(s, answers, photo, t)}</dd>
                </div>
                <button className="btn-small" onClick={() => setStep(i)}>{t('edit')}</button>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 space-y-3">
          {error && <Notice tone="warn">{t(error)}</Notice>}
          {serverError && (
            <Notice tone="danger" title={serverError.dup ? t('dup_title') : undefined}>
              <p>{serverError.msg}</p>
              {serverError.dup?.id && <Link className="underline font-bold" to={isHelper ? casesPath : `/citizen/cases/${serverError.dup.id}`}>{t('view_it')}</Link>}
            </Notice>
          )}
          <OfflineBanner draftSavedAt={savedAt} />
        </div>
      </section>

      {/* thumb-zone dock: Back · Speak · Next */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t-2 border-ink/10 shadow-[0_-6px_20px_rgba(20,33,61,0.08)]" aria-label="steps">
        <div className="max-w-xl mx-auto flex items-center gap-3 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button className="btn-quiet flex-1" onClick={() => go(-1)} disabled={step === 0}><ArrowLeft className="rtl:rotate-180" aria-hidden /> {t('back')}</button>
          {showVoice ? <VoiceButton kind={voiceKind} onConfirm={onVoice} onTypeInstead={() => inputRef.current?.focus()} /> : <span className="w-[76px]" />}
          {id === 'review'
            ? <button className="btn-primary flex-1" disabled={busy} onClick={submit}>{busy ? t('sending') : t('submit')} <Send size={20} className="rtl:-scale-x-100" aria-hidden /></button>
            : <button className="btn-primary flex-1" onClick={() => go(1)}>{t('next')} <ArrowRight className="rtl:rotate-180" aria-hidden /></button>}
        </div>
      </nav>

      <Sheet open={!!resume} onClose={() => { setAnswers(resume!.answers); setStep(resume!.step); setResume(null) }} title={t('draft_found', { time: resume ? new Date(resume.updated_at).toLocaleString() : '' })}>
        <div className="grid gap-3">
          <button className="btn-primary" onClick={() => { setAnswers(resume!.answers); setStep(resume!.step); setResume(null) }}>{t('draft_continue')}</button>
          <button className="btn-quiet" onClick={() => { drafts.delete(key); setAnswers(defaults()); setStep(0); setIdem(uuid()); setResume(null) }}>{t('draft_restart')}</button>
        </div>
      </Sheet>
    </div>
  )
}

function reviewValue(s: StepId, a: Answers, photo: { q: Quality } | null, t: (k: TKey) => string): ReactNode {
  switch (s) {
    case 'name': return a.applicant_name
    case 'cnic': return <span className="latin" dir="ltr">{a.cnic}</span>
    case 'phone': return <span className="latin" dir="ltr">{a.phone}</span>
    case 'district': return a.district
    case 'household': return <span className="latin">{a.household_size}</span>
    case 'situation': return a.household_situation ? t(`sit_${a.household_situation}` as TKey) : '—'
    case 'income': return a.exact_known && a.monthly_income_pkr != null ? <span className="latin">Rs {a.monthly_income_pkr.toLocaleString()}</span> : a.income_band ? t(`band_${a.income_band}` as TKey) : '—'
    case 'photo': return photo ? (photo.q.quality === 'good' ? t('photo_good') : t('photo_blurry')) : t('skip_photo')
    default: return null
  }
}

const Input = forwardRef<HTMLInputElement, { label: string; value: string; onChange: (v: string) => void; inputMode?: 'numeric' | 'tel'; placeholder?: string; autoComplete?: string; latin?: boolean }>(
  function Input({ label, value, onChange, inputMode, placeholder, autoComplete, latin }, ref) {
    return (
      <label className="block">
        <span className="sr-only">{label}</span>
        <input ref={ref} className={`field ${latin ? 'latin tracking-wide' : ''}`} dir={latin ? 'ltr' : 'auto'} value={value} inputMode={inputMode}
          placeholder={placeholder} autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
      </label>
    )
  })

function Choices<T extends string>({ value, onPick, options }: { value?: T; onPick: (v: T) => void; options: { v: T; label: string; icon?: typeof User; coins?: number }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup">
      {options.map(o => {
        const on = value === o.v
        return (
          <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => onPick(o.v)}
            className={`flex items-center gap-3 text-start rounded-2xl border-2 px-4 min-h-[72px] font-bold transition-colors ${on ? 'border-teal bg-teal-light' : 'border-ink/15 bg-white hover:border-ink/40'}`}>
            {o.icon && <o.icon size={28} className="shrink-0 text-teal" aria-hidden />}
            {o.coins && <span className="flex shrink-0 w-[68px]" aria-hidden>{Array.from({ length: o.coins }).map((_, i) => <Coins key={i} size={22} className="-ms-2 first:ms-0 text-saffron-dark" />)}</span>}
            <span className="flex-1">{o.label}</span>
            {on && <CheckCircle2 className="text-teal shrink-0" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

function PhotoStep({ photo, setPhoto, online }: { photo: { file: File; q: Quality; url: string } | null; setPhoto: (p: { file: File; q: Quality; url: string } | null) => void; online: boolean }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)
  const pick = async (f?: File) => {
    if (!f) return
    setChecking(true)
    try { const q = await checkImage(f); setPhoto({ file: f, q, url: URL.createObjectURL(f) }) }
    catch { setPhoto({ file: f, q: { quality: 'low', sharpness: 0, brightness: 0 }, url: URL.createObjectURL(f) }) }
    finally { setChecking(false) }
  }
  return (
    <div className="space-y-4">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => pick(e.target.files?.[0])} />
      {photo ? (
        <div className="space-y-3">
          <img src={photo.url} alt={t('q_photo')} className="w-full max-h-64 object-contain rounded-2xl border-2 border-ink/10 bg-white" />
          <Notice tone={photo.q.quality === 'good' ? 'ok' : 'warn'}>
            {photo.q.quality === 'good' ? t('photo_good') : t('photo_blurry')} <span className="latin text-xs text-ink-soft">(sharpness {photo.q.sharpness.toFixed(0)})</span>
          </Notice>
          <button className="btn-quiet w-full" onClick={() => ref.current?.click()}><Camera aria-hidden /> {t('retake_photo')}</button>
        </div>
      ) : (
        <button className="w-full rounded-2xl border-4 border-dashed border-teal/40 bg-white min-h-[160px] flex flex-col items-center justify-center gap-2 font-bold text-teal-dark" onClick={() => ref.current?.click()} disabled={checking}>
          <Camera size={44} aria-hidden /> {checking ? t('loading') : t('take_photo')}
        </button>
      )}
      {!online && <Notice tone="warn">{t('photo_offline')}</Notice>}
      <p className="text-sm text-ink-soft">{t('ocr_note')}</p>
    </div>
  )
}
