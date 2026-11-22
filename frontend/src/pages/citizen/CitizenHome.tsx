import { FilePlus2, ListChecks, ShieldQuestion, KeyRound, ChevronRight, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { casesApi } from '../../api/cases'
import type { CitizenCase } from '../../api/types'
import { useAuth } from '../../auth/AuthProvider'
import { BlobIcon, BLOB_FILL, HeadingBlob, type BlobColor } from '../../components/Blob'
import ListenButton from '../../components/ListenButton'
import OfflineBanner from '../../components/OfflineBanner'
import { useI18n, type TKey } from '../../i18n'

const ROWS: { to: string; key: TKey; Icon: typeof FilePlus2; color: BlobColor }[] = [
  { to: '/citizen/cases', key: 'tile_track', Icon: ListChecks, color: 'yellow' },
  { to: '/citizen/scam', key: 'tile_scam', Icon: ShieldQuestion, color: 'mist' },
  { to: '/citizen/consent', key: 'tile_consent', Icon: KeyRound, color: 'sage' },
]

export default function CitizenHome() {
  const { t, lang } = useI18n()
  const { me } = useAuth()
  const [latest, setLatest] = useState<CitizenCase | null>(null)
  useEffect(() => { casesApi.list().then(r => setLatest(r.items[0] ?? null)).catch(() => {}) }, [])
  const greeting = t('hello', { name: me?.full_name ?? '' })
  const spoken = `${greeting}. ${t('home_title_full')} ${t('what_to_do')} ${[t('tile_apply'), ...ROWS.map(x => t(x.key))].join('. ')}`

  return (
    <div className="relative space-y-5">
      {/* the family-home illustration in a yellow blob, half off the edge like the design */}
      <div aria-hidden="true" className="pointer-events-none absolute top-0 -end-20 w-[168px] h-[168px]">
        <svg viewBox="0 0 210 210" className="absolute inset-0 w-full h-full"><path d="M100 8C162 0 206 46 202 106C198 166 150 206 94 202C38 198 0 156 6 100C12 44 44 14 100 8Z" fill={BLOB_FILL.yellow} /></svg>
        <div className="absolute top-2.5 start-2.5 w-[140px] h-[140px] rounded-full bg-mist flex items-center justify-center">
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#1D2433" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="-translate-x-4 rtl:translate-x-4">
            <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><circle cx="10" cy="14" r="1.6" /><circle cx="14.5" cy="14.5" r="1.3" />
            <path d="M8 20v-1.5c0-1.4 1-2.5 2-2.5s2 1.1 2 2.5V20" /><path d="M12.6 20v-1c0-1.1.8-2 1.9-2s1.9.9 1.9 2v1" />
          </svg>
        </div>
      </div>

      <section className="relative pt-8 max-w-[14.5rem]">
        <HeadingBlob className="top-14 -start-2 w-[150px] h-[130px]" />
        <p className="relative font-semibold text-ink-soft">{greeting}</p>
        <h1 className="relative mt-1 text-3xl font-extrabold leading-tight">
          {t('home_title_pre')} <span className="hl">{t('home_title_hl')}</span> {t('home_title_post')}
        </h1>
        <div className="relative mt-4"><ListenButton text={spoken} /></div>
      </section>

      <OfflineBanner />

      {latest && (
        <Link to={`/citizen/cases/${latest.id}`} className="relative slip flex items-center justify-between gap-3 px-4 py-3 hover:border-ink/40">
          <span>
            <span className="block text-sm text-ink-soft">{t('my_application')}</span>
            <span className="latin block font-bold text-lg whitespace-nowrap" dir="ltr">{latest.reference}</span>
          </span>
          <span className="text-sm font-semibold text-end max-w-[9rem] leading-relaxed"><span className="hl">{t(`status_${latest.status}` as TKey)}</span></span>
        </Link>
      )}

      <nav className="relative space-y-2" aria-label={t('what_to_do')}>
        <Link to="/citizen/apply" className="flex items-center gap-4 rounded-[28px] rounded-es-lg bg-coral p-4 min-h-[92px] hover:brightness-95">
          <BlobIcon color="white" size={56}><FilePlus2 size={26} aria-hidden /></BlobIcon>
          <span className="flex-1 text-xl font-bold leading-snug">{t('tile_apply')}</span>
          <ArrowRight size={26} className="rtl:rotate-180 shrink-0" aria-hidden />
        </Link>
        {ROWS.map((x, i) => (
          <Link key={x.to} to={x.to} className="flex items-center gap-4 rounded-2xl px-2 py-2.5 hover:bg-paper-deep">
            <BlobIcon color={x.color} shape={i}><x.Icon size={22} aria-hidden /></BlobIcon>
            <span className="flex-1 font-semibold text-lg">{t(x.key)}</span>
            <ChevronRight size={22} className="rtl:rotate-180 text-ink-soft shrink-0" aria-hidden />
          </Link>
        ))}
      </nav>

      {lang === 'en' && <div aria-hidden="true" className="pointer-events-none select-none -mx-6 -mb-6 text-[7.5rem] leading-none font-extrabold text-paper-deep tracking-tighter overflow-hidden">MADAD</div>}
    </div>
  )
}
