import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { casesApi } from '../api/cases'
import { useAuth } from '../auth/AuthProvider'
import { getNetMode, isOnline, onNetMode, type NetMode } from '../lib/net'
import { queueStore, type QueueItem } from './db'
import { onQueueChange, pruneSynced, syncAll } from './queue'

interface Ctx { items: QueueItem[]; online: boolean; netMode: NetMode; syncNow: () => Promise<void> }
const SyncCtx = createContext<Ctx | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const [items, setItems] = useState<QueueItem[]>([])
  const [netMode, setNetModeState] = useState<NetMode>(getNetMode())
  const [online, setOnline] = useState(isOnline())

  const refresh = useCallback(async () => {
    const all = await queueStore.all()
    setItems(me ? all.filter(i => i.owner_id === me.id) : [])
  }, [me])

  const run = useCallback(async (force = false) => {
    if (!me || !isOnline()) return
    await syncAll((p, k) => casesApi.create(p, k), { force, ownerId: me.id })
  }, [me])

  useEffect(() => {
    refresh(); pruneSynced()
    const offQ = onQueueChange(refresh)
    const update = () => { setOnline(isOnline()); setNetModeState(getNetMode()); if (isOnline()) run(true) }
    const offN = onNetMode(update)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    const timer = window.setInterval(() => run(false), 4000)
    run(true)
    return () => { offQ(); offN(); window.removeEventListener('online', update); window.removeEventListener('offline', update); clearInterval(timer) }
  }, [refresh, run])

  return <SyncCtx.Provider value={{ items, online, netMode, syncNow: () => run(true) }}>{children}</SyncCtx.Provider>
}
export function useSync() {
  const c = useContext(SyncCtx)
  if (!c) throw new Error('useSync outside SyncProvider')
  return c
}
