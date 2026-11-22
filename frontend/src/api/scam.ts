import { getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import { realScam } from './real'

export const scamApi = {
  /** A's API expects { message, language } (backend/app/schemas/scam.py ScamCheckRequest). */
  check: (message: string, language: 'en' | 'ur') => (USE_MOCK ? mock.scamCheck(getToken(), message) : realScam.check(message, language)),
}
