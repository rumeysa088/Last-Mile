// Real-backend implementations (VITE_USE_MOCK=false). Talks to A's FastAPI exactly as it is.
// Collection routes use a trailing slash: FastAPI otherwise answers 307, and browsers may drop a
// redirected cross-origin preflight, which breaks the deployed site.
import { http } from './client'
import { applicantData, decodeDescription, encodeDescription, toCitizenCase, triage } from './caseCodec'
import type {
  AccessEvent, AIResult, BackendCase, BackendConsent, BackendDocument, BackendEvaluation, BackendFamily, BackendScam,
  CaseCreate, CitizenCase, Consent, Family, Me, OCRResult, Paged,
} from './types'
import { ApiError, isNetworkError } from '../lib/errors'
import { nameSimilarity, POSSIBLE_MATCH } from '../lib/names'

const paged = <T,>(items: T[]): Paged<T> => ({ items, total: items.length, page: 1, page_size: items.length })
const me = (): Me | null => { try { return JSON.parse(localStorage.getItem('lm_me') || 'null') } catch { return null } }

/** Give consent refusals a stable code so screens can offer the right next step. */
async function call<T>(p: Promise<T>): Promise<T> {
  try { return await p } catch (e) {
    if (e instanceof ApiError && e.status === 403 && /consent/i.test(e.message)) throw new ApiError(403, 'CONSENT_REQUIRED', e.message, e.details)
    if (e instanceof ApiError && e.status === 403 && /not assigned/i.test(e.message)) throw new ApiError(403, 'NOT_ASSIGNED', e.message, e.details)
    throw e
  }
}

// ---------- duplicate protection for retries ----------
// A's POST /cases has no Idempotency-Key, so each application carries a client_ref inside its
// description. Before re-sending a ref we already tried, we look for it on the server first.
const ATTEMPTED = 'lm_attempted_refs'
const attempted = (): string[] => { try { return JSON.parse(localStorage.getItem(ATTEMPTED) || '[]') } catch { return [] } }
const markAttempted = (ref: string) => localStorage.setItem(ATTEMPTED, JSON.stringify([...attempted().filter(r => r !== ref), ref].slice(-50)))

async function findByRef(ref: string): Promise<BackendCase | null> {
  const all = await http<BackendCase[]>('/cases/?limit=100')
  return all.find(c => decodeDescription(c.description)?.client_ref === ref) ?? null
}

const FAMILY_KEY = 'lm_own_family'
async function ownFamilyId(name: string): Promise<string> {
  const cached = sessionStorage.getItem(FAMILY_KEY)
  if (cached) return cached
  const fams = await http<BackendFamily[]>('/families/')
  const id = fams[0]?.id ?? (await http<BackendFamily>('/families/', { method: 'POST', body: JSON.stringify({ name }) })).id
  sessionStorage.setItem(FAMILY_KEY, id)
  return id
}

export const realCases = {
  list: (familyId?: string) => call((async () => {
    const all = await http<BackendCase[]>('/cases/?limit=100')
    return paged(all.filter(c => !familyId || c.family_id === familyId).map(c => toCitizenCase(c)))
  })()),

  get: (id: string) => call((async () => {
    const c = await http<BackendCase>(`/cases/${id}`)
    const docs = await http<BackendDocument[]>(`/cases/${id}/documents`).catch(() => undefined)
    return toCitizenCase(c, docs)
  })()),

  create: (body: CaseCreate, clientRef: string, photo: { quality: string } | null = null) => call((async (): Promise<CitizenCase> => {
    if (attempted().includes(clientRef)) {
      const existing = await findByRef(clientRef)
      if (existing) return { ...toCitizenCase(existing), idempotent_replay: true }
    }
    const user = me()
    const family_id = user?.role === 'citizen' ? await ownFamilyId(body.applicant_name || user.full_name) : body.family_id
    const application: CaseCreate = { ...body, family_id }
    // Versioned, audited rule check on the server. If it is unavailable we still accept the
    // application and say so; a person then checks eligibility.
    let ev: BackendEvaluation | null = null
    try {
      ev = await http<BackendEvaluation>('/rules/evaluate', { method: 'POST', body: JSON.stringify({ applicant_data: applicantData(application) }) })
    } catch (e) { if (isNetworkError(e)) throw e }
    const description = encodeDescription({ v: 1, client_ref: clientRef, application, triage: triage(application, ev, photo) })
    markAttempted(clientRef)
    const c = await http<BackendCase>('/cases/', { method: 'POST', body: JSON.stringify({ title: `Relief application: ${application.applicant_name}`, description, family_id }) })
    return toCitizenCase(c)
  })()),

  uploadDocument: (caseId: string, _kind: string, file: Blob, quality: OCRResult['quality'], sharpness: number) => call((async (): Promise<OCRResult> => {
    const fd = new FormData()
    fd.append('file', file, (file as File).name || 'cnic.jpg')
    const doc = await http<BackendDocument>(`/cases/${caseId}/documents`, { method: 'POST', body: fd })
    // Server OCR (B's process_image) when available; it reads text only and never verifies identity.
    if (doc.ocr) return { ...doc.ocr, identity_verified: false, requires_human_review: true }
    const low = quality !== 'good'
    return {
      fields: [], raw_text: '', quality, confidence: low ? 0.35 : 0.8, model_version: 'client-quality-check-v1', identity_verified: false,
      warnings: low ? [`Photo sharpness ${sharpness.toFixed(0)} is below 60.`] : [],
      explanation: low ? 'Photo received, but it is hard to read. An officer will check it.' : 'Photo received. An officer will check it.',
      requires_human_review: true,
    }
  })()),
}

function toFamily(f: BackendFamily, all: BackendFamily[], cases: BackendCase[]): Family {
  const latest = cases.filter(c => c.family_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return {
    id: f.id, head_name: f.name, head_name_ur: f.name, district: '', members_count: 0, cnic_last4: '',
    consent_status: 'active', latest_case_status: latest?.status ?? null,
    possible_duplicates: all.filter(o => o.id !== f.id && nameSimilarity(o.name, f.name) >= POSSIBLE_MATCH).map(o => o.id),
  }
}

export const realFamilies = {
  // A's API only lists families that are assigned to this helper AND have active consent.
  list: () => call((async () => {
    const [fams, cases] = await Promise.all([http<BackendFamily[]>('/families/?limit=100'), http<BackendCase[]>('/cases/?limit=100').catch(() => [])])
    return paged(fams.map(f => toFamily(f, fams, cases)))
  })()),
  get: (id: string) => call((async () => toFamily(await http<BackendFamily>(`/families/${id}`), [], []))()),
}

function toConsent(c: BackendConsent): Consent {
  return {
    id: c.id, family_id: c.family_id, purpose: c.purpose === 'case_support' || !c.purpose ? 'Help with relief application' : c.purpose,
    data_scope: [c.scope], recipient_type: 'community_helper', recipient_id: c.recipient_id ?? '',
    recipient_name: c.recipient_id ? 'Your community helper' : 'Any community helper the department assigns',
    status: c.status === 'active' ? 'active' : 'withdrawn', granted_at: c.granted_at, withdrawn_at: c.withdrawn_at,
  }
}

export const realConsent = {
  // Newest record per recipient: "share again" creates a new record, the withdrawn one stays in the audit trail.
  list: (familyId?: string) => call((async () => {
    const all = await http<BackendConsent[]>(`/consents/${familyId ? `?family_id=${encodeURIComponent(familyId)}` : ''}`)
    const seen = new Set<string>()
    const latest = [...all].sort((a, b) => b.granted_at.localeCompare(a.granted_at))
      .filter(c => { const k = `${c.family_id}:${c.recipient_id ?? 'any'}`; if (seen.has(k)) return false; seen.add(k); return true })
    return paged(latest.map(toConsent))
  })()),
  grant: (b: { family_id?: string; recipient_id: string; purpose: string; data_scope: string[] }) => call((async () =>
    toConsent(await http<BackendConsent>('/consents/', { method: 'POST', body: JSON.stringify({
      family_id: b.family_id, recipient_id: b.recipient_id || null, purpose: b.purpose, scope: b.data_scope[0] ?? 'read_write' }) })))()),
  /** A's API has no scope edit: withdraw the old permission and record a new one (both audited). */
  updateScope: (c: Consent, scope: string) => call((async () => {
    await http<BackendConsent>(`/consents/${c.id}/withdraw`, { method: 'POST' })
    return toConsent(await http<BackendConsent>('/consents/', { method: 'POST', body: JSON.stringify({ family_id: c.family_id, recipient_id: c.recipient_id || null, purpose: c.purpose, scope }) }))
  })()),
  withdraw: (id: string) => call((async () => toConsent(await http<BackendConsent>(`/consents/${id}/withdraw`, { method: 'POST' })))()),
  /** The audit log is officer-only in A's API; citizens do not get an access log yet. */
  accessLog: async (): Promise<AccessEvent[] | null> => null,
}

const STEPS: Record<AIResult['result'], string[]> = {
  suspicious: ['Do not click links or share PIN/OTP/CNIC.', 'Do not send any money.', 'Report the number and delete the message.', 'Check using the official website or helpline.'],
  likely_legitimate: ['Still verify through the official website or helpline before acting.', 'Never share your PIN or OTP.'],
  unknown: ['Do not act on this message yet.', 'A person will review it; or check with the official helpline.'],
}

export const realScam = {
  check: (message: string, language: 'en' | 'ur') => call((async (): Promise<AIResult> => {
    const r = await http<BackendScam>('/scam/check', { method: 'POST', body: JSON.stringify({ message, language }) })
    return {
      ...r,
      safe_next_steps: r.safe_next_steps?.length ? r.safe_next_steps : STEPS[r.result] ?? STEPS.unknown,
      sources: r.sources.map((s, i) => (typeof s === 'string' ? { title: s, identifier: s, chunk_id: String(i) } : s)),
    }
  })()),
}
