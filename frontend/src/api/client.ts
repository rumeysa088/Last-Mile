// frontend/src/api/client.ts
// Shared HTTP client. Coordinates with C.
// C additions: exported http() with Idempotency-Key + NetworkError, Me type, and D's mocks now
// read/write the shared mock DB (mockServer.ts) so citizen cases reach the officer queue and
// published rules drive new citizen cases. Officer UI code is unchanged.
import { ApiError, NetworkError } from '../lib/errors'
import { getNetMode } from '../lib/net'
import { mockDb, mock, type MockRule } from './mockServer'
export type { Me } from './types'
import type { Me } from './types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') === 'true'

export type CaseStatus = 'draft' | 'pending' | 'info_needed' | 'approved' | 'rejected'

export interface CaseSummary {
  id: string
  citizen_name: string
  program_code: string
  status: CaseStatus
  route: 'ready' | 'more_info' | 'human_review' | null
  ai_confidence: number | null
  submitted_at: string
  tenant_id: string
}

export interface CaseDetail extends CaseSummary {
  ai_explanation: { summary: string; reasons: string[]; sources: string[] } | null
  missing_fields: string[]
  ocr_warnings: string[]
  rule_version_id: string | null
  documents: { id: string; kind: string; url: string }[]
}

export interface RuleVersion {
  id: string
  program_code: string
  version: number
  status: 'active' | 'draft' | 'archived'
  rules_json: Record<string, unknown>
  created_by: string
  created_at: string
  notes?: string
}

function getToken(): string | null {
  return localStorage.getItem('access_token')
}

export { getToken }

export async function http<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey)
  if (getNetMode() === 'offline') throw new NetworkError()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new NetworkError()
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? `HTTP ${res.status}`, body?.error?.details)
  }
  return res.json() as Promise<T>
}

// ---------- MOCKS (until A lands backend) ----------
const MOCK_CASES: CaseSummary[] = [
  { id: 'c-001', citizen_name: 'Ayesha Bibi',  program_code: 'BISP-2026', status: 'pending', route: 'human_review', ai_confidence: 0.62, submitted_at: '2026-11-21T10:00:00Z', tenant_id: 't-punjab' },
  { id: 'c-002', citizen_name: 'Muhammad Ali', program_code: 'BISP-2026', status: 'pending', route: 'more_info',    ai_confidence: 0.41, submitted_at: '2026-11-21T09:30:00Z', tenant_id: 't-punjab' },
  { id: 'c-003', citizen_name: 'Fatima Khan',  program_code: 'BISP-2026', status: 'pending', route: 'ready',         ai_confidence: 0.91, submitted_at: '2026-11-21T08:15:00Z', tenant_id: 't-punjab' },
]
// Rules live in the shared mock DB so a rule published here is used by the next citizen case.
const rulesStore = () => mockDb().rules as unknown as RuleVersion[]
const persist = () => { try { localStorage.setItem('lm_mockdb_v2', JSON.stringify(mockDb())) } catch { /* ignore */ } }
const MOCK_RULES = { find: (f: (r: RuleVersion) => boolean) => rulesStore().find(f), filter: (f: (r: RuleVersion) => boolean) => rulesStore().filter(f) }
// Citizen/helper cases from the shared mock DB, shaped for the officer queue
function citizenCases(): CaseSummary[] {
  return mockDb().cases.map(c => ({ id: c.id, citizen_name: c.applicant_name, program_code: c.program_code, status: c.status, route: c.route,
    ai_confidence: c.ai_confidence, submitted_at: c.submitted_at, tenant_id: 't-sindh-relief' }))
}
function citizenDetail(id: string): CaseDetail | null {
  const c = mockDb().cases.find(x => x.id === id)
  if (!c) return null
  const r = mockDb().rules.find((x: MockRule) => x.id === c.rule_version_id)
  return { ...citizenCases().find(x => x.id === id)!, ai_explanation: { summary: c.user_explanation, reasons: c.reasons, sources: c.sources.map(s => s.title) },
    missing_fields: c.missing_fields, ocr_warnings: c.doc_quality && c.doc_quality !== 'good' ? ['CNIC photo: low quality, fields uncertain'] : [],
    rule_version_id: r ? `${r.id} (v${r.version})` : c.rule_version_id, documents: c.documents.map(d => ({ id: d.id, kind: d.kind, url: '#' })) }
}

// ---------- PUBLIC API ----------
export const api = {
  me: () =>
    USE_MOCK
      ? mock.me(getToken())
      : http<Me>('/auth/me'),

  listCases: (params: { status?: CaseStatus; q?: string } = {}) => {
    if (USE_MOCK) {
      let out = [...citizenCases(), ...MOCK_CASES]
      if (params.status) out = out.filter(c => c.status === params.status)
      if (params.q) out = out.filter(c => c.citizen_name.toLowerCase().includes(params.q!.toLowerCase()))
      return Promise.resolve(out)
    }
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.q) qs.set('q', params.q)
    return http<CaseSummary[]>(`/cases?${qs.toString()}`)
  },

  getCase: (id: string) => {
    if (USE_MOCK) {
      const real = citizenDetail(id)
      if (real) return Promise.resolve(real)
      const base = MOCK_CASES.find(c => c.id === id) ?? MOCK_CASES[0]
      return Promise.resolve<CaseDetail>({
        ...base,
        ai_explanation: {
          summary: 'Income stated appears above threshold; requires officer verification.',
          reasons: ['Stated monthly income 62,000 PKR exceeds rule limit', 'OCR confidence moderate on income certificate'],
          sources: ['BISP-2026 policy §4.2', 'Rule version v3'],
        },
        missing_fields: base.route === 'more_info' ? ['proof_of_residence'] : [],
        ocr_warnings: ['Income certificate: low contrast, numeric field uncertain'],
        rule_version_id: 'r-3',
        documents: [
          { id: 'd-1', kind: 'cnic', url: '#' },
          { id: 'd-2', kind: 'income_cert', url: '#' },
        ],
      })
    }
    return http<CaseDetail>(`/cases/${id}`)
  },

    reviewCase: (id: string, decision: 'approve' | 'reject' | 'request_info', reason: string) => {
    if (USE_MOCK) {
      const shared = mock.officerReview(id, decision, reason)
      if (shared) return Promise.resolve(shared)
      return Promise.resolve({ id, status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_needed', reason })
    }
    return http<{ id: string; status: CaseStatus; reason: string }>(`/cases/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ 
        status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_needed', 
        reason 
      })
    })
  },

  getActiveRule: (program: string) =>
    USE_MOCK
      ? Promise.resolve(MOCK_RULES.find(r => r.status === 'active' && r.program_code === program) ?? rulesStore()[0])
      : http<RuleVersion>(`/rules/active?program=${program}`),

  listRules: (program: string) =>
    USE_MOCK
      ? Promise.resolve(MOCK_RULES.filter(r => r.program_code === program))
      : http<RuleVersion[]>(`/rules?program=${program}`),

  createRuleDraft: (program: string, rules_json: Record<string, unknown>, notes?: string) => {
    if (USE_MOCK) {
      const all = rulesStore()
      const v = Math.max(0, ...all.filter(r => r.program_code === program).map(r => r.version)) + 1
      const next = { id: `r-${v}`, program_code: program, version: v, status: 'draft' as const, rules_json, created_by: 'officer@demo.lastmile', created_at: new Date().toISOString(), notes }
      all.unshift(next); persist()
      return Promise.resolve(next)
    }
    return http<RuleVersion>(`/rules`, { method: 'POST', body: JSON.stringify({ program_code: program, rules_json, notes }) })
  },

  publishRule: (id: string) => {
    if (USE_MOCK) {
      const r = MOCK_RULES.find(x => x.id === id)
      if (r) { rulesStore().forEach(x => { if (x.program_code === r.program_code && x.status === 'active') x.status = 'archived' }); r.status = 'active'; persist() }
      return Promise.resolve(r!)
    }
    return http<RuleVersion>(`/rules/${id}/publish`, { method: 'POST' })
  },
}