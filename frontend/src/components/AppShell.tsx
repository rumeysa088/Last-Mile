import { LogOut } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { homeFor, useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import NetworkSimulator from './NetworkSimulator'

export function LangToggle() {
  const { t, lang, setLang } = useI18n()
  return (
    <button className={`btn-small ${lang === 'en' ? 'font-urdu' : 'latin'}`} onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')} lang={lang === 'ur' ? 'en' : 'ur'}>
      {t('lang_switch')}
    </button>
  )
}

export function Brand({ to = '/' }: { to?: string }) {
  const { t } = useI18n()
  return (
    <Link to={to} className="flex items-center gap-2 font-bold text-lg whitespace-nowrap">
      <img src="/icon.svg" alt="" width={36} height={36} /> <span>{t('app_name')}</span>
    </Link>
  )
}

export default function AppShell({ wide = false }: { wide?: boolean }) {
  const { t } = useI18n()
  const { me, logout } = useAuth()
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-ink text-paper text-xs text-center px-3 py-1">{t('prototype')}</div>
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b-2 border-ink/10">
        <div className={`${wide ? 'max-w-6xl' : 'max-w-xl'} mx-auto flex items-center gap-2 px-4 py-2`}>
          <Brand to={me ? homeFor(me.role) : '/'} />
          <div className="flex-1" />
          <NetworkSimulator />
          <LangToggle />
          {me && <button className="btn-small" onClick={logout} aria-label={t('logout')}><LogOut size={18} aria-hidden /></button>}
        </div>
      </header>
      <main className={wide ? 'flex-1 w-full' : 'flex-1 w-full max-w-xl mx-auto px-4 py-5'}>
        <Outlet />
      </main>
    </div>
  )
}
