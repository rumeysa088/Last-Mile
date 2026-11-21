// IndexedDB storage for work that must survive a dropped signal or a closed browser.
// Privacy choices:
//  - document photos are NEVER stored here (they stay in memory and are uploaded online only)
//  - queued payloads are deleted as soon as the server confirms them; only a receipt is kept
//  - drafts are keyed per (signed-in user, family) so a shared helper phone never mixes families
import { openDB, type IDBPDatabase } from 'idb'
import type { CaseCreate } from '../api/types'

export type QueueState = 'queued' | 'syncing' | 'synced' | 'failed'

export interface QueueItem {
  id: string // also the Idempotency-Key sent to the server
  kind: 'case_create'
  owner_id: string
  family_id: string | null
  label: string // who this is for, shown in the banner
  payload: CaseCreate | null // null after sync (cleared)
  state: QueueState
  attempts: number
  next_attempt_at: number
  last_error: string | null
  server_reference: string | null
  server_case_id: string | null
  created_at: number
  updated_at: number
}

export interface Draft {
  key: string // `${owner_id}:${family_id ?? 'self'}`
  owner_id: string
  family_id: string | null
  step: number
  answers: Partial<CaseCreate>
  idempotency_key: string
  updated_at: number
}

let dbp: Promise<IDBPDatabase> | null = null
export function db() {
  if (!dbp) {
    dbp = openDB('lastmile-offline', 1, {
      upgrade(d) {
        d.createObjectStore('queue', { keyPath: 'id' })
        d.createObjectStore('drafts', { keyPath: 'key' })
      },
    })
  }
  return dbp
}
/** test hook */
export function _resetDbHandle() { dbp = null }

export const draftKey = (ownerId: string, familyId: string | null) => `${ownerId}:${familyId ?? 'self'}`

export const drafts = {
  get: async (key: string) => (await db()).get('drafts', key) as Promise<Draft | undefined>,
  put: async (d: Draft) => { await (await db()).put('drafts', d) },
  delete: async (key: string) => { await (await db()).delete('drafts', key) },
  listForOwner: async (ownerId: string) => ((await (await db()).getAll('drafts')) as Draft[]).filter(d => d.owner_id === ownerId),
}

export const queueStore = {
  all: async () => ((await (await db()).getAll('queue')) as QueueItem[]).sort((a, b) => a.created_at - b.created_at),
  get: async (id: string) => (await db()).get('queue', id) as Promise<QueueItem | undefined>,
  put: async (q: QueueItem) => { await (await db()).put('queue', q) },
  delete: async (id: string) => { await (await db()).delete('queue', id) },
}
