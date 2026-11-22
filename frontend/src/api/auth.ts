import { http, USE_MOCK, getToken } from './client'
import { mock } from './mockServer'
import type { Me } from './types'

export const authApi = {
  login: (email: string, password: string) =>
    USE_MOCK ? mock.login(email, password)
      : http<{ access_token: string; token_type: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => (USE_MOCK ? mock.me(getToken()) : http<Me>('/auth/me')),
}
