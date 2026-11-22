// Unmistakable "who am I helping" bar. Coloured per family; always visible on helper screens.
import { Repeat } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { familyColor, initials, useHelper } from '../pages/helper/HelperContext'
import { useI18n } from '../i18n'

export default function HelperBar() {
  const { active, clear } = useHelper()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  if (!active) return null
  const c = familyColor(active.id)
  return (
    <div className="sticky top-[58px] z-20 -mx-4 mb-4 px-4 py-2 flex items-center gap-3 border-b-4" style={{ background: c.soft, borderColor: c.solid }} aria-live="polite">
      <span className="latin flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white font-bold" style={{ background: c.solid }} aria-hidden>{initials(active.head_name)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-ink-soft">{t('now_helping')}</div>
        <div className="font-bold truncate">{lang === 'ur' ? active.head_name_ur : active.head_name} {active.cnic_last4 && <span className="latin text-ink-soft font-normal text-sm">•••{active.cnic_last4}</span>}</div>
      </div>
      <button className="btn-small bg-white" onClick={() => { clear(); nav('/helper') }}><Repeat size={16} aria-hidden /> {t('switch_family')}</button>
    </div>
  )
}
