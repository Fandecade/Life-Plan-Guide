import type { Table } from 'dexie'
import {
  SCHEMA_VERSION,
  SyncStatus,
  type BaseEntity,
  type EntityPatch,
  type ListOptions,
  type NewEntity,
} from '@/domain'
import { nowIso } from '@/utils/date'
import { uuidv7 } from '@/utils/id'

export interface Repository<T extends BaseEntity> {
  list(options?: ListOptions): Promise<T[]>
  get(id: string): Promise<T | undefined>
  create(draft: NewEntity<T>): Promise<T>
  update(id: string, patch: EntityPatch<T>): Promise<T>
  archive(id: string): Promise<T>
  restore(id: string): Promise<T>
  remove(id: string): Promise<void>
  count(options?: ListOptions): Promise<number>
  bulkCreate(drafts: NewEntity<T>[]): Promise<T[]>
  bulkPut(entities: T[]): Promise<void>
  clear(): Promise<void>
}

export function buildBaseEntity(id?: string): BaseEntity {
  const timestamp = nowIso()
  return {
    id: id ?? uuidv7(),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    syncStatus: SyncStatus.LOCAL_ONLY,
    lastSyncedAt: null,
    deletedAt: null,
  }
}

export function createDexieRepository<T extends BaseEntity>(
  table: Table<T, string>,
): Repository<T> {
  async function applyPatch(id: string, patch: Record<string, unknown>): Promise<T> {
    const current = await table.get(id)
    if (!current) {
      throw new Error(`记录不存在：${id}`)
    }
    const next = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
      version: current.version + 1,
    } as T
    await table.put(next)
    return next
  }

  return {
    async list(options = {}) {
      const all = await table.toArray()
      const filtered = options.includeArchived
        ? all
        : all.filter((item) => !item.archivedAt && !item.deletedAt)
      return filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async get(id) {
      return table.get(id)
    },

    async create(draft) {
      const entity = {
        ...draft,
        ...buildBaseEntity(draft.id),
      } as T
      await table.add(entity)
      return entity
    },

    async update(id, patch) {
      return applyPatch(id, patch as Record<string, unknown>)
    },

    async archive(id) {
      return applyPatch(id, { archivedAt: nowIso() })
    },

    async restore(id) {
      return applyPatch(id, { archivedAt: null })
    },

    async remove(id) {
      await table.delete(id)
    },

    async count(options = {}) {
      const all = await table.toArray()
      if (options.includeArchived) return all.length
      return all.filter((item) => !item.archivedAt && !item.deletedAt).length
    },

    async bulkCreate(drafts) {
      const entities = drafts.map(
        (draft) => ({ ...draft, ...buildBaseEntity(draft.id) }) as T,
      )
      await table.bulkAdd(entities)
      return entities
    },

    async bulkPut(entities) {
      await table.bulkPut(entities)
    },

    async clear() {
      await table.clear()
    },
  }
}