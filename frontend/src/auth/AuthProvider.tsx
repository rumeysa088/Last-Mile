import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { Me } from '../api/types'
import { isNetworkError } from '../lib/errors'

interface Ctx { me: Me | null; loading: boolean; login: (email: string, password: string) => Promise<Me>; logout: () => void }
const AuthCtx = createContext<Ctx | null>(null)
const ME_CACHE = 'lm_me' // lets a signed-in person reopen the app with no signal

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(() => { try { return JSON.parse(localStorage.getItem(ME_CACHE) || 'null') } catch { return null } })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('access_token')) { setMe(null); setLoading(false); return }
    authApi.me()
      .then(m => { setMe(m); localStorage.setItem(ME_CACHE, JSON.stringify(m)) })
      .catch(e => { if (!isNetworkError(e)) { localStorage.removeItem('access_token'); localStorage.removeItem(ME_CACHE); setMe(null) } })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const tok = await authApi.login(email, password)
    localStorage.setItem('access_token', tok.access_token)
    const m = await authApi.me()
    localStorage.setItem(ME_CACHE, JSON.stringify(m))
    setMe(m)
    return m
  }, [])
  const logout = useCallback(() => {
    localStorage.removeItem('access_token'); localStorage.removeItem(ME_CACHE)
    sessionStorage.clear()
    setMe(null)
  }, [])
  return <AuthCtx.Provider value={{ me, loading, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}

export const homeFor = (role: Me['role']) => (role === 'citizen' ? '/citizen' : role === 'community_helper' ? '/helper' : '/admin')
