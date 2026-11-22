// Reads text aloud. Every question and every result has one, so a person who cannot read can still follow.
// If the phone has no Urdu voice, the Hindi voice reads the same spoken Urdu, and the screen says so.
import { Volume2, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { speak, stopSpeaking, ttsSupported, type VoiceMode } from '../lib/speech'

export default function ListenButton({ text, auto = false, className = '' }: { text: string; auto?: boolean; className?: string }) {
  const { t, lang } = useI18n()
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<VoiceMode | null>(null)
  const alive = useRef(true)

  const play = async () => {
    setPlaying(true)
    const m = await speak(text, lang, () => { if (alive.current) setPlaying(false) })
    if (alive.current) setMode(m)
  }
  useEffect(() => {
    alive.current = true
    let id: number | undefined
    if (auto && ttsSupported()) id = window.setTimeout(play, 350)
    return () => { alive.current = false; clearTimeout(id); stopSpeaking() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, auto])
  if (!ttsSupported()) return null

  const note = lang === 'ur' && mode === 'urdu_via_hindi' ? t('voice_via_hindi') : lang === 'ur' && mode === 'urdu_via_english' ? t('voice_no_urdu') : null
  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      <button type="button" className="btn-small text-teal-dark" aria-label={`${t('listen')}: ${text}`}
        onClick={() => (playing ? (stopSpeaking(), setPlaying(false)) : play())}>
        {playing ? <Square size={18} aria-hidden /> : <Volume2 size={20} aria-hidden />}
        {playing ? t('stop') : t('listen')}
      </button>
      {note && <span className="text-xs text-ink-soft mt-1" role="note">{note}</span>}
    </span>
  )
}
