import { LogOut } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { homeFor, useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import NetworkSimulator from './NetworkSimulator'
import { CornerBlob } from './Blob'

export function LangToggle() {
  const { t, lang, setLang } = useI18n()
  return (
    <button className={`btn-small bg-ink text-paper border-ink hover:border-ink ${lang === 'en' ? 'font-urdu' : 'latin'}`} onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')} lang={lang === 'ur' ? 'en' : 'ur'}>
      {t('lang_switch')}
    </button>
  )
}

export function Brand({ to = '/' }: { to?: string }) {
  const { t, lang } = useI18n()
  return (
    <Link to={to} className="flex items-center font-bold text-xl tracking-tight whitespace-nowrap no-underline" aria-label={t('app_name')}>
      {lang === 'en'
        ? <span className="latin">last<span className="inline-block w-2.5 h-2.5 rounded-full bg-ink mx-0.5 mb-0.5" aria-hidden="true" />mile</span>
        : <span>{t('app_name')}</span>}
    </Link>
  )
}

export default function AppShell({ wide = false }: { wide?: boolean }) {
  const { t } = useI18n()
  const { me, logout } = useAuth()
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <div className="relative z-40 bg-ink text-paper text-xs text-center px-3 py-1">{t('prototype')}</div>
      {!wide && <CornerBlob className="top-6 z-0" />}
      <header className={`sticky top-0 z-30 ${wide ? 'bg-paper/95 border-b-2 border-line' : 'bg-white/70'} backdrop-blur`}>
        <div className={`${wide ? 'max-w-6xl' : 'max-w-xl'} mx-auto flex items-center gap-2 px-4 py-2`}>
          <Brand to={me ? homeFor(me.role) : '/'} />
          <div className="flex-1" />
          <NetworkSimulator />
          <LangToggle />
          {me && <button className="btn-small" onClick={logout} aria-label={t('logout')}><LogOut size={18} aria-hidden /></button>}
        </div>
      </header>
      <main className={wide ? 'relative z-10 flex-1 w-full' : 'relative z-10 flex-1 w-full max-w-xl mx-auto px-4 py-5'}>
        <Outlet />
      </main>
    </div>
  )
}
