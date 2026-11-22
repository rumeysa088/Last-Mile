import { getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import { realConsent } from './real'
import type { AccessEvent, Consent } from './types'

export interface ConsentGrant { family_id?: string; recipient_id: string; purpose: string; data_scope: string[]; confirmed_by_citizen: boolean }

/** Scope choices the citizen can pick. The real API stores one scope string per permission. */
export const SCOPE_OPTIONS = USE_MOCK ? ['name', 'cnic', 'phone', 'household', 'income', 'case_status', 'documents'] : ['read_write', 'read_only']
export const SCOPE_SINGLE = !USE_MOCK

export const consentApi = {
  list: (familyId?: string) => (USE_MOCK ? mock.listConsents(getToken(), familyId) : realConsent.list(familyId)),
  grant: (body: ConsentGrant) => (USE_MOCK ? mock.grantConsent(getToken(), body) : realConsent.grant(body)),
  updateScope: (c: Consent, data_scope: string[]) =>
    USE_MOCK ? mock.updateConsentScope(getToken(), c.id, data_scope) : realConsent.updateScope(c, data_scope[0]),
  withdraw: (id: string) => (USE_MOCK ? mock.withdrawConsent(getToken(), id) : realConsent.withdraw(id)),
  accessLog: (): Promise<AccessEvent[] | null> => (USE_MOCK ? mock.accessLog(getToken()) : realConsent.accessLog()),
  /** Helpers cannot record consent in the real API; the family gives it from their own phone. */
  helperCanRecord: USE_MOCK,
}
