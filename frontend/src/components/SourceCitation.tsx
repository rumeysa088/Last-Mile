// Where an AI or rule answer came from. Shown wherever a result is explained.
import { BookOpen } from 'lucide-react'
import type { Source } from '../api/types'
import { useI18n } from '../i18n'

export default function SourceCitation({ sources, model }: { sources: Source[]; model?: string }) {
  const { t } = useI18n()
  if (!sources.length && !model) return null
  return (
    <div className="border-s-4 border-teal/40 ps-4 py-1">
      <div className="text-sm font-bold text-ink-soft mb-1">{t('sources_title')}</div>
      <ul className="space-y-1">
        {sources.map(s => (
          <li key={`${s.identifier}-${s.chunk_id}`} className="flex gap-2 items-start text-sm">
            <BookOpen size={16} className="mt-1 shrink-0 text-teal" aria-hidden />
            <span className="latin" dir="ltr">{s.title} <span className="text-ink-faint">({s.identifier}, {s.chunk_id})</span></span>
          </li>
        ))}
      </ul>
      {model && <div className="text-xs text-ink-faint mt-1"><span>{t('model_used', { model: '' })}</span> <span className="latin" dir="ltr">{model}</span></div>}
    </div>
  )
}
