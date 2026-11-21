// Explicit sync queue. Each item carries one Idempotency-Key for its whole life, so:
//   reply lost after the server saved it -> retry returns the SAME case (no duplicate)
//   server says "already applied" (409)   -> shown as failed with the existing reference
//   server says "no" (403/422)            -> failed, with the reason, never retried blindly
//   no signal                             -> stays queued, retried with backoff
import type { CaseCreate, CitizenCase } from '../api/types'
import { ApiError, isNetworkError } from '../lib/errors'
import { queueStore, type QueueItem } from './db'

type Submit = (payload: CaseCreate, idempotencyKey: string) => Promise<CitizenCase>
type Listener = () => void

const listeners = new Set<Listener>()
export const onQueueChange = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }
const emit = () => listeners.forEach(l => l())

const BACKOFF_MS = [0, 5_000, 15_000, 30_000, 60_000]

export async function enqueue(args: { id: string; owner_id: string; family_id: string | null; label: string; payload: CaseCreate }) {
  const existing = await queueStore.get(args.id)
  if (existing && existing.state !== 'failed') return existing // same draft queued twice -> one item
  const now = Date.now()
  const item: QueueItem = {
    id: args.id, kind: 'case_create', owner_id: args.owner_id, family_id: args.family_id, label: args.label, payload: args.payload,
    state: 'queued', attempts: 0, next_attempt_at: now, last_error: null, server_reference: null, server_case_id: null, created_at: now, updated_at: now,
  }
  await queueStore.put(item); emit()
  return item
}

let running: Promise<void> | null = null

/** Try to send everything due. Safe to call often; concurrent calls share one run. */
export function syncAll(submit: Submit, opts: { force?: boolean; ownerId?: string } = {}) {
  if (running) return running
  running = (async () => {
    try {
      for (const item of await queueStore.all()) {
        if (item.state !== 'queued' || !item.payload) continue
        if (opts.ownerId && item.owner_id !== opts.ownerId) continue
        if (!opts.force && item.next_attempt_at > Date.now()) continue
        await sendOne(item, submit)
      }
    } finally { running = null }
  })()
  return running
}

async function sendOne(item: QueueItem, submit: Submit) {
  item.state = 'syncing'; item.attempts += 1; item.updated_at = Date.now()
  await queueStore.put(item); emit()
  try {
    const c = await submit(item.payload!, item.id)
    item.state = 'synced'
    item.server_reference = c.reference
    item.server_case_id = c.id
    item.payload = null // clear personal data from the phone once the server has it
    item.last_error = null
  } catch (e) {
    if (isNetworkError(e)) {
      item.state = 'queued'
      item.next_attempt_at = Date.now() + BACKOFF_MS[Math.min(item.attempts, BACKOFF_MS.length - 1)]
      item.last_error = 'network'
    } else if (e instanceof ApiError) {
      item.state = 'failed'
      item.last_error = e.message
      if (e.code === 'DUPLICATE_APPLICATION') {
        const d = e.details as { reference?: string; id?: string } | undefined
        item.server_reference = d?.reference ?? null
        item.server_case_id = d?.id ?? null
      }
    } else {
      item.state = 'failed'
      item.last_error = String(e)
    }
  }
  item.updated_at = Date.now()
  await queueStore.put(item); emit()
}

export async function retryItem(id: string) {
  const item = await queueStore.get(id)
  if (!item || !item.payload) return
  item.state = 'queued'; item.next_attempt_at = 0; item.last_error = null
  await queueStore.put(item); emit()
}

export async function removeItem(id: string) { await queueStore.delete(id); emit() }

/** Remove receipts of synced items older than a day. */
export async function pruneSynced(maxAgeMs = 24 * 3600 * 1000) {
  for (const i of await queueStore.all()) if (i.state === 'synced' && Date.now() - i.updated_at > maxAgeMs) await queueStore.delete(i.id)
  emit()
}
