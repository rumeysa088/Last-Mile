// User-initiated voice input. The microphone only opens when the person taps.
// The transcript is ALWAYS shown back (and read aloud) for confirmation before it is used.
import { Mic, Keyboard, RotateCcw, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { digitsOnly, listen, speak, sttSupported } from '../lib/speech'
import Sheet from './Sheet'

interface Props {
  onConfirm: (text: string) => void
  onTypeInstead?: () => void
  kind?: 'text' | 'digits'
  size?: 'dock' | 'inline'
  label?: string
}

export default function VoiceButton({ onConfirm, onTypeInstead, kind = 'text', size = 'dock', label }: Props) {
  const { t, lang } = useI18n()
  const [state, setState] = useState<'idle' | 'listening' | 'confirm' | 'error'>('idle')
  const [heard, setHeard] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const stopRef = useRef<() => void>(() => {})
  useEffect(() => () => stopRef.current(), [])

  const start = () => {
    if (!sttSupported()) { setErrMsg(t('voice_unsupported')); setState('error'); return }
    setState('listening')
    stopRef.current = listen(lang, text => {
      const value = kind === 'digits' ? digitsOnly(text) : text.trim()
      setHeard(value)
      setState('confirm')
      speak(`${t('voice_heard')}: ${value}`, lang)
    }, code => {
      setState(s => (s === 'confirm' ? s : 'error'))
      setErrMsg(code === 'unsupported' ? t('voice_unsupported') : t('voice_failed'))
    })
  }
  const close = () => { stopRef.current(); setState('idle') }

  const big = size === 'dock'
  return (
    <>
      <button type="button" onClick={state === 'listening' ? close : start}
        aria-label={label ?? t('voice_speak')} aria-pressed={state === 'listening'}
        className={`${big ? 'w-[76px] h-[76px] -mt-8 border-4 border-paper' : 'w-14 h-14'} shrink-0 rounded-full bg-saffron text-ink flex items-center justify-center hover:bg-saffron-dark hover:text-white transition-colors ${state === 'listening' ? 'listening' : ''}`}>
        <Mic size={big ? 34 : 26} aria-hidden strokeWidth={2.4} />
      </button>
      {state === 'listening' && <span className="sr-only" role="status">{t('voice_listening')}</span>}

      <Sheet open={state === 'confirm'} onClose={close} title={t('voice_heard')}>
        <p className="text-2xl font-bold bg-white rounded-xl border-2 border-saffron px-4 py-3 mb-5 break-words" dir="auto">{heard || '…'}</p>
        <div className="grid gap-3">
          <button className="btn-primary" disabled={!heard} onClick={() => { onConfirm(heard); close() }}><Check aria-hidden /> {t('voice_use')}</button>
          <button className="btn-quiet" onClick={start}><RotateCcw aria-hidden /> {t('voice_again')}</button>
          {onTypeInstead && <button className="btn-quiet" onClick={() => { close(); onTypeInstead() }}><Keyboard aria-hidden /> {t('voice_type')}</button>}
        </div>
      </Sheet>
      <Sheet open={state === 'error'} onClose={close} title={t('voice_speak')}>
        <p className="mb-5">{errMsg}</p>
        <div className="grid gap-3">
          {sttSupported() && <button className="btn-primary" onClick={start}><RotateCcw aria-hidden /> {t('try_again')}</button>}
          <button className="btn-quiet" onClick={() => { close(); onTypeInstead?.() }}><Keyboard aria-hidden /> {t('voice_type')}</button>
        </div>
      </Sheet>
    </>
  )
}
