// Network condition simulator for demos and testing (judges can't always toggle airplane mode).
// 'flaky' = the request reaches the server but the reply is lost, which is exactly
// the case that creates duplicate applications if retries are not idempotent.
export type NetMode = 'online' | 'slow' | 'flaky' | 'offline'
const KEY = 'lm_net_mode'
type Listener = (m: NetMode) => void
const listeners = new Set<Listener>()

export function getNetMode(): NetMode {
  try {
    const m = localStorage.getItem(KEY) as NetMode | null
    if (m) return m
  } catch { /* storage blocked */ }
  return 'online'
}
export function setNetMode(m: NetMode) {
  try { localStorage.setItem(KEY, m) } catch { /* ignore */ }
  listeners.forEach(l => l(m))
}
export function onNetMode(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } }

/** Effective connectivity: real browser state AND the simulator. */
export function isOnline(): boolean {
  const real = typeof navigator === 'undefined' ? true : navigator.onLine
  return real && getNetMode() !== 'offline'
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
