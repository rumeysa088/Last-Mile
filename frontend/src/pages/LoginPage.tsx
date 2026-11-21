// Sign-in with one-tap demo personas from the brief (synthetic accounts, mock mode).
import { HandHelping, ShieldQuestion, Store, Gavel, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../auth/AuthProvider'
import { Brand, LangToggle } from '../components/AppShell'
import Notice from '../components/Notice'
import { useI18n, type TKey } from '../i18n'
import { ApiError, isNetworkError } from '../lib/errors'

const PERSONAS: { email: string; name: string; key: TKey; Icon: typeof Store }[] = [
  { email: 'zainab@demo.lastmile', name: 'Zainab Bibi', key: 'persona_zainab', Icon: ShieldQuestion },
  { email: 'imran@demo.lastmile', name: 'Imran Qureshi', key: 'persona_imran', Icon: Store },
  { email: 'helper@demo.lastmile', name: 'Rukhsana Baloch', key: 'persona_helper', Icon: HandHelping },
  { email: 'officer@demo.lastmile', name: 'Demo Officer', key: 'persona_officer', Icon: Gavel },
]

export default function LoginPage() {
  const { t } = useI18n()
  const { me, login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (me) return <Navigate to={homeFor(me.role)} replace />

  const go = async (e: string, p: string) => {
    setBusy(true); setErr(null)
    try { const m = await login(e, p); nav(homeFor(m.role), { replace: true }) }
    catch (x) { setErr(isNetworkError(x) ? t('net_offline') : x instanceof ApiError ? x.message : String(x)) }
    finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen">
      <div className="bg-ink text-paper text-xs text-center px-3 py-1">{t('prototype')}</div>
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between"><Brand /><LangToggle /></div>
        <h1 className="text-3xl font-bold">{t('login_pick')}</h1>
        {err && <Notice tone="danger">{err}</Notice>}
        <ul className="grid gap-3">
          {PERSONAS.map(p => (
            <li key={p.email}>
              <button disabled={busy} onClick={() => go(p.email, 'demo1234')} className="slip w-full flex items-center gap-4 p-4 text-start hover:border-teal disabled:opacity-50">
                <span className="w-14 h-14 rounded-2xl bg-teal-light text-teal-dark flex items-center justify-center shrink-0"><p.Icon size={30} aria-hidden /></span>
                <span className="flex-1"><span className="block font-bold text-lg latin">{p.name}</span><span className="block text-ink-soft">{t(p.key)}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <details className="slip p-4">
          <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">{t('login_or')}</summary>
          <form className="space-y-3 pt-3" onSubmit={e => { e.preventDefault(); go(email, password) }}>
            <label className="block"><span className="label">{t('email')}</span><input className="field latin" dir="ltr" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label className="block"><span className="label">{t('password')}</span><input className="field latin" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button className="btn-primary w-full" disabled={busy}><LogIn aria-hidden /> {t('sign_in')}</button>
          </form>
        </details>
      </div>
    </div>
  )
}
