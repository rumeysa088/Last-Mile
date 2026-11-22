import { CheckCircle2, Circle, FileImage, Send, Cpu, UserCheck, XCircle, HelpCircle } from 'lucide-react'
import type { StatusEvent } from '../api/types'
import { useI18n, type TKey } from '../i18n'

const ICON: Record<string, typeof Circle> = {
  submitted: Send, routed: Cpu, document_added: FileImage, approved: CheckCircle2, rejected: XCircle, needs_information: HelpCircle, under_review: UserCheck,
}

export default function StatusTimeline({ events }: { events: StatusEvent[] }) {
  const { t, lang } = useI18n()
  return (
    <ol className="relative border-s-2 border-ink/15 ms-3 space-y-5">
      {events.map((e, i) => {
        const Icon = ICON[e.status] ?? Circle
        return (
          <li key={i} className="ms-6">
            <span className="absolute -start-[15px] flex h-7 w-7 items-center justify-center rounded-full bg-paper border-2 border-ink/20">
              <Icon size={15} aria-hidden />
            </span>
            <div className="font-bold">{t(`status_${e.status}` as TKey)}</div>
            <div className="text-sm text-ink-soft latin">{new Date(e.at).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            <p className="text-sm mt-1" dir="auto">{e.note}</p>
          </li>
        )
      })}
    </ol>
  )
}
