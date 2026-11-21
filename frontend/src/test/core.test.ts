import { beforeEach, describe, expect, it } from 'vitest'
import { mock, mockDb, resetMockDb } from '../api/mockServer'
import type { CaseCreate } from '../api/types'
import { ApiError, NetworkError } from '../lib/errors'
import { setNetMode } from '../lib/net'
import { nameMatchesQuery, nameSimilarity, normalizeName, POSSIBLE_MATCH } from '../lib/names'
import { heuristicClassify } from '../lib/scamRules'
import { judge, laplacianVariance } from '../lib/imageQuality'
import { validateStep, formatCnic } from '../pages/citizen/ApplyPage'
import { SCAM_EXAMPLES } from '../pages/citizen/ScamCheckPage'
import { enqueue, syncAll } from '../offline/queue'
import { queueStore } from '../offline/db'

const ZAINAB = 'mock.u-zainab', HELPER = 'mock.u-rukhsana'
const body = (o: Partial<CaseCreate> = {}): CaseCreate => ({
  program_code: 'BISP-2026', family_id: null, applicant_name: 'Zainab Bibi', cnic: '42201-5555555-1', phone: '0300-1234567',
  district: 'Korangi', household_size: 5, household_situation: 'widow', monthly_income_pkr: 15000, income_band: 'lt_20k', submitted_via: 'self', voice_used: false, ...o,
})

beforeEach(() => { localStorage.clear(); setNetMode('online'); resetMockDb() })

describe('bad data: names', () => {
  it('normalizes Muhammad spellings to one token', () => {
    expect(normalizeName('Mohammad Aslam')).toEqual(normalizeName('Muhammed  aslam'))
  })
  it('flags but never equates variant names', () => {
    expect(nameSimilarity('Muhammad Aslam Ansari', 'Mohammad Aslam Ansari')).toBeGreaterThanOrEqual(POSSIBLE_MATCH)
    expect(nameSimilarity('Ayesha Bibi', 'Rashid Memon')).toBeLessThan(0.5)
  })
  it('search tolerates spelling', () => { expect(nameMatchesQuery('Muhammad Aslam Ansari', 'mohd aslam')).toBe(true) })
  it('seeded look-alike families stay separate records with a duplicate hint', async () => {
    const r = await mock.listFamilies(HELPER)
    const a = r.items.find(f => f.id === 'f-041')!
    expect(a.possible_duplicates.length).toBeGreaterThan(0)
    expect(r.items.filter(f => f.id === 'f-041').length).toBe(1)
    expect(mockDb().families.length).toBe(40)
  })
})

describe('scam rules mirror B', () => {
  it('handles all three labels and never overclaims', () => {
    const v = SCAM_EXAMPLES.map(e => heuristicClassify(e).result)
    expect(v).toEqual(['suspicious', 'suspicious', 'unknown', 'likely_legitimate'])
    for (const e of SCAM_EXAMPLES) expect(heuristicClassify(e).confidence).toBeLessThanOrEqual(0.95)
  })
  it('legit result still says it is not proof', () => {
    expect(heuristicClassify(SCAM_EXAMPLES[3]).explanation).toMatch(/does not prove/)
  })
  it('server marks unknown for human review', async () => {
    const r = await mock.scamCheck(ZAINAB, SCAM_EXAMPLES[2])
    expect(r.result).toBe('unknown'); expect(r.requires_human_review).toBe(true)
  })
})

describe('application validation', () => {
  it('rejects bad CNIC and phone', () => {
    expect(validateStep('cnic', { cnic: '4220112' })).toBe('err_cnic')
    expect(validateStep('cnic', { cnic: formatCnic('4220155555551') })).toBeNull()
    expect(validateStep('phone', { phone: '0412-1234567' })).toBe('err_phone')
    expect(validateStep('income', { income_band: 'lt_20k', exact_known: true })).toBe('err_income')
  })
  it('server re-validates (never trusts client)', async () => {
    await expect(mock.createCase(ZAINAB, body({ cnic: 'bad' }), 'k1')).rejects.toMatchObject({ status: 422 })
  })
})

describe('cost of being wrong: routing never approves', () => {
  it('income above limit goes to a human, not auto-reject', async () => {
    const c = await mock.createCase(ZAINAB, body({ monthly_income_pkr: 62000, income_band: 'gt_50k' }), 'k2')
    expect(c.route).toBe('human_review'); expect(c.status).toBe('pending')
  })
  it('missing CNIC photo asks for more proof', async () => {
    const c = await mock.createCase(ZAINAB, body(), 'k3')
    expect(c.route).toBe('more_info'); expect(c.missing_fields).toContain('cnic_photo')
  })
  it('a published rule applies immediately; old case keeps its version', async () => {
    const old = await mock.createCase(ZAINAB, body({ monthly_income_pkr: 48000, income_band: '35k_50k' }), 'k4')
    const db = mockDb()
    db.rules.forEach(r => { if (r.status === 'active') r.status = 'archived' })
    db.rules.unshift({ id: 'r-4', program_code: 'BISP-2026', version: 4, status: 'active', rules_json: { max_income_pkr: 40000 }, created_by: 'x', created_at: new Date().toISOString() })
    const neu = await mock.createCase(ZAINAB, body({ cnic: '42201-6666666-1', monthly_income_pkr: 48000, income_band: '35k_50k' }), 'k5')
    expect(old.rule_version_id).toBe('r-3'); expect(neu.rule_version_id).toBe('r-4'); expect(neu.route).toBe('human_review')
  })
  it('second open application with same CNIC is refused', async () => {
    await mock.createCase(ZAINAB, body(), 'k6')
    await expect(mock.createCase(ZAINAB, body(), 'k7')).rejects.toMatchObject({ code: 'DUPLICATE_APPLICATION' })
  })
})

describe('consent take-back is enforced by the server', () => {
  it('helper is blocked immediately after citizen withdraws, and it is audited', async () => {
    await expect(mock.getFamily(HELPER, 'f-001')).resolves.toMatchObject({ id: 'f-001' })
    const c = (await mock.listConsents(ZAINAB)).items.find(x => x.recipient_type === 'community_helper')!
    const w = await mock.withdrawConsent(ZAINAB, c.id)
    expect(w.status).toBe('withdrawn')
    await expect(mock.getFamily(HELPER, 'f-001')).rejects.toMatchObject({ status: 403, code: 'CONSENT_WITHDRAWN' })
    await expect(mock.createCase(HELPER, body({ family_id: 'f-001' }), 'k8')).rejects.toMatchObject({ status: 403 })
    const log = await mock.accessLog(ZAINAB)
    expect(log.some(a => a.action === 'access_denied.no_consent')).toBe(true)
  })
  it('citizen cannot read another family', async () => {
    const other = await mock.createCase(HELPER, body({ family_id: 'f-003', cnic: '42201-7777777-1', applicant_name: 'X' }), 'k9')
    await expect(mock.getCase(ZAINAB, other.id)).rejects.toBeInstanceOf(ApiError)
  })
  it('helper cannot withdraw on behalf of the citizen', async () => {
    await expect(mock.withdrawConsent(HELPER, 'cn-f-001')).rejects.toMatchObject({ status: 403 })
  })
})

describe('offline queue: no lost and no duplicate applications', () => {
  const submit = (p: CaseCreate, k: string) => mock.createCase(ZAINAB, p, k)
  it('queued while offline, synced once online, payload cleared', async () => {
    setNetMode('offline')
    await enqueue({ id: 'idem-1', owner_id: 'u-zainab', family_id: 'f-001', label: 'Zainab', payload: body() })
    await syncAll(submit, { force: true })
    expect((await queueStore.get('idem-1'))!.state).toBe('queued')
    setNetMode('online')
    await syncAll(submit, { force: true })
    const it = (await queueStore.get('idem-1'))!
    expect(it.state).toBe('synced'); expect(it.payload).toBeNull(); expect(it.server_reference).toMatch(/^LM-26-/)
  })
  it('reply lost after server saved -> retry returns same case, one record', async () => {
    let first = true
    const lossy = async (p: CaseCreate, k: string) => {
      const c = await mock.createCase(ZAINAB, p, k)
      if (first) { first = false; throw new NetworkError('reply lost') }
      return c
    }
    await enqueue({ id: 'idem-2', owner_id: 'u-zainab', family_id: 'f-001', label: 'Zainab', payload: body({ cnic: '42201-8888888-1' }) })
    await syncAll(lossy, { force: true })
    await syncAll(lossy, { force: true })
    expect((await queueStore.get('idem-2'))!.state).toBe('synced')
    expect(mockDb().cases.filter(c => c.input.cnic === '42201-8888888-1').length).toBe(1)
  })
  it('server refusal is a visible failure, not a silent retry loop', async () => {
    await enqueue({ id: 'idem-3', owner_id: 'u-zainab', family_id: 'f-001', label: 'Zainab', payload: body({ phone: '123' }) })
    await syncAll(submit, { force: true })
    const it = (await queueStore.get('idem-3'))!
    expect(it.state).toBe('failed'); expect(it.last_error).toMatch(/phone/)
  })
})

describe('photo quality gate', () => {
  it('flat image is low quality, textured image is good', () => {
    const w = 40, h = 40
    const flat = new Float32Array(w * h).fill(128)
    const tex = new Float32Array(w * h).map((_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 230 : 30)
    expect(judge(laplacianVariance(flat, w, h), 128)).toBe('low')
    expect(judge(laplacianVariance(tex, w, h), 128)).toBe('good')
    expect(judge(500, 10)).toBe('unreadable')
  })
})
