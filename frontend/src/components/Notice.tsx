import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

const S = {
  info: ['bg-teal-light border-teal', Info], warn: ['bg-saffron-light border-saffron', AlertTriangle],
  danger: ['bg-danger-light border-danger', ShieldAlert], ok: ['bg-safe-light border-safe', CheckCircle2],
} as const

export default function Notice({ tone = 'info', title, children }: { tone?: keyof typeof S; title?: string; children?: ReactNode }) {
  const [cls, Icon] = S[tone]
  return (
    <div className={`flex gap-3 rounded-xl border-s-4 px-4 py-3 ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden className="shrink-0 mt-1" />
      <div>{title && <div className="font-bold">{title}</div>}{children}</div>
    </div>
  )
}
