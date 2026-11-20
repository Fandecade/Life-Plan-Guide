import { GrowthDatabase } from './db'
import { createRepositories } from './repositories'

export const db = new GrowthDatabase()
export const repos = createRepositories(db)

export async function initDataLayer(): Promise<void> {
  if (!db.isOpen()) {
    await db.open()
  }
}

export { clearAllData, readDatabaseInfo, DATABASE_NAME, type DatabaseInfo } from './db'
export { seedDemoData } from './seed'
export {
  analyzeBackup,
  backupFileName,
  backupToJson,
  createBackup,
  downloadBackup,
  importBackup,
  inspectDataHealth,
  isBackupFile,
  recordExport,
  type BackupFile,
  type DataHealth,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type MissingReference,
} from './transfer'
export {
  ALL_STORES,
  STORE_LABELS,
  StoreName,
  type StoreEntityMap,
} from './schema'
export type { Repositories } from './repositories'
export type { Repository } from './repository'
export { onDataChange, emitDataChange, hasScope, type DataScope } from './events'
export {
  changeTaskStatus,
  syncTaskActualDuration,
  type TaskStatusChangeOptions,
  type TaskStatusChangeResult,
} from './taskService'
export {
  setTaskArchivedCascade,
  setGoalArchivedCascade,
  setCompetencyArchivedCascade,
  setDirectionArchivedCascade,
} from './cascade'