// Browser text-to-speech and speech-to-text. Free, on-device where the phone supports it.
// We are honest when a language is not available instead of pretending.

import { en } from '../i18n/en'
import { ur } from '../i18n/ur'
import { urSpoken } from '../i18n/urSpoken'

type Lang = 'en' | 'ur'
/** How the text was actually voiced, so the screen can say so honestly. */
export type VoiceMode = 'native' | 'urdu_via_hindi' | 'urdu_via_english' | 'none'

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

const find = (prefixes: string[]) => {
  const voices = window.speechSynthesis.getVoices()
  for (const p of prefixes) {
    const v = voices.find(x => x.lang.toLowerCase().replace('_', '-').startsWith(p))
    if (v) return v
  }
  return null
}
const urduVoice = () => find(['ur-pk', 'ur-in', 'ur'])
const hindiVoice = () => find(['hi-in', 'hi'])
const englishVoice = () => find(['en-in', 'en-pk', 'en-gb', 'en-us', 'en'])

/** Chrome fills the voice list asynchronously; the first tap often sees an empty list. */
function voicesReady(timeoutMs = 1500): Promise<void> {
  if (!ttsSupported() || window.speechSynthesis.getVoices().length) return Promise.resolve()
  return new Promise(resolve => {
    const done = () => { window.speechSynthesis.removeEventListener('voiceschanged', done); resolve() }
    window.speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, timeoutMs)
  })
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * Re-express Urdu UI text for another voice: every known Urdu phrase (with {placeholders})
 * is swapped for the same message in `target`. Longest phrases first so sentences beat words.
 */
export function respeak(text: string, target: Partial<Record<string, string>>): string {
  const keys = Object.keys(target).filter(k => (ur as Record<string, string>)[k])
    .sort((a, b) => (ur as Record<string, string>)[b].length - (ur as Record<string, string>)[a].length)
  let out = text
  for (const k of keys) {
    const from = (ur as Record<string, string>)[k], to = target[k]!
    const names: string[] = []
    const pattern = escape(from).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return '(.+?)' })
    out = out.replace(new RegExp(pattern + (names.length ? '(?=[.،۔?!؟\\s]|$)' : ''), 'g'), (...m) => {
      let r = to
      names.forEach((n, i) => { r = r.replace(`{${n}}`, m[i + 1]) })
      return r
    })
  }
  return out
}

/** Split into sentences: Chrome stops reading utterances longer than ~15 seconds. */
const sentences = (t: string) => t.split(/(?<=[.!?؟۔।])\s+/).map(x => x.trim()).filter(Boolean)

let session = 0
/**
 * Speak text in the person's language. For Urdu: an Urdu voice if the phone has one, otherwise the
 * Hindi voice reading the same spoken Urdu, otherwise English. Resolves with what was used.
 */
export async function speak(text: string, lang: Lang, onEnd?: () => void): Promise<VoiceMode> {
  if (!ttsSupported()) { onEnd?.(); return 'none' }
  const my = ++session
  window.speechSynthesis.cancel()
  await voicesReady()
  if (my !== session) return 'none' // a newer request replaced this one

  let voice: SpeechSynthesisVoice | null
  let say = text
  let mode: VoiceMode = 'native'
  if (lang === 'ur') {
    voice = urduVoice()
    if (!voice && (voice = hindiVoice())) { say = respeak(text, urSpoken); mode = 'urdu_via_hindi' }
    else if (!voice) { voice = englishVoice(); say = respeak(text, en); mode = 'urdu_via_english' }
  } else voice = englishVoice()

  const parts = sentences(say)
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p)
    if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = lang === 'ur' ? 'ur-PK' : 'en-US'
    u.rate = 0.9
    if (i === parts.length - 1) { u.onend = () => onEnd?.(); u.onerror = () => onEnd?.() }
    window.speechSynthesis.speak(u)
  })
  if (!parts.length) onEnd?.()
  // Chrome on some Android builds pauses the queue; nudging resume keeps it going
  window.speechSynthesis.resume()
  return mode
}
export function stopSpeaking() { session++; if (ttsSupported()) window.speechSynthesis.cancel() }

// ---- speech to text ----
interface SR {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string; confidence: number } } } }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
export function sttSupported() {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}
export function listen(lang: Lang, onText: (text: string, confidence: number) => void, onError: (code: string) => void): () => void {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition
  if (!Ctor) { onError('unsupported'); return () => {} }
  const r = new Ctor()
  r.lang = lang === 'ur' ? 'ur-PK' : 'en-PK'
  r.interimResults = false
  r.maxAlternatives = 1
  r.continuous = false
  let got = false
  r.onresult = e => { got = true; const alt = e.results[0][0]; onText(alt.transcript, alt.confidence) }
  r.onerror = e => onError(e.error)
  r.onend = () => { if (!got) onError('no-speech') }
  try { r.start() } catch { onError('start-failed') }
  return () => { try { r.abort() } catch { /* ignore */ } }
}

/** Turn spoken digits (incl. Urdu-Indic digits) into plain digits. */
export function digitsOnly(s: string) {
  return s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '')
}
