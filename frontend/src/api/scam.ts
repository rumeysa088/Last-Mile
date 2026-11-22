import { getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import { realScam } from './real'

export const scamApi = {
  check: (text: string, language: 'en' | 'ur') => (USE_MOCK ? mock.scamCheck(getToken(), text) : realScam.check(text, language)),
}
