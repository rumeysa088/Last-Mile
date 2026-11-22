// Shapes the citizen/helper UI expects from A's backend.
// PROPOSED until A publishes docs/api-contract.md. Keep snake_case to match the API.
// AI shapes mirror B's backend/app/services/ai/schemas.py exactly.

export type Role = 'citizen' | 'community_helper' | 'officer_admin'

export interface Me {
  id: string
  email: string
  role: Role
  full_name: string
  tenant_id: string
  family_id?: string | null // set for citizens
}

// Same vocabulary as A's backend (models.Case ck_cases_valid_status). One vocabulary everywhere.
export type CaseStatus = 'submitted' | 'under_review' | 'needs_information' | 'approved' | 'rejected' | 'closed'
export type CaseRoute = 'ready' | 'more_info' | 'human_review' | null

export type IncomeBand = 'lt_20k' | '20k_35k' | '35k_50k' | 'gt_50k'
export type HouseholdSituation = 'widow' | 'disability' | 'elderly' | 'none'

export interface CaseCreate {
  program_code: string
  family_id: string | null
  applicant_name: string
  cnic: string // synthetic only, format 12345-1234567-1
  phone: string
  district: string
  household_size: number
  household_situation: HouseholdSituation
  monthly_income_pkr: number | null // null when the person only picked a band
  income_band: IncomeBand
  submitted_via: 'self' | 'helper'
  voice_used: boolean
}

export interface StatusEvent {
  status: CaseStatus | 'document_added' | 'routed'
  at: string
  actor: string // 'you', 'helper: <name>', 'system', 'officer'
  note: string // plain words, safe to show to the citizen
}

export interface Source { title: string; identifier: string; chunk_id: string }

export interface CitizenCase {
  id: string
  reference: string
  program_code: string
  applicant_name: string
  family_id: string | null
  status: CaseStatus
  route: CaseRoute
  ai_confidence: number | null
  user_explanation: string // simple reason for the citizen
  reasons: string[]
  missing_fields: string[]
  rule_version_id: string | null
  sources: Source[]
  history: StatusEvent[]
  submitted_at: string
  submitted_by: string
  documents: { id: string; kind: string; quality: string }[]
  idempotent_replay?: boolean
}

export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }

export interface Family {
  id: string
  head_name: string
  head_name_ur: string
  district: string
  members_count: number
  cnic_last4: string
  consent_status: 'active' | 'withdrawn' | 'none'
  latest_case_status: CaseStatus | null
  possible_duplicates: string[] // family ids with a similar name. Never merged automatically.
}

export interface Consent {
  id: string
  family_id: string
  purpose: string
  data_scope: string[]
  recipient_type: 'community_helper' | 'department'
  recipient_id: string
  recipient_name: string
  status: 'active' | 'withdrawn'
  granted_at: string
  withdrawn_at: string | null
}

export interface AccessEvent { at: string; who: string; action: string }

// --- AI (B) ---
export type Verdict = 'suspicious' | 'likely_legitimate' | 'unknown'
export interface AIResult {
  result: Verdict
  confidence: number
  explanation: string
  evidence: string[]
  safe_next_steps: string[]
  sources: Source[]
  model_version: string
  requires_human_review: boolean
}
export interface FieldResult { name: string; value: string | null; status: 'ok' | 'missing' | 'uncertain' }
export interface OCRResult {
  fields: FieldResult[]
  raw_text: string
  quality: 'good' | 'low' | 'unreadable' | 'unknown'
  warnings: string[]
  confidence: number
  explanation: string
  model_version: string
  requires_human_review: boolean
  identity_verified: false
}

export interface ApiErrorBody { error: { code: string; message: string; details?: unknown; request_id?: string } }

// --- A's backend shapes (backend/app/schemas) ---
export interface BackendCase {
  id: string; tenant_id: string; family_id: string | null; created_by: string; assigned_to: string | null
  title: string; description: string | null; status: CaseStatus; created_at: string; updated_at: string
}
export interface BackendFamily { id: string; tenant_id: string; created_by: string | null; name: string; created_at: string }
export interface BackendConsent {
  id: string; family_id: string; granted_by: string; subject_id: string | null; recipient_id: string | null
  purpose: string | null; scope: string; status: 'active' | 'withdrawn' | 'expired'; granted_at: string; withdrawn_at: string | null
}
export interface BackendDocument { id: string; case_id: string; uploaded_by: string; filename: string; content_type: string | null; created_at: string; ocr?: OCRResult | null }
export interface BackendEvaluation {
  id: string; rule_version_id: string; case_id: string | null; input_snapshot: Record<string, unknown>
  result: { rule_set_id?: string; rule_version?: number; breakdown?: { field: string; operator: string; expected: unknown; actual: unknown; status: string; message: string }[] }
  missing_fields: string[]; outcome: 'eligible' | 'ineligible' | 'unknown'; evaluated_at: string
}
export interface BackendScam { result: Verdict; confidence: number; explanation: string; evidence: string[]; safe_next_steps?: string[]; sources: (string | Source)[]; model_version: string; requires_human_review: boolean }
