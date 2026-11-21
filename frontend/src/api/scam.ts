import { http, getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import type { AIResult } from './types'

export const scamApi = {
  check: (text: string, language: 'en' | 'ur') =>
    USE_MOCK ? mock.scamCheck(getToken(), text)
      : http<AIResult>('/scam/check', { method: 'POST', body: JSON.stringify({ text, language }) }),
}
