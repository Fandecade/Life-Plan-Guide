import { SCHEMA_VERSION, SyncStatus, type BaseEntity } from '@/domain'
import { todayKey } from '@/utils/date'
import { GrowthDatabase } from './db'
import { validateGrowthSnapshot } from './growthValidation'
import { migrateV8Data, type V8MigrationInput, type V8MigrationReport } from './migrations/v8'
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

export interface BackupNormalizationResult {
  backup: BackupFile
  report: V8MigrationReport
}

function rowsOf<T>(data: BackupStoreData, store: StoreName): T[] {
  return ((data as Record<string, unknown[]>)[store] ?? []) as T[]
}

function withoutInvalidRows(backup: BackupFile): BackupFile {
  const data: BackupStoreData = {}
  for (const store of ALL_STORES) {
    const rows = (backup.data as Record<string, unknown>)[store]
    if (!Array.isArray(rows)) continue
    const valid = rows.filter((row): row is BaseEntity => {
      if (!row || typeof row !== 'object') return false
      const entity = row as Partial<BaseEntity>
      return typeof entity.id === 'string' && entity.id.length > 0
    })
    if (valid.length > 0) {
      ;(data as Record<string, unknown[]>)[store] = valid
    }
  }
  return { ...backup, data }
}

export function normalizeBackupData(backup: BackupFile): BackupNormalizationResult {
  const clean = withoutInvalidRows(backup)
  const input: V8MigrationInput = {
    identities: rowsOf(clean.data, StoreName.IDENTITIES),
    directions: rowsOf(clean.data, StoreName.DIRECTIONS),
    competencies: rowsOf(clean.data, StoreName.COMPETENCIES),
    directionCompetencies: rowsOf(clean.data, StoreName.DIRECTION_COMPETENCIES),
    goals: rowsOf(clean.data, StoreName.GOALS),
    tasks: rowsOf(clean.data, StoreName.TASKS),
    taskGoals: rowsOf(clean.data, StoreName.TASK_GOALS),
    timeboxes: rowsOf(clean.data, StoreName.TIMEBOXES),
    learningSessions: rowsOf(clean.data, StoreName.LEARNING_SESSIONS),
  }
  const migrated = migrateV8Data(input, { fromSchemaVersion: backup.schemaVersion })
  const data: BackupStoreData = { ...clean.data }
  ;(data as Record<string, unknown[]>)[StoreName.IDENTITIES] = migrated.data.identities
  ;(data as Record<string, unknown[]>)[StoreName.COMPETENCIES] = migrated.data.competencies
  ;(data as Record<string, unknown[]>)[StoreName.TASKS] = migrated.data.tasks
  ;(data as Record<string, unknown[]>)[StoreName.TIMEBOXES] = migrated.data.timeboxes
  ;(data as Record<string, unknown[]>)[StoreName.LEARNING_SESSIONS] =
    migrated.data.learningSessions

  // v8 只新增这些字段；其余旧实体原样保留，仅将结构版本标记为当前版本。
  for (const store of ALL_STORES) {
    const rows = (data as Record<string, unknown[]>)[store]
    if (!rows) continue
    ;(data as Record<string, unknown[]>)[store] = rows.map((row) => ({
      ...(row as BaseEntity),
      schemaVersion: SCHEMA_VERSION,
    }))
  }

  return {
    backup: {
      ...clean,
      schemaVersion: SCHEMA_VERSION,
      data,
    },
    report: migrated.report,
  }
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
      `备份结构版本 v${backup.schemaVersion} 低于当前 v${SCHEMA_VERSION}，导入时会自动迁移并保留旧关联`,
    )
  }

  const counts: Record<string, number> = {}
  let total = 0
  const rawRowsByStore: Partial<Record<StoreName, BaseEntity[]>> = {}

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
    rawRowsByStore[store] = valid
    counts[store] = valid.length
    total += valid.length
  }

  const normalized = normalizeBackupData({
    ...backup,
    data: rawRowsByStore as BackupStoreData,
  })
  const rowsByStore: Partial<Record<StoreName, BaseEntity[]>> = {}
  for (const store of ALL_STORES) {
    rowsByStore[store] = rowsOf<BaseEntity>(normalized.backup.data, store)
    counts[store] = rowsByStore[store].length
  }

  if (normalized.report.competencyIdentityInferred > 0) {
    warnings.push(
      `已为 ${normalized.report.competencyIdentityInferred} 个能力推断身份归属`,
    )
  }
  if (normalized.report.competencyIdentityUnresolved > 0) {
    warnings.push(
      `${normalized.report.competencyIdentityUnresolved} 个能力无法推断身份，将以孤立对象保留`,
    )
  }
  if (normalized.report.taskStageOutcomeMapped > 0) {
    warnings.push(
      `已从旧任务关系中补全 ${normalized.report.taskStageOutcomeMapped} 个任务的主阶段成果`,
    )
  }
  if (normalized.report.taskStageOutcomeUnresolved > 0) {
    warnings.push(
      `${normalized.report.taskStageOutcomeUnresolved} 个旧任务没有可用阶段成果，将保留为待补齐任务`,
    )
  }
  if (normalized.report.timeboxKindsDefaulted > 0) {
    warnings.push(
      `已为 ${normalized.report.timeboxKindsDefaulted} 个时间块补齐类型`,
    )
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
  const normalized = normalizeBackupData(backup)

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const store of ALL_STORES) {
        await db.table(store).clear()
      }
    }

    for (const store of ALL_STORES) {
      const rows = (normalized.backup.data as Record<string, unknown>)[store]
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
  domainIssues: string[]
  domainIssueCount: number
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

  const validation = validateGrowthSnapshot({
    identities: await db.identities.toArray(),
    competencies: await db.competencies.toArray(),
    stageOutcomes: await db.goals.toArray(),
    tasks: await db.tasks.toArray(),
    timeboxes: await db.timeboxes.toArray(),
    learningSessions: await db.learningSessions.toArray(),
    taskGoals: await db.taskGoals.toArray(),
  })
  const domainIssues = validation.issues.map(
    (row) => `[${row.severity === 'error' ? '错误' : '提示'}] ${row.message}`,
  )

  return {
    orphanCount: missing.length,
    missing,
    duplicates,
    domainIssues,
    domainIssueCount: domainIssues.length,
  }
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
