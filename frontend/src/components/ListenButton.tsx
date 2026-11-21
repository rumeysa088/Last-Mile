// Reads text aloud. Every question and every result has one, so a person who cannot read can still follow.
import { Volume2, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { hasUrduVoice, speak, stopSpeaking, ttsSupported } from '../lib/speech'

export default function ListenButton({ text, auto = false, className = '' }: { text: string; auto?: boolean; className?: string }) {
  const { t, lang } = useI18n()
  const [playing, setPlaying] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const play = () => {
    setNote(lang === 'ur' && !hasUrduVoice() ? t('voice_no_urdu') : null)
    setPlaying(true)
    speak(text, lang, () => setPlaying(false))
  }
  useEffect(() => {
    if (auto && ttsSupported()) { const id = setTimeout(play, 300); return () => { clearTimeout(id); stopSpeaking() } }
    return () => stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, auto])
  if (!ttsSupported()) return null
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
