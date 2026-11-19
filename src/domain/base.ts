export const SCHEMA_VERSION = 5

export const SyncStatus = {
  LOCAL_ONLY: 'LOCAL_ONLY',
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  CONFLICT: 'CONFLICT',
} as const

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus]

export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  version: number
  schemaVersion: number
  syncStatus: SyncStatus
  lastSyncedAt: string | null
  deletedAt: string | null
}

export type NewEntity<T extends BaseEntity> = Omit<T, keyof BaseEntity> & {
  id?: string
}

export type EntityPatch<T extends BaseEntity> = Partial<Omit<T, keyof BaseEntity>>

export interface ListOptions {
  includeArchived?: boolean
}
