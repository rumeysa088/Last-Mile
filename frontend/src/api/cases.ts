import { http, getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import type { CaseCreate, CitizenCase, OCRResult, Paged } from './types'

export const casesApi = {
  list: (familyId?: string) =>
    USE_MOCK ? mock.listCases(getToken(), familyId)
      : http<Paged<CitizenCase>>(`/cases${familyId ? `?family_id=${encodeURIComponent(familyId)}` : ''}`),
  get: (id: string) => (USE_MOCK ? mock.getCase(getToken(), id) : http<CitizenCase>(`/cases/${id}`)),
  /** idempotencyKey is generated once per draft and reused on every retry. */
  create: (body: CaseCreate, idempotencyKey: string) => {
    // Add a default title if the form didn't provide one, to satisfy A's backend schema
    const payload = { title: 'Relief Application', ...body };
    
    return USE_MOCK ? mock.createCase(getToken(), payload, idempotencyKey)
      : http<CitizenCase>('/cases', { method: 'POST', body: JSON.stringify(payload), idempotencyKey })
  },
  /** Multipart upload. Quality metadata is computed on the phone so blurry photos are caught before upload. */
  uploadDocument: (caseId: string, kind: string, file: Blob, quality: OCRResult['quality'], sharpness: number) => {
    if (USE_MOCK) return mock.uploadDocument(getToken(), caseId, kind, quality, sharpness)
    const fd = new FormData()
    fd.append('kind', kind); fd.append('file', file); fd.append('client_quality', quality); fd.append('client_sharpness', String(sharpness))
    return http<OCRResult>(`/cases/${caseId}/documents`, { method: 'POST', body: fd })
  },
}
