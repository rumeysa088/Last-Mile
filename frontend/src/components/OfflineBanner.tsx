// Every piece of work has a visible state: saved on this phone, waiting, sending, sent, failed.
import { CloudOff, Loader2, CheckCircle2, AlertTriangle, Smartphone, Send, Trash2 } from 'lucide-react'
import { retryItem, removeItem } from '../offline/queue'
import { useSync } from '../offline/SyncProvider'
import { useI18n } from '../i18n'

export default function OfflineBanner({ draftSavedAt }: { draftSavedAt?: number | null }) {
  const { t } = useI18n()
  const { items, online, syncNow } = useSync()
  const visible = items.filter(i => i.state !== 'synced' || Date.now() - i.updated_at < 90_000)
  if (online && !visible.length && !draftSavedAt) return null
  return (
    <div className="space-y-2 text-start" aria-live="polite">
      {!online && (
        <div className="flex items-center gap-3 rounded-xl bg-ink text-paper px-4 py-3">
          <CloudOff aria-hidden className="shrink-0" />
          <span><span className="font-bold">{t('net_offline')}.</span> {t('sync_saved')}.</span>
        </div>
      )}
      {draftSavedAt && !visible.length && (
        <div className="flex items-center gap-2 text-sm text-teal-dark"><Smartphone size={18} aria-hidden /> {t('sync_saved')}</div>
      )}
      {visible.map(i => (
        <div key={i.id} className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 border-2 ${
          i.state === 'failed' ? 'border-danger bg-danger-light' : i.state === 'synced' ? 'border-safe bg-safe-light' : 'border-saffron bg-saffron-light'}`}>
          {i.state === 'queued' && <Smartphone aria-hidden className="shrink-0 text-saffron-dark" />}
          {i.state === 'syncing' && <Loader2 aria-hidden className="shrink-0 animate-spin text-saffron-dark" />}
          {i.state === 'synced' && <CheckCircle2 aria-hidden className="shrink-0 text-safe" />}
          {i.state === 'failed' && <AlertTriangle aria-hidden className="shrink-0 text-danger" />}
          <div className="flex-1 min-w-[10rem]">
            <div className="font-bold">
              {i.state === 'queued' && t('sync_queued')}
              {i.state === 'syncing' && t('sync_syncing')}
              {i.state === 'synced' && <>{t('sync_synced', { ref: '' })}<span className="latin whitespace-nowrap" dir="ltr">{i.server_reference}</span></>}
              {i.state === 'failed' && t('sync_failed', { reason: i.last_error ?? '' })}
            </div>
            <div className="text-sm text-ink-soft">{t('sync_for', { name: i.label })}{i.attempts > 1 && i.state !== 'synced' ? ` (${i.attempts}×)` : ''}</div>
          </div>
          {i.state === 'queued' && online && <button className="btn-small" onClick={() => syncNow()}><Send size={16} aria-hidden /> {t('sync_send_now')}</button>}
          {i.state === 'failed' && i.payload && i.last_error !== null && !i.server_reference && (
            <button className="btn-small" onClick={() => retryItem(i.id).then(syncNow)}>{t('try_again')}</button>)}
          {i.state === 'failed' && <button className="btn-small" onClick={() => removeItem(i.id)} aria-label={t('sync_delete')}><Trash2 size={16} aria-hidden /></button>}
        </div>
      ))}
    </div>
  )
}
