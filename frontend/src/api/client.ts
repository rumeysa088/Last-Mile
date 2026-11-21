// frontend/src/api/client.ts
// Shared HTTP client. Coordinates with C.
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

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------- MOCKS (until A lands backend) ----------
const MOCK_CASES: CaseSummary[] = [
  { id: 'c-001', citizen_name: 'Ayesha Bibi',  program_code: 'BISP-2026', status: 'pending', route: 'human_review', ai_confidence: 0.62, submitted_at: '2026-11-21T10:00:00Z', tenant_id: 't-punjab' },
  { id: 'c-002', citizen_name: 'Muhammad Ali', program_code: 'BISP-2026', status: 'pending', route: 'more_info',    ai_confidence: 0.41, submitted_at: '2026-11-21T09:30:00Z', tenant_id: 't-punjab' },
  { id: 'c-003', citizen_name: 'Fatima Khan',  program_code: 'BISP-2026', status: 'pending', route: 'ready',         ai_confidence: 0.91, submitted_at: '2026-11-21T08:15:00Z', tenant_id: 't-punjab' },
]
const MOCK_RULES: RuleVersion[] = [
  { id: 'r-3', program_code: 'BISP-2026', version: 3, status: 'active', rules_json: { max_income_pkr: 50000, min_age: 18, requires_cnic: true }, created_by: 'admin@lastmile.pk', created_at: '2026-11-20T12:00:00Z', notes: 'Initial active rules' },
  { id: 'r-2', program_code: 'BISP-2026', version: 2, status: 'archived', rules_json: { max_income_pkr: 45000, min_age: 18, requires_cnic: true }, created_by: 'admin@lastmile.pk', created_at: '2026-11-19T12:00:00Z', notes: 'Raised income ceiling' },
]

// ---------- PUBLIC API ----------
export const api = {
  me: () =>
    USE_MOCK
      ? Promise.resolve({ id: 'u-1', email: 'officer@lastmile.pk', role: 'officer_admin', full_name: 'Demo Officer', tenant_id: 't-punjab' })
      : http<{ id: string; email: string; role: string; full_name: string; tenant_id: string }>('/auth/me'),

  listCases: (params: { status?: CaseStatus; q?: string } = {}) => {
    if (USE_MOCK) {
      let out = [...MOCK_CASES]
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
    if (USE_MOCK) return Promise.resolve({ id, status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_needed', reason })
    return http<{ id: string; status: CaseStatus; reason: string }>(`/cases/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    })
  },

  getActiveRule: (program: string) =>
    USE_MOCK
      ? Promise.resolve(MOCK_RULES.find(r => r.status === 'active' && r.program_code === program) ?? MOCK_RULES[0])
      : http<RuleVersion>(`/rules/active?program=${program}`),

  listRules: (program: string) =>
    USE_MOCK
      ? Promise.resolve(MOCK_RULES.filter(r => r.program_code === program))
      : http<RuleVersion[]>(`/rules?program=${program}`),

  createRuleDraft: (program: string, rules_json: Record<string, unknown>, notes?: string) => {
    if (USE_MOCK) {
      const next = { id: `r-${MOCK_RULES.length + 1}`, program_code: program, version: MOCK_RULES.length + 1, status: 'draft' as const, rules_json, created_by: 'you@lastmile.pk', created_at: new Date().toISOString(), notes }
      MOCK_RULES.unshift(next)
      return Promise.resolve(next)
    }
    return http<RuleVersion>(`/rules`, { method: 'POST', body: JSON.stringify({ program_code: program, rules_json, notes }) })
  },

  publishRule: (id: string) => {
    if (USE_MOCK) {
      const r = MOCK_RULES.find(x => x.id === id)
      if (r) { MOCK_RULES.forEach(x => { if (x.program_code === r.program_code && x.status === 'active') x.status = 'archived' }); r.status = 'active' }
      return Promise.resolve(r!)
    }
    return http<RuleVersion>(`/rules/${id}/publish`, { method: 'POST' })
  },
}