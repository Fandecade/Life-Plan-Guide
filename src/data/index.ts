import { SCHEMA_VERSION } from '@/domain'
import { GrowthDatabase } from './db'
import { createRepositories } from './repositories'
import { backupBeforeMigration } from './migrationBackup'
import { createGrowthCommands } from './growthCommands'
import { createGrowthQueries } from './growthQuery'

export const db = new GrowthDatabase()
export const repos = createRepositories(db)
export const growthCommands = createGrowthCommands(db)
export const growthQueries = createGrowthQueries(db)

export async function initDataLayer(): Promise<void> {
  if (!db.isOpen()) {
    // IndexedDB 升级一旦开始就无法取消；先在独立的备份库保存完整旧版本快照。
    await backupBeforeMigration(db.name, SCHEMA_VERSION)
    await db.open()
  }
}

export { clearAllData, readDatabaseInfo, DATABASE_NAME, type DatabaseInfo } from './db'
export { seedDemoData } from './seed'
export {
  createGrowthCommands,
  type CreateChildCompetencyInput,
  type CreateCompetencyInput,
  type CreateIdentityInput,
  type CreateRootCompetencyInput,
  type CreateStageOutcomeInput,
  type CreateTaskInput,
  type CreateTimeboxInput,
  type GrowthCommands,
} from './growthCommands'
export {
  createGrowthQueries,
  loadGrowthOverview,
  loadGrowthSnapshot,
  loadIdentityGrowthTree,
  loadStageOutcomeProgress,
  type GrowthQueries,
} from './growthQuery'
export {
  DEFAULT_TASK_ESTIMATE_MINUTES,
  buildGrowthOverview,
  calculateIdentityProgress,
  calculateLevelProgress,
  calculateStageOutcomeProgress,
  competencyLevelIndex,
  taskEstimateMinutes,
} from './growthProgress'
export { validateGrowthSnapshot } from './growthValidation'
export type {
  CompetencyProgress,
  GrowthCompetencyNode,
  GrowthDomainIssue,
  GrowthIdentityNode,
  GrowthOverview,
  GrowthQueryOptions,
  GrowthSnapshot,
  GrowthStageOutcomeNode,
  GrowthValidationResult,
  StageOutcomeProgress,
} from './growthTypes'
export {
  backupBeforeMigration,
  readLatestMigrationSnapshot,
  type MigrationBackupResult,
  type MigrationSnapshot,
} from './migrationBackup'
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
