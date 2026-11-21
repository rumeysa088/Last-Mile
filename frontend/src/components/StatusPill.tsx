import type { CaseStatus } from '../api/types'
import { useI18n, type TKey } from '../i18n'

const C: Record<CaseStatus, string> = {
  draft: 'bg-ink/10 text-ink', pending: 'bg-teal-light text-teal-dark', info_needed: 'bg-saffron-light text-saffron-dark',
  approved: 'bg-safe-light text-safe', rejected: 'bg-danger-light text-danger',
}
export default function StatusPill({ status }: { status: CaseStatus }) {
  const { t } = useI18n()
  return <span className={`inline-block rounded-full px-3 py-0.5 text-sm font-bold ${C[status]}`}>{t(`status_${status}` as TKey)}</span>
}
