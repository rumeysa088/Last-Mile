// In-browser MOCK of A's backend, used while VITE_USE_MOCK=true (default until A lands).
// It deliberately behaves like a real server, not like a stub:
//  - identifies the caller from the bearer token, never from client-supplied role/ids
//  - enforces role, tenant and consent on every read and write (403 on withdrawn consent)
//  - honours Idempotency-Key so a retried submission never creates a second case
//  - writes an audit entry for every write and every family/case read
//  - routes cases with versioned rules + B's guardrail thresholds; it NEVER approves
// All people below are synthetic. Prototype only.

import type {
  AccessEvent, AIResult, CaseCreate, CaseStatus, CitizenCase, Consent, Family, Me, OCRResult, Paged, StatusEvent,
} from './types'
import { ApiError, NetworkError } from '../lib/errors'
import { getNetMode, sleep } from '../lib/net'
import { nameSimilarity, POSSIBLE_MATCH } from '../lib/names'
import { heuristicClassify } from '../lib/scamRules'
import { uuid } from '../lib/uid'

const DB_KEY = 'lm_mockdb_v2'
const TENANT = 't-sindh-relief'
export const PROGRAM = 'BISP-2026'

// B's thresholds (docs/DECISIONS.md §3): act alone only if P(wrong) < 1/10
export const AUTO_THRESHOLD = 0.9
export const HUMAN_THRESHOLD = 0.6

export interface MockRule {
  id: string; program_code: string; version: number; status: 'active' | 'draft' | 'archived'
  rules_json: { max_income_pkr: number; min_age?: number; requires_cnic?: boolean; [k: string]: unknown }
  created_by: string; created_at: string; notes?: string
}
interface User extends Me { password: string }
interface AuditEntry { id: string; at: string; actor_id: string; actor_name: string; action: string; target: string; family_id: string | null }
interface StoredCase extends CitizenCase { input: CaseCreate; idempotency_key: string | null; doc_quality: string | null }
interface DB {
  users: User[]; families: Family[]; consents: Consent[]; cases: StoredCase[]
  rules: MockRule[]; audit: AuditEntry[]; idem: Record<string, string>; seq: number
}

// ---------------- seed (synthetic) ----------------
const GIVEN: [string, string][] = [
  ['Ayesha', 'عائشہ'], ['Fatima', 'فاطمہ'], ['Shabana', 'شبانہ'], ['Nasreen', 'نسرین'], ['Rubina', 'روبینہ'],
  ['Kulsoom', 'کلثوم'], ['Parveen', 'پروین'], ['Saima', 'صائمہ'], ['Sughra', 'صغریٰ'], ['Hajra', 'ہاجرہ'],
  ['Muhammad Aslam', 'محمد اسلم'], ['Abdul Rauf', 'عبدالرؤف'], ['Ghulam Nabi', 'غلام نبی'], ['Allah Ditta', 'اللہ دتہ'],
  ['Rashid', 'راشد'], ['Naseem', 'نسیم'], ['Bashir', 'بشیر'], ['Yousuf', 'یوسف'], ['Shakeel', 'شکیل'], ['Zubair', 'زبیر'],
]
const FAMILY: [string, string][] = [
  ['Bibi', 'بی بی'], ['Khatoon', 'خاتون'], ['Baloch', 'بلوچ'], ['Memon', 'میمن'], ['Shaikh', 'شیخ'],
  ['Qureshi', 'قریشی'], ['Ansari', 'انصاری'], ['Solangi', 'سولنگی'],
]
export const DISTRICTS = ['Korangi', 'Malir', 'Keamari', 'Karachi South', 'Karachi East', 'Karachi West']

function seed(): DB {
  const now = Date.now()
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString()
  const users: User[] = [
    { id: 'u-zainab', email: 'zainab@demo.lastmile', password: 'demo1234', role: 'citizen', full_name: 'Zainab Bibi', tenant_id: TENANT, family_id: 'f-001' },
    { id: 'u-imran', email: 'imran@demo.lastmile', password: 'demo1234', role: 'citizen', full_name: 'Imran Qureshi', tenant_id: TENANT, family_id: 'f-002' },
    { id: 'u-rukhsana', email: 'helper@demo.lastmile', password: 'demo1234', role: 'community_helper', full_name: 'Rukhsana Baloch', tenant_id: TENANT, family_id: null },
    { id: 'u-officer', email: 'officer@demo.lastmile', password: 'demo1234', role: 'officer_admin', full_name: 'Demo Officer', tenant_id: TENANT, family_id: null },
  ]
  const fam = (id: string, en: string, ur: string, d: number, members: number, last4: string, consent: Family['consent_status']): Family => ({
    id, head_name: en, head_name_ur: ur, district: DISTRICTS[d % DISTRICTS.length], members_count: members,
    cnic_last4: last4, consent_status: consent, latest_case_status: null, possible_duplicates: [],
  })
  const families: Family[] = [
    fam('f-001', 'Zainab Bibi', 'زینب بی بی', 0, 5, '4021', 'active'),
    fam('f-002', 'Imran Qureshi', 'عمران قریشی', 2, 4, '7730', 'none'),
  ]
  // 36 generated + 2 named + 2 deliberate look-alikes = 40 families, like the brief's helper
  for (let i = 0; i < 36; i++) {
    const g = GIVEN[(i * 7) % GIVEN.length], f = FAMILY[(i * 3) % FAMILY.length]
    const consent: Family['consent_status'] = i % 9 === 4 ? 'withdrawn' : i % 11 === 6 ? 'none' : 'active'
    families.push(fam(`f-${String(i + 3).padStart(3, '0')}`, `${g[0]} ${f[0]}`, `${g[1]} ${f[1]}`, i, 2 + ((i * 5) % 7), String(1000 + ((i * 7919) % 9000)), consent))
  }
  // Deliberate bad data: same person? Different spellings, different CNICs. Must NOT be merged.
  families.push(fam('f-041', 'Mohammad Aslam Ansari', 'محمد اسلم انصاری', 4, 6, '5512', 'active'))
  families.push(fam('f-042', 'Aisha Bibi', 'عائشہ بی بی', 0, 3, '8804', 'active'))

  const consents: Consent[] = []
  for (const f of families) {
    if (f.consent_status === 'none') continue
    consents.push({
      id: `cn-${f.id}`, family_id: f.id, purpose: 'Help with relief application', data_scope: ['name', 'cnic', 'phone', 'household', 'income', 'case_status'],
      recipient_type: 'community_helper', recipient_id: 'u-rukhsana', recipient_name: 'Rukhsana Baloch (community helper)',
      status: f.consent_status === 'withdrawn' ? 'withdrawn' : 'active', granted_at: iso(60 * 24 * 12), withdrawn_at: f.consent_status === 'withdrawn' ? iso(60 * 24 * 2) : null,
    })
  }
  consents.push({
    id: 'cn-f-001-dept', family_id: 'f-001', purpose: 'Check eligibility for relief', data_scope: ['name', 'cnic', 'household', 'income', 'documents'],
    recipient_type: 'department', recipient_id: TENANT, recipient_name: 'Relief department (mock)', status: 'active', granted_at: iso(60 * 24 * 12), withdrawn_at: null,
  })
  const rules: MockRule[] = [
    { id: 'r-3', program_code: PROGRAM, version: 3, status: 'active', rules_json: { max_income_pkr: 50000, min_age: 18, requires_cnic: true }, created_by: 'officer@demo.lastmile', created_at: iso(60 * 24), notes: 'Initial active rules' },
    { id: 'r-2', program_code: PROGRAM, version: 2, status: 'archived', rules_json: { max_income_pkr: 45000, min_age: 18, requires_cnic: true }, created_by: 'officer@demo.lastmile', created_at: iso(60 * 48), notes: 'Raised income ceiling' },
  ]
  const db: DB = { users, families, consents, cases: [], rules, audit: [], idem: {}, seq: 140 }
  // a few historic cases so tracking and the officer queue are not empty
  const pre: [string, Partial<CaseCreate>, CaseStatus | null, number][] = [
    ['f-001', { monthly_income_pkr: 18000, income_band: 'lt_20k', household_situation: 'widow' }, null, 60 * 30],
    ['f-005', { monthly_income_pkr: 47000, income_band: '35k_50k' }, null, 60 * 5],
    ['f-008', { monthly_income_pkr: null, income_band: '20k_35k' }, 'approved', 60 * 70],
  ]
  for (const [fid, extra, final, ago] of pre) {
    const f = db.families.find(x => x.id === fid)!
    const input: CaseCreate = {
      program_code: PROGRAM, family_id: fid, applicant_name: f.head_name, cnic: `42201-${String(1000000 + Number(fid.slice(2)) * 137).slice(0, 7)}-${f.cnic_last4.slice(-1)}`,
      phone: '0300-0000000', district: f.district, household_size: f.members_count, household_situation: 'none', monthly_income_pkr: 20000,
      income_band: 'lt_20k', submitted_via: 'helper', voice_used: false, ...extra,
    }
    const c = createCase(db, input, users[2], null, ago)
    if (final) {
      c.status = final
      c.history.push({ status: final, at: iso(ago - 60 * 24), actor: 'officer', note: final === 'approved' ? 'An officer checked and approved your application.' : 'An officer made a decision.' })
    }
  }
  return db
}

// ---------------- persistence ----------------
let cache: DB | null = null
function load(): DB {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return (cache = JSON.parse(raw) as DB)
  } catch { /* corrupted -> reseed */ }
  cache = seed(); save(); return cache
}
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(cache)) } catch { /* quota */ } }
export function resetMockDb() { cache = seed(); save() }
export function mockDb() { return load() }

// ---------------- helpers ----------------
const err = (status: number, code: string, message: string) => new ApiError(status, code, message)
function whoami(db: DB, token: string | null): User {
  const id = token?.startsWith('mock.') ? token.slice(5) : null
  const u = db.users.find(x => x.id === id)
  if (!u) throw err(401, 'UNAUTHENTICATED', 'Please log in again.')
  return u
}
function audit(db: DB, u: User | { id: string; full_name: string }, action: string, target: string, family_id: string | null) {
  db.audit.push({ id: uuid(), at: new Date().toISOString(), actor_id: u.id, actor_name: u.full_name, action, target, family_id })
}
function helperHasConsent(db: DB, helperId: string, familyId: string) {
  return db.consents.some(c => c.family_id === familyId && c.recipient_id === helperId && c.status === 'active')
}
/** Server-side gate for any family-scoped access. */
function assertFamilyAccess(db: DB, u: User, familyId: string | null) {
  if (u.role === 'officer_admin') return
  if (u.role === 'citizen') {
    if (familyId !== u.family_id) throw err(403, 'FORBIDDEN', 'You can only see your own family record.')
    return
  }
  if (!familyId) throw err(400, 'FAMILY_REQUIRED', 'Choose the family you are helping first.')
  const f = db.families.find(x => x.id === familyId)
  if (!f) throw err(404, 'NOT_FOUND', 'Family not found.')
  if (!helperHasConsent(db, u.id, familyId)) {
    audit(db, u, 'access_denied.no_consent', familyId, familyId); save()
    const w = db.consents.find(c => c.family_id === familyId && c.recipient_id === u.id)
    throw err(403, w ? 'CONSENT_WITHDRAWN' : 'CONSENT_REQUIRED',
      w ? `${f.head_name} withdrew permission on ${new Date(w.withdrawn_at!).toLocaleDateString()}. You can no longer see or change this family's data.`
        : `${f.head_name} has not given you permission yet.`)
  }
}
function activeRule(db: DB, program: string) {
  const r = db.rules.find(x => x.program_code === program && x.status === 'active')
  if (!r) throw err(409, 'NO_ACTIVE_RULE', 'No active rule for this program.')
  return r
}
function refreshFamily(db: DB, familyId: string | null) {
  if (!familyId) return
  const f = db.families.find(x => x.id === familyId)
  if (!f) return
  const latest = db.cases.filter(c => c.family_id === familyId).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0]
  f.latest_case_status = latest?.status ?? null
  f.consent_status = db.consents.some(c => c.family_id === familyId && c.recipient_type === 'community_helper' && c.status === 'active') ? 'active'
    : db.consents.some(c => c.family_id === familyId && c.recipient_type === 'community_helper') ? 'withdrawn' : 'none'
}
function computeDuplicates(db: DB) {
  for (const f of db.families) {
    f.possible_duplicates = db.families.filter(o => o.id !== f.id && o.district === f.district && nameSimilarity(o.head_name, f.head_name) >= POSSIBLE_MATCH).map(o => o.id)
  }
}

/** Mock of A's rule engine + B's guardrails. Advisory routing only: never approves or rejects. */
function evaluate(db: DB, c: StoredCase) {
  const rule = db.rules.find(r => r.id === c.rule_version_id) ?? activeRule(db, c.program_code)
  const max = Number(rule.rules_json.max_income_pkr)
  const i = c.input
  let conf = 0.95
  const reasons: string[] = []
  const missing: string[] = []
  let escalate = false
  if (i.monthly_income_pkr != null) {
    if (i.monthly_income_pkr > max) { escalate = true; reasons.push(`Income (Rs ${i.monthly_income_pkr.toLocaleString()}) is above the limit of Rs ${max.toLocaleString()} in rule v${rule.version}. An officer must decide.`) }
    else if (i.monthly_income_pkr > max * 0.9) { conf -= 0.25; reasons.push(`Income is close to the limit of Rs ${max.toLocaleString()}, so proof of income is needed.`) }
  } else {
    if (i.income_band === 'gt_50k' && max <= 50000) { escalate = true; reasons.push('Income band is above the limit. An officer must decide.') }
    else if (i.income_band === '35k_50k') { conf -= 0.3; missing.push('exact_monthly_income'); reasons.push('Only an income range was given and it is near the limit, so the exact amount is needed.') }
    else { conf -= 0.05; reasons.push('Only an income range was given.') }
  }
  if (!c.documents.some(d => d.kind === 'cnic')) { conf -= 0.15; missing.push('cnic_photo'); reasons.push('A photo of the CNIC has not been added yet.') }
  if (c.doc_quality === 'low' || c.doc_quality === 'unreadable') { conf -= 0.2; reasons.push('The CNIC photo is hard to read. A person will check it.') }
  const dupes = db.families.filter(f => f.id !== c.family_id && f.district === i.district && nameSimilarity(f.head_name, i.applicant_name) >= POSSIBLE_MATCH)
  if (dupes.length) { escalate = true; reasons.push(`A similar name is already registered in ${i.district} (${dupes.map(d => d.head_name).join(', ')}). Records are not merged; an officer will check they are different people.`) }
  conf = Math.max(0.05, Math.round(conf * 100) / 100)
  let route: CitizenCase['route']
  if (escalate || conf < HUMAN_THRESHOLD) route = 'human_review'
  else if (conf < AUTO_THRESHOLD) route = 'more_info'
  else route = 'ready'
  if (!reasons.length) reasons.push(`All answers fit rule v${rule.version}.`)
  c.ai_confidence = conf
  c.route = route
  c.reasons = reasons
  c.missing_fields = missing
  c.user_explanation =
    route === 'ready' ? 'Your answers fit the rules. An officer will give the final decision. Nothing is approved by the computer alone.'
      : route === 'more_info' ? 'We need a little more proof before an officer can decide. See what is missing below.'
        : 'The system is not sure, so a person will look at your application. This is normal and keeps mistakes away.'
  c.sources = [{ title: `${c.program_code} eligibility rule v${rule.version} (mock)`, identifier: rule.id, chunk_id: 'max_income_pkr' }]
}

function createCase(db: DB, input: CaseCreate, u: User, idemKey: string | null, minsAgo = 0): StoredCase {
  db.seq += 1
  const at = new Date(Date.now() - minsAgo * 60000).toISOString()
  const rule = activeRule(db, input.program_code)
  const by = u.role === 'community_helper' ? `helper: ${u.full_name}` : u.role === 'citizen' ? 'you' : 'officer'
  const c: StoredCase = {
    id: uuid(), reference: `LM-26-${String(db.seq).padStart(5, '0')}`, program_code: input.program_code, applicant_name: input.applicant_name,
    family_id: input.family_id, status: 'submitted', route: null, ai_confidence: null, user_explanation: '', reasons: [], missing_fields: [],
    rule_version_id: rule.id, sources: [], history: [{ status: 'submitted' as const, at, actor: by, note: u.role === 'community_helper' ? `Sent by ${u.full_name} for you.` : 'Application received.' }],
    submitted_at: at, submitted_by: u.full_name, documents: [], input, idempotency_key: idemKey, doc_quality: null,
  }
  evaluate(db, c)
  c.history.push({ status: 'routed', at, actor: 'system', note: c.user_explanation })
  db.cases.push(c)
  if (idemKey) db.idem[idemKey] = c.id
  audit(db, u, 'case.create', c.id, c.family_id)
  audit(db, { id: 'system', full_name: `rules v${rule.version} + guardrails-v1` }, `case.route.${c.route}`, c.id, c.family_id)
  refreshFamily(db, c.family_id)
  return c
}

const publicCase = (c: StoredCase): CitizenCase => {
  const { input: _i, idempotency_key: _k, doc_quality: _q, ...rest } = c
  return rest
}

// ---------------- transport simulation ----------------
async function transport<T>(write: boolean, fn: () => T): Promise<T> {
  const mode = getNetMode()
  if (mode === 'offline' || (typeof navigator !== 'undefined' && !navigator.onLine)) throw new NetworkError()
  await sleep(mode === 'slow' ? 2200 : mode === 'flaky' ? 700 : 250)
  const out = fn()
  save()
  if (mode === 'flaky' && write && Math.random() < 0.5) throw new NetworkError('Connection dropped before the reply arrived')
  return JSON.parse(JSON.stringify(out)) as T
}

// ---------------- endpoints ----------------
export const mock = {
  login: (email: string, password: string) => transport(false, () => {
    const db = load()
    const u = db.users.find(x => x.email === email.trim().toLowerCase())
    if (!u || u.password !== password) throw err(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.')
    audit(db, u, 'auth.login', u.id, u.family_id ?? null)
    return { access_token: `mock.${u.id}`, token_type: 'bearer' }
  }),
  me: (token: string | null) => transport(false, () => { const { password: _p, ...me } = whoami(load(), token); return me as Me }),

  listCases: (token: string | null, familyId?: string) => transport(false, (): Paged<CitizenCase> => {
    const db = load(); const u = whoami(db, token)
    let items = db.cases
    if (u.role === 'citizen') items = items.filter(c => c.family_id === u.family_id)
    else if (u.role === 'community_helper') {
      if (familyId) assertFamilyAccess(db, u, familyId)
      items = items.filter(c => c.family_id && helperHasConsent(db, u.id, c.family_id))
    }
    if (familyId) items = items.filter(c => c.family_id === familyId)
    const out = [...items].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(publicCase)
    return { items: out, total: out.length, page: 1, page_size: out.length }
  }),
  getCase: (token: string | null, id: string) => transport(false, () => {
    const db = load(); const u = whoami(db, token)
    const c = db.cases.find(x => x.id === id)
    if (!c) throw err(404, 'NOT_FOUND', 'Application not found.')
    assertFamilyAccess(db, u, c.family_id)
    audit(db, u, 'case.read', c.id, c.family_id)
    return publicCase(c)
  }),
  createCase: (token: string | null, body: CaseCreate, idemKey: string | null) => transport(true, () => {
    const db = load(); const u = whoami(db, token)
    if (u.role === 'officer_admin') throw err(403, 'FORBIDDEN', 'Officers review cases; they do not submit them.')
    // never trust client-supplied family for citizens
    const input: CaseCreate = { ...body, family_id: u.role === 'citizen' ? u.family_id ?? null : body.family_id, submitted_via: u.role === 'citizen' ? 'self' : 'helper' }
    assertFamilyAccess(db, u, input.family_id)
    if (idemKey && db.idem[idemKey]) {
      const existing = db.cases.find(c => c.id === db.idem[idemKey])!
      audit(db, u, 'case.create.idempotent_replay', existing.id, existing.family_id)
      return { ...publicCase(existing), idempotent_replay: true }
    }
    const problems: string[] = []
    if (!input.applicant_name?.trim()) problems.push('name')
    if (!/^\d{5}-\d{7}-\d$/.test(input.cnic)) problems.push('cnic')
    if (!/^03\d{2}-?\d{7}$/.test(input.phone)) problems.push('phone')
    if (!input.household_size || input.household_size < 1 || input.household_size > 30) problems.push('household_size')
    if (problems.length) { const e = err(422, 'VALIDATION_ERROR', `Please check: ${problems.join(', ')}.`); e.details = problems; throw e }
    const open = db.cases.find(c => c.input.cnic === input.cnic && (c.status === 'submitted' || c.status === 'under_review' || c.status === 'needs_information'))
    if (open) { const e = err(409, 'DUPLICATE_APPLICATION', `An application with this CNIC is already open (${open.reference}).`); e.details = { reference: open.reference, id: open.id }; throw e }
    return publicCase(createCase(db, input, u, idemKey))
  }),
  uploadDocument: (token: string | null, caseId: string, kind: string, quality: OCRResult['quality'], sharpness: number) => transport(true, (): OCRResult => {
    const db = load(); const u = whoami(db, token)
    const c = db.cases.find(x => x.id === caseId)
    if (!c) throw err(404, 'NOT_FOUND', 'Application not found.')
    assertFamilyAccess(db, u, c.family_id)
    c.documents = c.documents.filter(d => d.kind !== kind).concat({ id: uuid(), kind, quality })
    c.doc_quality = quality
    const low = quality !== 'good'
    const now = new Date().toISOString()
    evaluate(db, c)
    c.history.push({ status: 'document_added', at: now, actor: u.role === 'citizen' ? 'you' : `helper: ${u.full_name}`, note: low ? 'CNIC photo added. It is hard to read, so a person will check it.' : 'CNIC photo added.' })
    c.history.push({ status: 'routed', at: now, actor: 'system', note: c.user_explanation })
    audit(db, u, 'document.upload', c.id, c.family_id)
    refreshFamily(db, c.family_id)
    const conf = low ? 0.35 : 0.82
    return {
      fields: [
        { name: 'name', value: low ? null : c.applicant_name, status: low ? 'uncertain' : 'ok' },
        { name: 'cnic_number', value: low ? null : c.input.cnic, status: low ? 'uncertain' : 'ok' },
        { name: 'date_of_birth', value: null, status: 'missing' },
      ],
      raw_text: '', quality, warnings: low ? [`Photo sharpness ${sharpness.toFixed(0)} is below 60. Retake in good light, holding the phone still.`] : [],
      confidence: conf, explanation: low ? 'The photo is blurry or dark, so fields could not be read reliably.' : 'Text was read from the photo. Reading text does not verify identity.',
      model_version: 'ocr-mock-v1', requires_human_review: low || conf < HUMAN_THRESHOLD, identity_verified: false,
    }
  }),

  listFamilies: (token: string | null) => transport(false, (): Paged<Family> => {
    const db = load(); const u = whoami(db, token)
    if (u.role !== 'community_helper' && u.role !== 'officer_admin') throw err(403, 'FORBIDDEN', 'Only helpers can see the family list.')
    db.families.forEach(f => refreshFamily(db, f.id)); computeDuplicates(db)
    // helpers see families linked to them (active, withdrawn or pending consent) but only names + status;
    // details are gated by assertFamilyAccess
    const items = db.families.filter(f => u.role === 'officer_admin' || db.consents.some(c => c.family_id === f.id && c.recipient_id === u.id) || f.consent_status === 'none')
    return { items, total: items.length, page: 1, page_size: items.length }
  }),
  getFamily: (token: string | null, id: string) => transport(false, () => {
    const db = load(); const u = whoami(db, token)
    assertFamilyAccess(db, u, id)
    const f = db.families.find(x => x.id === id)!
    audit(db, u, 'family.read', id, id)
    return f
  }),

  listConsents: (token: string | null, familyId?: string) => transport(false, (): Paged<Consent> => {
    const db = load(); const u = whoami(db, token)
    const fid = u.role === 'citizen' ? u.family_id! : familyId
    if (!fid) throw err(400, 'FAMILY_REQUIRED', 'Family is required.')
    if (u.role === 'community_helper') {
      // a helper may only see their own consent record for a family (needed to request it again)
      const items = db.consents.filter(c => c.family_id === fid && c.recipient_id === u.id)
      return { items, total: items.length, page: 1, page_size: items.length }
    }
    const items = db.consents.filter(c => c.family_id === fid)
    return { items, total: items.length, page: 1, page_size: items.length }
  }),
  grantConsent: (token: string | null, body: { family_id?: string; recipient_id: string; purpose: string; data_scope: string[]; confirmed_by_citizen: boolean }) => transport(true, () => {
    const db = load(); const u = whoami(db, token)
    const fid = u.role === 'citizen' ? u.family_id! : body.family_id!
    if (u.role === 'community_helper' && (body.recipient_id !== u.id || !body.confirmed_by_citizen)) throw err(403, 'FORBIDDEN', 'The citizen must confirm on this phone.')
    const recipient = db.users.find(x => x.id === body.recipient_id)
    const existing = db.consents.find(c => c.family_id === fid && c.recipient_id === body.recipient_id)
    const now = new Date().toISOString()
    let c: Consent
    if (existing) { existing.status = 'active'; existing.granted_at = now; existing.withdrawn_at = null; existing.data_scope = body.data_scope; c = existing }
    else {
      c = { id: `cn-${uuid().slice(0, 8)}`, family_id: fid, purpose: body.purpose, data_scope: body.data_scope, recipient_type: 'community_helper', recipient_id: body.recipient_id,
        recipient_name: `${recipient?.full_name ?? 'Helper'} (community helper)`, status: 'active', granted_at: now, withdrawn_at: null }
      db.consents.push(c)
    }
    audit(db, u, u.role === 'community_helper' ? 'consent.grant.citizen_confirmed_on_helper_device' : 'consent.grant', c.id, fid)
    refreshFamily(db, fid)
    return c
  }),
  updateConsentScope: (token: string | null, id: string, data_scope: string[]) => transport(true, () => {
    const db = load(); const u = whoami(db, token)
    const c = db.consents.find(x => x.id === id)
    if (!c || u.role !== 'citizen' || c.family_id !== u.family_id) throw err(403, 'FORBIDDEN', 'Only the citizen can change what is shared.')
    if (c.status !== 'active') throw err(409, 'CONSENT_WITHDRAWN', 'Give permission again before changing it.')
    c.data_scope = data_scope
    audit(db, u, 'consent.scope_change', c.id, c.family_id)
    return c
  }),
  withdrawConsent: (token: string | null, id: string) => transport(true, () => {
    const db = load(); const u = whoami(db, token)
    const c = db.consents.find(x => x.id === id)
    if (!c) throw err(404, 'NOT_FOUND', 'Permission record not found.')
    if (u.role !== 'citizen' || c.family_id !== u.family_id) throw err(403, 'FORBIDDEN', 'Only the citizen can withdraw this permission.')
    if (c.status === 'withdrawn') return c
    c.status = 'withdrawn'; c.withdrawn_at = new Date().toISOString()
    audit(db, u, 'consent.withdraw', c.id, c.family_id)
    refreshFamily(db, c.family_id)
    return c
  }),
  accessLog: (token: string | null) => transport(false, (): AccessEvent[] => {
    const db = load(); const u = whoami(db, token)
    if (u.role !== 'citizen') throw err(403, 'FORBIDDEN', 'Only the citizen can see who used their data.')
    return db.audit.filter(a => a.family_id === u.family_id && a.actor_id !== u.id && a.action !== 'auth.login').slice(-15).reverse()
      .map(a => ({ at: a.at, who: a.actor_name, action: a.action }))
  }),

  scamCheck: (token: string | null, text: string) => transport(false, (): AIResult => {
    const db = load(); const u = whoami(db, token)
    const r = heuristicClassify(text)
    const steps: Record<AIResult['result'], string[]> = {
      suspicious: ['Do not click links or share PIN/OTP/CNIC.', 'Do not send any money.', 'Report the number and delete the message.', 'Check using the official website or helpline.'],
      likely_legitimate: ['Still verify through the official website or helpline before acting.', 'Never share your PIN or OTP.'],
      unknown: ['Do not act on this message yet.', 'A person will review it; or check with the official helpline.'],
    }
    audit(db, u, `ai.scam_check.${r.result}`, 'message', u.family_id ?? null)
    return {
      result: r.result, confidence: text.trim() ? r.confidence : 0, explanation: (text.trim() ? r.explanation : 'The message is empty, so nothing can be judged.') + ' (AI service unavailable in mock mode; used basic rules.)',
      evidence: r.evidence, safe_next_steps: steps[r.result], sources: [], model_version: 'rules-fallback-v1',
      requires_human_review: r.result === 'unknown' || r.confidence < HUMAN_THRESHOLD,
    }
  }),

  // ---- used by D's client.ts mocks so citizen cases reach the officer queue ----
  officerReview: (caseId: string, decision: 'approve' | 'reject' | 'request_info', reason: string) => {
    const db = load()
    const c = db.cases.find(x => x.id === caseId)
    if (!c) return null
    const status: CaseStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_information'
    c.status = status
    c.history.push({ status, at: new Date().toISOString(), actor: 'officer', note:
      decision === 'approve' ? 'An officer checked and approved your application.' : decision === 'reject' ? `An officer did not approve it. Reason: ${reason}` : `An officer needs more information: ${reason}` })
    audit(db, { id: 'u-officer', full_name: 'Demo Officer' }, `case.review.${decision}`, c.id, c.family_id)
    refreshFamily(db, c.family_id); save()
    return { id: c.id, status, reason }
  },
}

export type { StoredCase, DB, AuditEntry }
export type StatusEventT = StatusEvent
