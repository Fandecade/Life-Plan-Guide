import {
  SCHEMA_VERSION,
  SyncStatus,
  type BaseEntity,
  type Competency,
  type Direction,
  type DirectionCompetency,
  type Goal,
  type Identity,
  type LearningSession,
  type Task,
  type TaskGoal,
  type Timebox,
  type TimeboxKind,
  type UserSettings,
} from '@/domain'

type LegacyIdentity = Omit<Identity, 'visionId'> & { visionId?: string | null }
type LegacyCompetency = Omit<Competency, 'identityId' | 'weight'> & {
  identityId?: string | null
  weight?: number
}
type LegacyTask = Omit<Task, 'stageOutcomeId'> & { stageOutcomeId?: string | null }
type LegacyTimebox = Omit<Timebox, 'taskId' | 'kind' | 'reviewScheduleId'> & {
  taskId?: string | null
  kind?: TimeboxKind | string
  reviewScheduleId?: string | null
}
type LegacyLearningSession = Omit<LearningSession, 'blockId'> & {
  blockId?: string | null
}

export interface V8MigrationInput {
  identities: LegacyIdentity[]
  directions: Direction[]
  competencies: LegacyCompetency[]
  directionCompetencies: DirectionCompetency[]
  goals: Goal[]
  tasks: LegacyTask[]
  taskGoals: TaskGoal[]
  timeboxes: LegacyTimebox[]
  learningSessions: LegacyLearningSession[]
}

export interface V8MigrationOutput {
  identities: Identity[]
  competencies: Competency[]
  tasks: Task[]
  timeboxes: Timebox[]
  learningSessions: LearningSession[]
}

export interface V8MigrationReport {
  fromSchemaVersion: number | null
  toSchemaVersion: number
  migratedAt: string
  counts: Record<string, number>
  competencyIdentityInferred: number
  competencyIdentityInferredIds: string[]
  competencyIdentityUnresolved: number
  competencyIdentityUnresolvedIds: string[]
  competencyIdentityConflicts: number
  competencyIdentityConflictIds: string[]
  taskStageOutcomeMapped: number
  taskStageOutcomeMappedIds: string[]
  taskStageOutcomeUnresolved: number
  taskStageOutcomeUnresolvedIds: string[]
  multiStageOutcomeTasks: number
  multiStageOutcomeTaskIds: string[]
  preservedLegacyTaskGoals: number
  freeTimeboxes: number
  timeboxKindsDefaulted: number
  learningSessionsWithoutBlock: number
}

export interface V8MigrationResult {
  data: V8MigrationOutput
  report: V8MigrationReport
}

const VALID_TIMEBOX_KINDS = new Set<string>(['TASK', 'REVIEW', 'FOCUS', 'BREAK'])

function isUsable(row: BaseEntity): boolean {
  return !row.archivedAt && !row.deletedAt
}

function withSchemaVersion<T extends BaseEntity>(row: T): T {
  return { ...row, schemaVersion: SCHEMA_VERSION }
}

export function migrateV8Data(
  input: V8MigrationInput,
  options: { fromSchemaVersion?: number | null; migratedAt?: string } = {},
): V8MigrationResult {
  const migratedAt = options.migratedAt ?? new Date().toISOString()
  const identityIds = new Set(
    input.identities.filter((row) => !row.deletedAt).map((row) => row.id),
  )
  const identities = input.identities.map((identity) =>
    withSchemaVersion({ ...identity, visionId: identity.visionId || null }),
  )

  const directionIdentity = new Map<string, string>()
  for (const direction of input.directions) {
    if (direction.identityId && identityIds.has(direction.identityId)) {
      directionIdentity.set(direction.id, direction.identityId)
    }
  }

  const inferredByDirectionRelation = new Map<string, string>()
  const relations = input.directionCompetencies
    .filter((relation) => isUsable(relation) && directionIdentity.has(relation.directionId))
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  for (const relation of relations) {
    if (!inferredByDirectionRelation.has(relation.competencyId)) {
      const identityId = directionIdentity.get(relation.directionId)
      if (identityId) inferredByDirectionRelation.set(relation.competencyId, identityId)
    }
  }

  const competencyById = new Map(input.competencies.map((row) => [row.id, row]))
  const resolvedIdentity = new Map<string, string | null>()
  const resolving = new Set<string>()
  const inferredIds: string[] = []
  const unresolvedIds: string[] = []
  const conflictIds: string[] = []
  const singleIdentityId = identityIds.size === 1 ? [...identityIds][0] ?? null : null

  function resolveCompetencyIdentity(id: string): string | null {
    if (resolvedIdentity.has(id)) return resolvedIdentity.get(id) ?? null
    const competency = competencyById.get(id)
    if (!competency) return null
    if (resolving.has(id)) return null
    resolving.add(id)

    const existing =
      competency.identityId && identityIds.has(competency.identityId)
        ? competency.identityId
        : null
    const fromDirection = inferredByDirectionRelation.get(id) ?? null
    const fromParent = competency.parentId
      ? resolveCompetencyIdentity(competency.parentId)
      : null
    const resolved = existing ?? fromDirection ?? fromParent ?? singleIdentityId ?? null

    if (existing && fromParent && existing !== fromParent) conflictIds.push(id)
    if (!competency.identityId && resolved) inferredIds.push(id)
    if (!resolved) unresolvedIds.push(id)

    resolving.delete(id)
    resolvedIdentity.set(id, resolved)
    return resolved
  }

  const competencies = input.competencies.map((competency) => {
    const identityId = resolveCompetencyIdentity(competency.id)
    const weight =
      typeof competency.weight === 'number' &&
      Number.isFinite(competency.weight) &&
      competency.weight > 0
        ? competency.weight
        : 1
    return withSchemaVersion({ ...competency, identityId, weight })
  })

  const goalById = new Map(input.goals.map((goal) => [goal.id, goal]))
  const goalsByTask = new Map<string, TaskGoal[]>()
  for (const link of input.taskGoals) {
    if (!isUsable(link)) continue
    const goal = goalById.get(link.goalId)
    if (!goal || !isUsable(goal)) continue
    const rows = goalsByTask.get(link.taskId) ?? []
    rows.push(link)
    goalsByTask.set(link.taskId, rows)
  }
  for (const rows of goalsByTask.values()) {
    rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  const mappedTaskIds: string[] = []
  const unresolvedTaskIds: string[] = []
  const multiTaskIds: string[] = []
  const tasks = input.tasks.map((task) => {
    const validLinks = goalsByTask.get(task.id) ?? []
    const existing =
      task.stageOutcomeId && goalById.has(task.stageOutcomeId)
        ? task.stageOutcomeId
        : null
    const stageOutcomeId = existing ?? validLinks[0]?.goalId ?? null
    if (!existing && stageOutcomeId) mappedTaskIds.push(task.id)
    if (!stageOutcomeId) unresolvedTaskIds.push(task.id)
    if (validLinks.length > 1) multiTaskIds.push(task.id)
    return withSchemaVersion({ ...task, stageOutcomeId })
  })

  let kindsDefaulted = 0
  const timeboxes = input.timeboxes.map((timebox) => {
    const taskId = timebox.taskId || null
    let kind: TimeboxKind
    if (timebox.kind && VALID_TIMEBOX_KINDS.has(timebox.kind)) {
      kind = timebox.kind as TimeboxKind
    } else {
      kind = taskId ? 'TASK' : 'FOCUS'
      kindsDefaulted += 1
    }
    return withSchemaVersion({
      ...timebox,
      taskId,
      kind,
      reviewScheduleId: timebox.reviewScheduleId ?? null,
    })
  })

  const learningSessions = input.learningSessions.map((session) =>
    withSchemaVersion({ ...session, blockId: session.blockId ?? null }),
  )

  return {
    data: { identities, competencies, tasks, timeboxes, learningSessions },
    report: {
      fromSchemaVersion: options.fromSchemaVersion ?? null,
      toSchemaVersion: SCHEMA_VERSION,
      migratedAt,
      counts: {
        identities: identities.length,
        competencies: competencies.length,
        goals: input.goals.length,
        tasks: tasks.length,
        taskGoals: input.taskGoals.length,
        timeboxes: timeboxes.length,
        learningSessions: learningSessions.length,
      },
      competencyIdentityInferred: inferredIds.length,
      competencyIdentityInferredIds: inferredIds,
      competencyIdentityUnresolved: unresolvedIds.length,
      competencyIdentityUnresolvedIds: unresolvedIds,
      competencyIdentityConflicts: conflictIds.length,
      competencyIdentityConflictIds: conflictIds,
      taskStageOutcomeMapped: mappedTaskIds.length,
      taskStageOutcomeMappedIds: mappedTaskIds,
      taskStageOutcomeUnresolved: unresolvedTaskIds.length,
      taskStageOutcomeUnresolvedIds: unresolvedTaskIds,
      multiStageOutcomeTasks: multiTaskIds.length,
      multiStageOutcomeTaskIds: multiTaskIds,
      preservedLegacyTaskGoals: input.taskGoals.length,
      freeTimeboxes: timeboxes.filter((row) => !row.taskId).length,
      timeboxKindsDefaulted: kindsDefaulted,
      learningSessionsWithoutBlock: learningSessions.filter((row) => !row.blockId).length,
    },
  }
}

export function buildMigrationReportSetting(
  report: V8MigrationReport,
  existing?: UserSettings,
  key = 'migration.v8.report',
): UserSettings {
  const timestamp = report.migratedAt
  return {
    id: key,
    key,
    value: report,
    description: 'schema v8 自动迁移报告',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    version: (existing?.version ?? 0) + 1,
    schemaVersion: SCHEMA_VERSION,
    syncStatus: SyncStatus.LOCAL_ONLY,
    lastSyncedAt: null,
    deletedAt: null,
  }
}
