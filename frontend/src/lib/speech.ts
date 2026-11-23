// Browser text-to-speech and speech-to-text. Free, on-device where the phone supports it.
// We are honest when a language is not available instead of pretending.
export type VoiceMode = 'voice' | 'text' | 'auto' | 'urdu_via_hindi' | 'urdu_via_english';

type Lang = 'en' | 'ur'
const TTS_LANG: Record<Lang, string[]> = { 
  ur: ['ur-PK', 'ur-IN', 'ur', 'hi-IN', 'hi'], 
  en: ['en-PK', 'en-IN', 'en-GB', 'en-US', 'en'] 
}

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  for (const code of TTS_LANG[lang]) {
    const v = voices.find(x => x.lang.toLowerCase().startsWith(code.toLowerCase()))
    if (v) return v
  }
  return null
}

/** Speak text. Returns the VoiceMode used, or null if unsupported. */
export function speak(text: string, lang: Lang, onEnd?: () => void): VoiceMode | null {
  if (!ttsSupported()) return null
  
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const v = pickVoice(lang)
  
  if (v) u.voice = v
  u.lang = v?.lang ?? (lang === 'ur' ? 'ur-PK' : 'en-US')
  u.rate = 0.9
  u.onend = () => onEnd?.()
  u.onerror = () => onEnd?.()
  
  window.speechSynthesis.speak(u)

  // Return the mode based on which voice was actually used
  if (!v) return 'auto'
  if (lang === 'ur' && v.lang.startsWith('hi')) return 'urdu_via_hindi'
  if (lang === 'ur' && v.lang.startsWith('en')) return 'urdu_via_english'
  return 'voice'
}

export function stopSpeaking() { if (ttsSupported()) window.speechSynthesis.cancel() }
export function hasUrduVoice() { return ttsSupported() && !!pickVoice('ur') }

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