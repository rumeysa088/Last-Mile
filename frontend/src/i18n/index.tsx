import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type TKey } from './en'
import { ur } from './ur'

export type Lang = 'en' | 'ur'
const DICTS = { en, ur }
const KEY = 'lm_lang'

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey, vars?: Record<string, string | number>) => string; dir: 'ltr' | 'rtl' }
const I18nCtx = createContext<Ctx | null>(null)

export function fill(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem(KEY) as Lang) || 'ur' } catch { return 'ur' }
  })
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* ignore */ } }, [])
  const dir = lang === 'ur' ? 'rtl' : 'ltr'
  useEffect(() => {
    document.documentElement.lang = lang === 'ur' ? 'ur-PK' : 'en'
    document.documentElement.dir = dir
  }, [lang, dir])
  const t = useCallback((k: TKey, vars?: Record<string, string | number>) => fill(DICTS[lang][k] ?? en[k] ?? k, vars), [lang])
  const v = useMemo(() => ({ lang, setLang, t, dir }) as Ctx, [lang, setLang, t, dir])
  return <I18nCtx.Provider value={v}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  const c = useContext(I18nCtx)
  if (!c) throw new Error('useI18n outside I18nProvider')
  return c
}
export type { TKey }
