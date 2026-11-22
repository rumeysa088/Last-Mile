import { afterEach, describe, expect, it } from 'vitest'
import { respeak, speak } from '../lib/speech'
import { ur } from '../i18n/ur'
import { en } from '../i18n/en'
import { urSpoken } from '../i18n/urSpoken'
import { fill } from '../i18n'

type U = { text: string; lang: string; voice: { lang: string } | null; rate: number; onend?: () => void; onerror?: () => void }
function fakeTTS(voiceLangs: string[]) {
  const spoken: U[] = []
  const voices = voiceLangs.map(lang => ({ lang, name: lang }))
  ;(globalThis as any).SpeechSynthesisUtterance = class { text: string; lang = ''; voice = null; rate = 1; onend?: () => void; constructor(t: string) { this.text = t } }
  ;(window as any).speechSynthesis = {
    getVoices: () => voices, cancel: () => {}, resume: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    speak: (u: U) => { spoken.push(u); u.onend?.() },
  }
  return spoken
}
afterEach(() => { delete (window as any).speechSynthesis })

const question = `${ur.q_cnic}. ${ur.q_cnic_hint}`

describe('Urdu read-aloud works on phones without an Urdu voice', () => {
  it('uses the Urdu voice when the phone has one', async () => {
    const said = fakeTTS(['en-US', 'ur-PK', 'hi-IN'])
    expect(await speak(question, 'ur')).toBe('native')
    expect(said[0].lang).toBe('ur-PK'); expect(said[0].text).toContain('شناختی')
  })
  it('falls back to the Hindi voice reading the same spoken Urdu (typical Windows/Android)', async () => {
    const said = fakeTTS(['en-US', 'hi-IN'])
    expect(await speak(question, 'ur')).toBe('urdu_via_hindi')
    expect(said.every(u => u.lang === 'hi-IN')).toBe(true)
    const all = said.map(u => u.text).join(' ')
    expect(all).toContain('शनाख़्ती कार्ड नंबर')
    expect(all).not.toMatch(/[؀-ۿ]/) // no Urdu-script left for a Hindi voice to stumble on
  })
  it('last resort: English voice reads the English version, never silence', async () => {
    const said = fakeTTS(['en-US'])
    expect(await speak(question, 'ur')).toBe('urdu_via_english')
    expect(said.map(u => u.text).join(' ')).toContain('CNIC number')
  })
  it('long text is split into sentences (Chrome cuts off long utterances)', async () => {
    const said = fakeTTS(['hi-IN'])
    await speak(`${ur.consent_title}. ${ur.consent_intro}`, 'ur')
    expect(said.length).toBeGreaterThan(1)
  })
})

describe('respeak keeps placeholders and covers every spoken key', () => {
  it('fills names into templates', () => {
    expect(respeak(fill(ur.hello, { name: 'Zainab Bibi' }), urSpoken)).toBe('अस्सलाम अलैकुम, Zainab Bibi')
  })
  it('every urSpoken entry has the same placeholders as ur.ts', () => {
    for (const [k, v] of Object.entries(urSpoken)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
      expect(ph(v!), k).toBe(ph((ur as any)[k]))
    }
  })
  it('the apply questions, options and results are all fully converted', () => {
    const keys = ['q_name', 'q_name_hint', 'q_cnic', 'q_cnic_hint', 'q_phone', 'q_phone_hint', 'q_district', 'q_household', 'q_household_hint',
      'q_situation', 'sit_widow', 'sit_disability', 'sit_elderly', 'sit_none', 'q_income', 'q_income_hint', 'band_lt_20k', 'band_20k_35k',
      'band_35k_50k', 'band_gt_50k', 'q_photo', 'q_photo_hint', 'review_title', 'review_hint', 'choose_one', 'sent_ref', 'queued_title', 'queued_body',
      'verdict_suspicious', 'verdict_unknown', 'verdict_likely_legitimate', 'scam_never_guarantee', 'scam_steps'] as const
    for (const k of keys) expect(respeak((ur as any)[k], urSpoken), k).not.toMatch(/[؀-ۿ]/)
    expect(respeak(ur.q_cnic, en)).toBe(en.q_cnic)
  })
})
