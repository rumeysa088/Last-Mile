// Demo control: lets judges drop the signal without airplane mode. Clearly labelled as a test tool.
import { Wifi, WifiOff, Signal, SignalLow } from 'lucide-react'
import { useState } from 'react'
import { setNetMode, type NetMode } from '../lib/net'
import { useSync } from '../offline/SyncProvider'
import { useI18n } from '../i18n'
import Sheet from './Sheet'

const MODES: { m: NetMode; icon: typeof Wifi; key: 'net_online' | 'net_slow' | 'net_flaky' | 'net_offline' }[] = [
  { m: 'online', icon: Wifi, key: 'net_online' }, { m: 'slow', icon: SignalLow, key: 'net_slow' },
  { m: 'flaky', icon: Signal, key: 'net_flaky' }, { m: 'offline', icon: WifiOff, key: 'net_offline' },
]

export default function NetworkSimulator() {
  const { t } = useI18n()
  const { netMode, online, items } = useSync()
  const [open, setOpen] = useState(false)
  const cur = MODES.find(x => x.m === (online ? netMode : 'offline'))!
  const pending = items.filter(i => i.state === 'queued' || i.state === 'syncing').length
  return (
    <>
      <button className={`btn-small ${!online ? 'bg-ink text-paper border-ink' : netMode !== 'online' ? 'border-saffron' : ''}`} onClick={() => setOpen(true)} aria-label={`${t('net_test')}: ${t(cur.key)}`}>
        <cur.icon size={18} aria-hidden /> <span className="hidden sm:inline">{t(cur.key)}</span>
        {pending > 0 && <span className="latin rounded-full bg-saffron text-ink px-2 text-xs">{pending}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('net_test')}>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {MODES.map(x => (
            <button key={x.m} role="radio" aria-checked={netMode === x.m} onClick={() => { setNetMode(x.m); setOpen(false) }}
              className={`btn flex-col h-24 border-2 ${netMode === x.m ? 'border-teal bg-teal-light' : 'border-ink/15 bg-white'}`}>
              <x.icon aria-hidden /> {t(x.key)}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
