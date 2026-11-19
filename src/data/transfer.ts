import { SCHEMA_VERSION, SyncStatus, type BaseEntity } from '@/domain'
import { todayKey } from '@/utils/date'
import { GrowthDatabase } from './db'
import {
  ALL_STORES,
  FOREIGN_KEYS,
  STORE_LABELS,
  StoreName,
  type StoreEntityMap,
} from './schema'

export const EXPORT_APP_ID = 'personal-growth-os'

export type BackupStoreData = Partial<
  { [K in StoreName]: Array<StoreEntityMap[K]> }
>

export interface BackupFile {
  app: typeof EXPORT_APP_ID
  schemaVersion: number
  exportedAt: string
  counts: Record<string, number>
  data: BackupStoreData
}

export type ImportMode = 'merge' | 'replace'

export interface MissingReference {
  store: StoreName
  id: string
  field: string
  target: StoreName
  targetId: string
}

export interface ImportPreview {
  ok: boolean
  errors: string[]
  warnings: string[]
  schemaVersion: number
  exportedAt: string
  counts: Record<string, number>
  total: number
  idConflicts: number
  missingReferences: MissingReference[]
}

export interface ImportResult {
  mode: ImportMode
  imported: number
  skipped: number
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const backup = value as Partial<BackupFile>
  return (
    backup.app === EXPORT_APP_ID &&
    typeof backup.schemaVersion === 'number' &&
    !!backup.data &&
    typeof backup.data === 'object'
  )
}

export async function createBackup(db: GrowthDatabase): Promise<BackupFile> {
  const data: BackupStoreData = {}
  const counts: Record<string, number> = {}
  for (const store of ALL_STORES) {
    const rows = await db.table(store).toArray()
    if (rows.length > 0) {
      ;(data as Record<string, unknown[]>)[store] = rows
    }
    counts[store] = rows.length
  }
  return {
    app: EXPORT_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts,
    data,
  }
}

export function backupFileName(): string {
  return `growth-os-backup-${todayKey()}.json`
}

export function backupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([backupToJson(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backupFileName()
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function collectIds(
  db: GrowthDatabase,
  store: StoreName,
  backupRows: BaseEntity[],
  mode: ImportMode,
): Promise<Set<string>> {
  const ids = new Set(backupRows.map((row) => row.id))
  if (mode === 'replace') return ids
  const local = (await db.table(store).toArray()) as BaseEntity[]
  for (const row of local) ids.add(row.id)
  return ids
}

export async function analyzeBackup(
  db: GrowthDatabase,
  backup: BackupFile,
  mode: ImportMode,
): Promise<ImportPreview> {
  const errors: string[] = []
  const warnings: string[] = []

  if (backup.app !== EXPORT_APP_ID) {
    errors.push('文件不是 Personal Growth OS 的备份')
  }
  if (backup.schemaVersion > SCHEMA_VERSION) {
    errors.push(
      `备份结构版本 v${backup.schemaVersion} 高于当前应用支持的 v${SCHEMA_VERSION}`,
    )
  }
  if (backup.schemaVersion < SCHEMA_VERSION) {
    warnings.push(
      `备份结构版本 v${backup.schemaVersion} 低于当前 v${SCHEMA_VERSION}，导入时将按当前结构读取`,
    )
  }

  const counts: Record<string, number> = {}
  let total = 0
  const rowsByStore: Partial<Record<StoreName, BaseEntity[]>> = {}

  for (const store of ALL_STORES) {
    const rows = (backup.data as Record<string, unknown>)[store]
    if (rows === undefined) {
      counts[store] = 0
      continue
    }
    if (!Array.isArray(rows)) {
      errors.push(`字段 ${store} 应为数组`)
      continue
    }
    const valid = rows.filter((row): row is BaseEntity => {
      if (!row || typeof row !== 'object') return false
      const entity = row as Partial<BaseEntity>
      return typeof entity.id === 'string' && entity.id.length > 0
    })
    if (valid.length !== rows.length) {
      warnings.push(`${STORE_LABELS[store]} 中有 ${rows.length - valid.length} 条记录缺少 id，已忽略`)
    }
    rowsByStore[store] = valid
    counts[store] = valid.length
    total += valid.length
  }

  let idConflicts = 0
  for (const store of ALL_STORES) {
    const rows = rowsByStore[store]
    if (!rows || rows.length === 0) continue
    const localIds = new Set(
      ((await db.table(store).toArray()) as BaseEntity[]).map((row) => row.id),
    )
    idConflicts += rows.filter((row) => localIds.has(row.id)).length
  }

  const missingReferences: MissingReference[] = []
  for (const store of ALL_STORES) {
    const rules = FOREIGN_KEYS[store]
    const rows = rowsByStore[store]
    if (!rules || !rows) continue

    for (const rule of rules) {
      const snapshot = rowsByStore[rule.target] ?? []
      const ids = await collectIds(db, rule.target, snapshot, mode)
      for (const row of rows) {
        const value = (row as unknown as Record<string, unknown>)[rule.field]
        if (value === null || value === undefined || value === '') {
          if (!rule.nullable) {
            missingReferences.push({
              store,
              id: row.id,
              field: rule.field,
              target: rule.target,
              targetId: '（空）',
            })
          }
          continue
        }
        if (typeof value !== 'string' || !ids.has(value)) {
          missingReferences.push({
            store,
            id: row.id,
            field: rule.field,
            target: rule.target,
            targetId: String(value),
          })
        }
      }
    }
  }

  if (missingReferences.length > 0) {
    warnings.push(`发现 ${missingReferences.length} 处关联缺失，导入后相关记录会以“孤立对象”存在`)
  }
  if (mode === 'merge' && idConflicts > 0) {
    warnings.push(`有 ${idConflicts} 条记录与本地 ID 冲突，合并模式会保留本地记录`)
  }
  if (mode === 'replace') {
    warnings.push('替换模式会清空当前设备上的所有业务数据')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt ?? '',
    counts,
    total,
    idConflicts,
    missingReferences,
  }
}

export async function importBackup(
  db: GrowthDatabase,
  backup: BackupFile,
  mode: ImportMode,
): Promise<ImportResult> {
  let imported = 0
  let skipped = 0

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const store of ALL_STORES) {
        await db.table(store).clear()
      }
    }

    for (const store of ALL_STORES) {
      const rows = (backup.data as Record<string, unknown>)[store]
      if (!Array.isArray(rows) || rows.length === 0) continue

      let pending = rows as BaseEntity[]
      if (mode === 'merge') {
        const localIds = new Set(
          ((await db.table(store).toArray()) as BaseEntity[]).map((row) => row.id),
        )
        pending = pending.filter((row) => !localIds.has(row.id))
        skipped += rows.length - pending.length
      }

      if (pending.length > 0) {
        await db.table(store).bulkPut(pending)
        imported += pending.length
      }
    }
  })

  return { mode, imported, skipped }
}

export interface DataHealth {
  orphanCount: number
  missing: MissingReference[]
  duplicates: number
}

export async function inspectDataHealth(db: GrowthDatabase): Promise<DataHealth> {
  const missing: MissingReference[] = []
  let duplicates = 0

  for (const store of ALL_STORES) {
    const rules = FOREIGN_KEYS[store]
    const rows = (await db.table(store).toArray()) as BaseEntity[]
    if (rows.length === 0) continue

    if (rules) {
      for (const rule of rules) {
        const targetIds = new Set(
          ((await db.table(rule.target).toArray()) as BaseEntity[]).map((row) => row.id),
        )
        for (const row of rows) {
          const value = (row as unknown as Record<string, unknown>)[rule.field]
          if (value === null || value === undefined || value === '') {
            if (!rule.nullable) {
              missing.push({
                store,
                id: row.id,
                field: rule.field,
                target: rule.target,
                targetId: '（空）',
              })
            }
            continue
          }
          if (!targetIds.has(String(value))) {
            missing.push({
              store,
              id: row.id,
              field: rule.field,
              target: rule.target,
              targetId: String(value),
            })
          }
        }
      }
    }

    const ids = new Set<string>()
    for (const row of rows) {
      if (ids.has(row.id)) duplicates += 1
      ids.add(row.id)
    }
  }

  return { orphanCount: missing.length, missing, duplicates }
}

export async function recordExport(
  db: GrowthDatabase,
  backup: BackupFile,
): Promise<void> {
  const timestamp = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.table(StoreName.DATA_EXPORTS).put({
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    syncStatus: SyncStatus.LOCAL_ONLY,
    lastSyncedAt: null,
    deletedAt: null,
    exportType: 'FULL_JSON',
    fileName: backupFileName(),
    status: 'COMPLETED',
    counts: backup.counts,
  })
}