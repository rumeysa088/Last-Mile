import { getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import { realCases } from './real'
import type { CaseCreate, OCRResult } from './types'

export const casesApi = {
  list: (familyId?: string) => (USE_MOCK ? mock.listCases(getToken(), familyId) : realCases.list(familyId)),
  get: (id: string) => (USE_MOCK ? mock.getCase(getToken(), id) : realCases.get(id)),
  /** clientRef is generated once per draft and reused on every retry, so a retry never makes a second case. */
  create: (body: CaseCreate, clientRef: string, photo: { quality: string } | null = null) =>
    USE_MOCK ? mock.createCase(getToken(), body, clientRef) : realCases.create(body, clientRef, photo),
  /** Quality is checked on the phone so blurry photos are caught before using scarce data. */
  uploadDocument: (caseId: string, kind: string, file: Blob, quality: OCRResult['quality'], sharpness: number) =>
    USE_MOCK ? mock.uploadDocument(getToken(), caseId, kind, quality, sharpness) : realCases.uploadDocument(caseId, kind, file, quality, sharpness),
}
