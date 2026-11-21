import { FilePlus2, ListChecks, ShieldQuestion, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { casesApi } from '../../api/cases'
import type { CitizenCase } from '../../api/types'
import { useAuth } from '../../auth/AuthProvider'
import ListenButton from '../../components/ListenButton'
import OfflineBanner from '../../components/OfflineBanner'
import StatusPill from '../../components/StatusPill'
import { useI18n, type TKey } from '../../i18n'

const TILES: { to: string; key: TKey; Icon: typeof FilePlus2; cls: string }[] = [
  { to: '/citizen/apply', key: 'tile_apply', Icon: FilePlus2, cls: 'bg-teal text-paper col-span-2 min-h-[150px]' },
  { to: '/citizen/cases', key: 'tile_track', Icon: ListChecks, cls: 'bg-white' },
  { to: '/citizen/scam', key: 'tile_scam', Icon: ShieldQuestion, cls: 'bg-white' },
  { to: '/citizen/consent', key: 'tile_consent', Icon: KeyRound, cls: 'bg-white col-span-2' },
]

export default function CitizenHome() {
  const { t } = useI18n()
  const { me } = useAuth()
  const [latest, setLatest] = useState<CitizenCase | null>(null)
  useEffect(() => { casesApi.list().then(r => setLatest(r.items[0] ?? null)).catch(() => {}) }, [])
  const greeting = t('hello', { name: me?.full_name ?? '' })
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{greeting}</h1>
        <p className="text-ink-soft text-lg">{t('what_to_do')}</p>
        <div className="mt-2"><ListenButton text={`${greeting}. ${t('what_to_do')} ${TILES.map(x => t(x.key)).join('. ')}`} /></div>
      </div>
      <OfflineBanner />
      {latest && (
        <Link to={`/citizen/cases/${latest.id}`} className="slip flex items-center justify-between gap-3 p-4 hover:border-teal">
          <span><span className="block text-sm text-ink-soft">{t('track_title')}</span><span className="latin font-bold" dir="ltr">{latest.reference}</span></span>
          <StatusPill status={latest.status} />
        </Link>
      )}
      <nav className="grid grid-cols-2 gap-3" aria-label={t('what_to_do')}>
        {TILES.map(x => (
          <Link key={x.to} to={x.to} className={`${x.cls} rounded-3xl border-2 border-ink/10 p-5 flex flex-col justify-between gap-6 min-h-[132px] font-bold text-lg hover:border-teal`}>
            <x.Icon size={40} aria-hidden strokeWidth={2} />
            <span>{t(x.key)}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
