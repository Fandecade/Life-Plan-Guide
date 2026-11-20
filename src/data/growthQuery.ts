import type {
  Competency,
  Goal,
  Identity,
  LearningSession,
  Task,
  TaskGoal,
  Timebox,
} from '@/domain'
import type { GrowthDatabase } from './db'
import { buildGrowthOverview, calculateStageOutcomeProgress } from './growthProgress'
import type {
  GrowthOverview,
  GrowthQueryOptions,
  GrowthSnapshot,
  StageOutcomeProgress,
} from './growthTypes'

function activeOnly<T extends { archivedAt: string | null; deletedAt: string | null }>(
  rows: T[],
  includeArchived: boolean,
): T[] {
  return includeArchived ? rows : rows.filter((row) => !row.archivedAt && !row.deletedAt)
}

export async function loadGrowthSnapshot(
  db: GrowthDatabase,
  options: GrowthQueryOptions = {},
): Promise<GrowthSnapshot> {
  const includeArchived = options.includeArchived ?? false
  const [
    identities,
    competencies,
    stageOutcomes,
    tasks,
    timeboxes,
    learningSessions,
    taskGoals,
  ] = await Promise.all([
    db.identities.toArray(),
    db.competencies.toArray(),
    db.goals.toArray(),
    db.tasks.toArray(),
    db.timeboxes.toArray(),
    db.learningSessions.toArray(),
    db.taskGoals.toArray(),
  ])

  return {
    identities: activeOnly(identities as Identity[], includeArchived),
    competencies: activeOnly(competencies as Competency[], includeArchived),
    stageOutcomes: activeOnly(stageOutcomes as Goal[], includeArchived),
    tasks: activeOnly(tasks as Task[], includeArchived),
    timeboxes: activeOnly(timeboxes as Timebox[], includeArchived),
    learningSessions: activeOnly(learningSessions as LearningSession[], includeArchived),
    taskGoals: activeOnly(taskGoals as TaskGoal[], includeArchived),
  }
}

export async function loadGrowthOverview(
  db: GrowthDatabase,
  options: GrowthQueryOptions = {},
): Promise<GrowthOverview> {
  const snapshot = await loadGrowthSnapshot(db, options)
  return { snapshot, ...buildGrowthOverview(snapshot) }
}

export async function loadIdentityGrowthTree(
  db: GrowthDatabase,
  identityId: string,
  options: GrowthQueryOptions = {},
): Promise<GrowthOverview['identities'][number] | null> {
  const overview = await loadGrowthOverview(db, options)
  const snapshot = overview.snapshot
  const filteredSnapshot: GrowthSnapshot = {
    ...snapshot,
    competencies: snapshot.competencies.filter((row) => row.identityId === identityId),
    stageOutcomes: snapshot.stageOutcomes.filter((outcome) => {
      const competency = snapshot.competencies.find((row) => row.id === outcome.competencyId)
      return competency?.identityId === identityId
    }),
  }
  const filtered = buildGrowthOverview(filteredSnapshot)
  return filtered.identities.find((row) => row.identity.id === identityId) ?? null
}

export async function loadStageOutcomeProgress(
  db: GrowthDatabase,
  stageOutcomeId: string,
  options: GrowthQueryOptions = {},
): Promise<StageOutcomeProgress | null> {
  const snapshot = await loadGrowthSnapshot(db, options)
  const outcome = snapshot.stageOutcomes.find((row) => row.id === stageOutcomeId)
  return outcome ? calculateStageOutcomeProgress(outcome, snapshot.tasks) : null
}

export function createGrowthQueries(db: GrowthDatabase) {
  return {
    loadSnapshot: (options?: GrowthQueryOptions) => loadGrowthSnapshot(db, options),
    loadOverview: (options?: GrowthQueryOptions) => loadGrowthOverview(db, options),
    loadIdentityTree: (identityId: string, options?: GrowthQueryOptions) =>
      loadIdentityGrowthTree(db, identityId, options),
    loadStageOutcomeProgress: (
      stageOutcomeId: string,
      options?: GrowthQueryOptions,
    ) => loadStageOutcomeProgress(db, stageOutcomeId, options),
  }
}

export type GrowthQueries = ReturnType<typeof createGrowthQueries>
