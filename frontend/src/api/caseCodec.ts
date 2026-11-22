// Translates between A's backend Case { title, description, status } and the rich case the UI shows.
// The structured application and its triage are stored as JSON in Case.description, so the
// backend stays unchanged and the officer sees the same data the citizen entered.
// Triage is ADVISORY: it only routes and explains. Officers make every decision (/cases/{id}/review).
import type { BackendCase, BackendDocument, BackendEvaluation, CaseCreate, CaseRoute, CitizenCase, IncomeBand, StatusEvent } from './types'

export const AUTO_THRESHOLD = 0.9
export const HUMAN_THRESHOLD = 0.6
export const DEFAULT_LIMIT = 50000

export interface Triage {
  route: Exclude<CaseRoute, null>
  confidence: number
  reasons: string[]
  missing_fields: string[]
  outcome: BackendEvaluation['outcome'] | 'not_evaluated'
  rule_version: number | null
  rule_set_id: string | null
  evaluation_id: string | null
  photo_quality: string | null
  model_version: string
}
export interface StoredApplication { v: 1; client_ref: string; application: CaseCreate; triage: Triage }

const BAND_MAX: Record<IncomeBand, number> = { lt_20k: 20000, '20k_35k': 35000, '35k_50k': 50000, gt_50k: 50001 }

/** What we send to POST /rules/evaluate. A band is sent as its upper bound and flagged. */
export function applicantData(a: CaseCreate) {
  return {
    monthly_income_pkr: a.monthly_income_pkr ?? BAND_MAX[a.income_band],
    income_is_band: a.monthly_income_pkr == null,
    household_size: a.household_size,
    district: a.district,
    household_situation: a.household_situation,
  }
}

export function triage(a: CaseCreate, ev: BackendEvaluation | null, photo: { quality: string } | null): Triage {
  const incomeRule = ev?.result.breakdown?.find(b => b.field === 'monthly_income_pkr')
  const limit = incomeRule ? Number(incomeRule.expected) : DEFAULT_LIMIT
  const v = ev?.result.rule_version ?? null
  let conf = 0.95
  let escalate = false
  const reasons: string[] = []
  const missing: string[] = []

  if (!ev) { conf -= 0.1; reasons.push('The rules service could not be reached, so a person will check eligibility.') }
  else if (ev.outcome === 'ineligible') { escalate = true; reasons.push(`Income is above the limit of Rs ${limit.toLocaleString()} in rule v${v}. An officer must decide; the computer never rejects.`) }
  else if (ev.outcome === 'unknown') { conf -= 0.2; missing.push(...ev.missing_fields); reasons.push('Some answers the rule needs are missing.') }

  if (a.monthly_income_pkr != null) {
    if (a.monthly_income_pkr <= limit && a.monthly_income_pkr > limit * 0.9) { conf -= 0.25; reasons.push(`Income is close to the limit of Rs ${limit.toLocaleString()}, so proof of income is needed.`) }
  } else if (a.income_band === '35k_50k') { conf -= 0.3; missing.push('exact_monthly_income'); reasons.push('Only an income range was given and it is near the limit, so the exact amount is needed.') }
  else if (a.income_band !== 'gt_50k') { conf -= 0.05; reasons.push('Only an income range was given.') }

  if (!photo) { conf -= 0.15; missing.push('cnic_photo'); reasons.push('A photo of the CNIC has not been added yet.') }
  else if (photo.quality !== 'good') { conf -= 0.2; reasons.push('The CNIC photo is hard to read. A person will check it.') }

  conf = Math.max(0.05, Math.round(conf * 100) / 100)
  const route: Triage['route'] = escalate || conf < HUMAN_THRESHOLD ? 'human_review' : conf < AUTO_THRESHOLD ? 'more_info' : 'ready'
  if (!reasons.length) reasons.push(v ? `All answers fit rule v${v}.` : 'All answers look complete.')
  return { route, confidence: conf, reasons, missing_fields: [...new Set(missing)], outcome: ev?.outcome ?? 'not_evaluated', rule_version: v,
    rule_set_id: ev?.result.rule_set_id ?? null, evaluation_id: ev?.id ?? null, photo_quality: photo?.quality ?? null, model_version: 'rules-engine + guardrails-v1' }
}

export function encodeDescription(s: StoredApplication) { return JSON.stringify(s) }

export function decodeDescription(d: string | null): StoredApplication | null {
  if (!d) return null
  try { const o = JSON.parse(d); return o && o.v === 1 && o.application ? (o as StoredApplication) : null } catch { return null }
}

export const referenceFor = (id: string) => `LM-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`

const EXPLAIN: Record<string, string> = {
  ready: 'Your answers fit the rules. An officer will give the final decision. Nothing is approved by the computer alone.',
  more_info: 'We need a little more proof before an officer can decide. See what is missing below.',
  human_review: 'The system is not sure, so a person will look at your application. This is normal and keeps mistakes away.',
  under_review: 'An officer is checking your application now.',
  needs_information: 'An officer needs more information from you. See what is missing below.',
  approved: 'An officer checked and approved your application.',
  rejected: 'An officer did not approve your application. You can ask the office for the reason and how to appeal.',
  closed: 'This application is closed.',
}

/** Backend case (+ optional documents) -> what the citizen/helper screens render. */
export function toCitizenCase(c: BackendCase, docs?: BackendDocument[], submittedByLabel?: string): CitizenCase {
  const s = decodeDescription(c.description)
  const t = s?.triage
  const hasDoc = docs ? docs.length > 0 : null
  let missing = t ? [...t.missing_fields] : []
  if (hasDoc === true) missing = missing.filter(m => m !== 'cnic_photo')
  if (hasDoc === false && !missing.includes('cnic_photo')) missing.push('cnic_photo')

  const decided = c.status !== 'submitted'
  const explanation = decided ? EXPLAIN[c.status] : t ? EXPLAIN[t.route] : EXPLAIN.human_review
  const history: StatusEvent[] = [
    { status: 'submitted', at: c.created_at, actor: s?.application.submitted_via === 'helper' ? 'helper' : 'you', note: 'Application received.' },
  ]
  if (t) history.push({ status: 'routed', at: c.created_at, actor: 'system', note: EXPLAIN[t.route] })
  for (const d of docs ?? []) history.push({ status: 'document_added', at: d.created_at, actor: 'you', note: 'CNIC photo added.' })
  if (decided) history.push({ status: c.status, at: c.updated_at, actor: 'officer', note: EXPLAIN[c.status] })
  history.sort((a, b) => a.at.localeCompare(b.at))

  return {
    id: c.id,
    reference: referenceFor(c.id),
    program_code: s?.application.program_code ?? 'BISP-2026',
    applicant_name: s?.application.applicant_name ?? c.title.replace(/^Relief application:\s*/, ''),
    family_id: c.family_id,
    status: c.status,
    route: t?.route ?? null,
    ai_confidence: t?.confidence ?? null,
    user_explanation: explanation,
    reasons: t?.reasons ?? [],
    missing_fields: c.status === 'approved' || c.status === 'rejected' || c.status === 'closed' ? [] : missing,
    rule_version_id: t?.rule_version ? `BISP-2026 v${t.rule_version}` : null,
    sources: t?.rule_set_id ? [{ title: `BISP-2026 eligibility rule v${t.rule_version}`, identifier: t.rule_set_id, chunk_id: t.evaluation_id ?? 'evaluation' }] : [],
    history,
    submitted_at: c.created_at,
    submitted_by: submittedByLabel ?? (s?.application.submitted_via === 'helper' ? 'Community helper' : s?.application.applicant_name ?? ''),
    documents: (docs ?? []).map(d => ({ id: d.id, kind: 'cnic', quality: t?.photo_quality ?? 'unknown' })),
  }
}
