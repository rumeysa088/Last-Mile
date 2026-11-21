import { http, getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import type { AccessEvent, Consent, Paged } from './types'

export interface ConsentGrant { family_id?: string; recipient_id: string; purpose: string; data_scope: string[]; confirmed_by_citizen: boolean }

export const consentApi = {
  list: (familyId?: string) =>
    USE_MOCK ? mock.listConsents(getToken(), familyId)
      : http<Paged<Consent>>(`/consents${familyId ? `?family_id=${encodeURIComponent(familyId)}` : ''}`),
  grant: (body: ConsentGrant) =>
    USE_MOCK ? mock.grantConsent(getToken(), body) : http<Consent>('/consents', { method: 'POST', body: JSON.stringify(body) }),
  updateScope: (id: string, data_scope: string[]) =>
    USE_MOCK ? mock.updateConsentScope(getToken(), id, data_scope)
      : http<Consent>(`/consents/${id}`, { method: 'PATCH', body: JSON.stringify({ data_scope }) }),
  withdraw: (id: string) =>
    USE_MOCK ? mock.withdrawConsent(getToken(), id) : http<Consent>(`/consents/${id}/withdraw`, { method: 'POST' }),
  accessLog: () => (USE_MOCK ? mock.accessLog(getToken()) : http<AccessEvent[]>('/consents/access-log')),
}
