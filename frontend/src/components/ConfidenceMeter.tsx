// Shows confidence as a coarse level first (strong/medium/weak), number second, with an honest note.
// Optional threshold marks show the team's rule: below 0.60 a person decides, 0.90+ is the only zone
// where the system may act alone (B, docs/DECISIONS.md §3).
import { useI18n } from '../i18n'

interface Props { value: number | null; tone?: 'danger' | 'safe' | 'unsure' | 'teal'; showThresholds?: boolean; note?: string }
const TONE = { danger: 'bg-danger', safe: 'bg-safe', unsure: 'bg-unsure', teal: 'bg-teal' }

export default function ConfidenceMeter({ value, tone = 'teal', showThresholds = false, note }: Props) {
  const { t } = useI18n()
  if (value == null) return null
  const v = Math.max(0, Math.min(1, value))
  const level = v >= 0.8 ? t('confidence_high') : v >= 0.6 ? t('confidence_mid') : t('confidence_low')
  const pct = Math.round(v * 100)
  return (
    <figure className="w-full">
      <figcaption className="flex items-baseline justify-between gap-3 mb-2">
        <span className="font-bold">{t('confidence_title')}</span>
        <span><span className="font-bold">{level}</span> <span className="latin text-ink-soft">{pct}%</span></span>
      </figcaption>
      <div className="relative h-4 rounded-full bg-ink/10 overflow-visible" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${level}, ${pct}%`}>
        <div className={`h-full rounded-full ${TONE[tone]}`} style={{ width: `${pct}%` }} />
        {showThresholds && [0.6, 0.9].map(th => (
          <span key={th} className="absolute -top-1 h-6 w-0.5 bg-ink" style={{ insetInlineStart: `${th * 100}%` }} aria-hidden />
        ))}
      </div>
      {showThresholds && (
        <div className="relative h-5 text-xs text-ink-soft latin" aria-hidden>
          <span className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: '60%' }}>0.60</span>
          <span className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: '90%' }}>0.90</span>
        </div>
      )}
      <p className="text-sm text-ink-soft mt-1">{note ?? t('confidence_note')}</p>
    </figure>
  )
}
