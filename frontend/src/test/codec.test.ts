import { describe, expect, it } from 'vitest'
import { applicantData, decodeDescription, encodeDescription, referenceFor, toCitizenCase, triage } from '../api/caseCodec'
import type { BackendCase, BackendEvaluation, CaseCreate } from '../api/types'

const app = (o: Partial<CaseCreate> = {}): CaseCreate => ({
  program_code: 'BISP-2026', family_id: 'fam-1', applicant_name: 'Zainab Bibi', cnic: '42201-5555555-1', phone: '0300-1234567',
  district: 'Korangi', household_size: 5, household_situation: 'widow', monthly_income_pkr: 15000, income_band: 'lt_20k', submitted_via: 'self', voice_used: false, ...o,
})
const ev = (outcome: BackendEvaluation['outcome']): BackendEvaluation => ({
  id: 'ev-1', rule_version_id: 'rv-1', case_id: null, input_snapshot: {}, missing_fields: [], outcome, evaluated_at: '2026-11-22T00:00:00Z',
  result: { rule_set_id: 'rs-1', rule_version: 1, breakdown: [{ field: 'monthly_income_pkr', operator: '<=', expected: 50000, actual: 1, status: 'pass', message: '' }] },
})
const backend = (description: string | null, status: BackendCase['status'] = 'submitted'): BackendCase => ({
  id: '3f1c9a2e-0000-4000-8000-000000000000', tenant_id: 't', family_id: 'fam-1', created_by: 'u', assigned_to: null,
  title: 'Relief application: Zainab Bibi', description, status, created_at: '2026-11-22T05:00:00Z', updated_at: '2026-11-22T06:00:00Z',
})

describe('triage against the real rule engine (advisory only)', () => {
  it('eligible + clear photo -> ready for officer', () => expect(triage(app(), ev('eligible'), { quality: 'good' }).route).toBe('ready'))
  it('ineligible -> human review, never a rejection', () => expect(triage(app({ monthly_income_pkr: 70000 }), ev('ineligible'), { quality: 'good' }).route).toBe('human_review'))
  it('missing photo -> asks for it', () => expect(triage(app(), ev('eligible'), null).missing_fields).toContain('cnic_photo'))
  it('rules service down -> still accepted, says so', () => expect(triage(app(), null, null).reasons.join(' ')).toMatch(/could not be reached/))
  it('income band is sent as its upper bound and flagged', () => {
    expect(applicantData(app({ monthly_income_pkr: null, income_band: '20k_35k' }))).toMatchObject({ monthly_income_pkr: 35000, income_is_band: true })
  })
})

describe('backend case <-> UI case', () => {
  it('round-trips the application through Case.description', () => {
    const d = encodeDescription({ v: 1, client_ref: 'ref-1', application: app(), triage: triage(app(), ev('eligible'), null) })
    expect(decodeDescription(d)?.client_ref).toBe('ref-1')
    const c = toCitizenCase(backend(d))
    expect(c.applicant_name).toBe('Zainab Bibi'); expect(c.route).toBe('more_info'); expect(c.reference).toBe(referenceFor(c.id))
    expect(c.sources[0].title).toMatch(/rule v1/)
  })
  it('an uploaded document clears the missing-photo item', () => {
    const d = encodeDescription({ v: 1, client_ref: 'r', application: app(), triage: triage(app(), ev('eligible'), null) })
    expect(toCitizenCase(backend(d), [{ id: 'd', case_id: 'c', uploaded_by: 'u', filename: 'x.jpg', content_type: 'image/jpeg', created_at: '2026-11-22T05:30:00Z' }]).missing_fields).not.toContain('cnic_photo')
  })
  it('officer decision overrides triage text and appears in history', () => {
    const d = encodeDescription({ v: 1, client_ref: 'r', application: app(), triage: triage(app(), ev('eligible'), null) })
    const c = toCitizenCase(backend(d, 'approved'))
    expect(c.user_explanation).toMatch(/approved/); expect(c.history[c.history.length - 1].status).toBe('approved'); expect(c.missing_fields).toEqual([])
  })
  it('cases created elsewhere (plain text description) still render', () => {
    expect(toCitizenCase(backend('typed by hand')).applicant_name).toBe('Zainab Bibi')
  })
})
