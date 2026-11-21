// "Helper Mode": one shared phone, many families. The family being helped is held in
// sessionStorage only (cleared on logout / tab close) and auto-clears after 3 idle minutes.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Family } from '../../api/types'

const KEY = 'lm_active_family'
export const IDLE_MS = 3 * 60 * 1000
interface Ctx { active: Family | null; select: (f: Family) => void; clear: (reason?: 'idle' | 'manual') => void; lockedReason: 'idle' | null; dismissLock: () => void }
const HelperCtx = createContext<Ctx | null>(null)

export function HelperProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Family | null>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null } })
  const [lockedReason, setLocked] = useState<'idle' | null>(null)
  const last = useRef(Date.now())

  const select = useCallback((f: Family) => { setActive(f); setLocked(null); sessionStorage.setItem(KEY, JSON.stringify(f)); last.current = Date.now() }, [])
  const clear = useCallback((reason: 'idle' | 'manual' = 'manual') => {
    setActive(null); sessionStorage.removeItem(KEY); if (reason === 'idle') setLocked('idle')
  }, [])

  useEffect(() => {
    const bump = () => { last.current = Date.now() }
    const evs = ['pointerdown', 'keydown', 'touchstart']
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }))
    const t = window.setInterval(() => { if (active && Date.now() - last.current > IDLE_MS) clear('idle') }, 5000)
    return () => { evs.forEach(e => window.removeEventListener(e, bump)); clearInterval(t) }
  }, [active, clear])

  return <HelperCtx.Provider value={{ active, select, clear, lockedReason, dismissLock: () => setLocked(null) }}>{children}</HelperCtx.Provider>
}
export function useHelper() {
  const c = useContext(HelperCtx)
  if (!c) throw new Error('useHelper outside HelperProvider')
  return c
}

/** Stable, distinct colour per family so a glance shows who is active. */
const HUES = [168, 32, 262, 340, 205, 88, 12, 290, 140, 225]
export function familyColor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = HUES[h % HUES.length]
  return { solid: `hsl(${hue} 55% 34%)`, soft: `hsl(${hue} 60% 92%)` }
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
