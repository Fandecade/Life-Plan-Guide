import Dexie, { type Table } from 'dexie'
import type {
  Adjustment,
  BehaviorCandidate,
  Competency,
  CompetencyEvidence,
  DataExport,
  Direction,
  DirectionCompetency,
  Evidence,
  ExternalIntegration,
  Goal,
  GoalDirection,
  GoalMilestone,
  Habit,
  HabitLog,
  Identity,
  KnowledgeItem,
  LearningRecord,
  LearningSession,
  Milestone,
  Notification,
  Resource,
  Review,
  ReviewFinding,
  ReviewSchedule,
  SessionKnowledge,
  Task,
  TaskCompetency,
  TaskDependency,
  TaskGoal,
  Timebox,
  UserSettings,
  Vision,
  Workflow,
} from '@/domain'
import { SCHEMA_VERSION } from '@/domain'
import { ALL_STORES } from './schema'
import { DATABASE_NAME } from './constants'
import {
  buildMigrationReportSetting,
  migrateV8Data,
  type V8MigrationInput,
} from './migrations/v8'

export { DATABASE_NAME } from './constants'

const V3_STORES = {
  visions: 'id, createdAt, updatedAt, status, reviewDate, archivedAt',
  identities: 'id, visionId, createdAt, updatedAt, archivedAt',
  directions: 'id, visionId, identityId, status, priority, createdAt, updatedAt, archivedAt',
  competencies: 'id, parentId, category, status, createdAt, updatedAt, archivedAt',
  directionCompetencies: 'id, directionId, competencyId, [directionId+competencyId], updatedAt',
  milestones: 'id, directionId, status, dueDate, importance, createdAt, updatedAt, archivedAt',
  goals: 'id, parentGoalId, competencyId, status, goalType, dueDate, createdAt, updatedAt, archivedAt',
  goalDirections: 'id, goalId, directionId, [goalId+directionId], updatedAt',
  goalMilestones: 'id, goalId, milestoneId, [goalId+milestoneId], updatedAt',
  tasks: 'id, parentTaskId, status, taskType, scheduledDate, dueDate, priority, createdAt, updatedAt, archivedAt',
  taskGoals: 'id, taskId, goalId, [taskId+goalId], updatedAt',
  taskCompetencies: 'id, taskId, competencyId, [taskId+competencyId], updatedAt',
  taskDependencies: 'id, predecessorTaskId, successorTaskId, updatedAt',
  timeboxes: 'id, taskId, plannedStart, status, updatedAt',
  habits: 'id, status, category, createdAt, updatedAt, archivedAt',
  habitLogs: 'id, habitId, occurredAt, updatedAt',
  behaviorCandidates:
    'id, status, directionId, impact, ease, habitId, createdAt, updatedAt, archivedAt',
  workflows: 'id, name, createdAt, updatedAt, archivedAt',
  learningSessions: 'id, taskId, workflowId, status, startedAt, updatedAt',
  learningRecords: 'id, sessionId, recordType, occurredAt, updatedAt',
  knowledgeItems: 'id, masteryLevel, lastReviewedAt, createdAt, updatedAt, archivedAt',
  sessionKnowledge: 'id, sessionId, knowledgeItemId, [sessionId+knowledgeItemId], updatedAt',
  reviewSchedules: 'id, knowledgeItemId, scheduledAt, status, nextReviewAt, updatedAt',
  evidences: 'id, evidenceType, createdAt, updatedAt, archivedAt',
  competencyEvidences: 'id, competencyId, evidenceId, [competencyId+evidenceId], updatedAt',
  resources: 'id, resourceType, createdAt, updatedAt, archivedAt',
  reviews: 'id, reviewType, targetDate, status, createdAt, updatedAt, archivedAt',
  reviewFindings: 'id, reviewId, findingType, updatedAt',
  adjustments: 'id, reviewId, targetType, status, updatedAt',
  userSettings: 'id, key, updatedAt',
  notifications: 'id, notificationType, status, scheduledAt, updatedAt',
  externalIntegrations: 'id, provider, status, updatedAt',
  dataExports: 'id, exportType, status, createdAt, updatedAt',
} as const

const V5_STORES = {
  ...V3_STORES,
  milestones:
    'id, directionId, competencyId, status, dueDate, importance, createdAt, updatedAt, archivedAt',
}

const V6_STORES = {
  ...V5_STORES,
  tasks:
    'id, parentTaskId, status, taskType, scheduledDate, dueDate, priority, completedAt, createdAt, updatedAt, archivedAt',
  evidences: 'id, evidenceType, taskId, createdAt, updatedAt, archivedAt',
}

const V7_STORES = {
  ...V6_STORES,
  timeboxes: 'id, taskId, plannedStart, status, kind, updatedAt',
}

const V8_STORES = {
  ...V7_STORES,
  competencies:
    'id, identityId, parentId, category, status, createdAt, updatedAt, archivedAt',
  tasks:
    'id, stageOutcomeId, parentTaskId, status, taskType, scheduledDate, dueDate, priority, completedAt, createdAt, updatedAt, archivedAt',
  timeboxes: 'id, taskId, plannedStart, status, kind, updatedAt',
  learningSessions: 'id, taskId, blockId, workflowId, status, startedAt, updatedAt',
}

const CURRENT_STORES = V8_STORES

export class GrowthDatabase extends Dexie {
  visions!: Table<Vision, string>
  identities!: Table<Identity, string>
  directions!: Table<Direction, string>
  competencies!: Table<Competency, string>
  directionCompetencies!: Table<DirectionCompetency, string>
  milestones!: Table<Milestone, string>
  goals!: Table<Goal, string>
  goalDirections!: Table<GoalDirection, string>
  goalMilestones!: Table<GoalMilestone, string>
  tasks!: Table<Task, string>
  taskGoals!: Table<TaskGoal, string>
  taskCompetencies!: Table<TaskCompetency, string>
  taskDependencies!: Table<TaskDependency, string>
  timeboxes!: Table<Timebox, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  behaviorCandidates!: Table<BehaviorCandidate, string>
  workflows!: Table<Workflow, string>
  learningSessions!: Table<LearningSession, string>
  learningRecords!: Table<LearningRecord, string>
  knowledgeItems!: Table<KnowledgeItem, string>
  sessionKnowledge!: Table<SessionKnowledge, string>
  reviewSchedules!: Table<ReviewSchedule, string>
  evidences!: Table<Evidence, string>
  competencyEvidences!: Table<CompetencyEvidence, string>
  resources!: Table<Resource, string>
  reviews!: Table<Review, string>
  reviewFindings!: Table<ReviewFinding, string>
  adjustments!: Table<Adjustment, string>
  userSettings!: Table<UserSettings, string>
  notifications!: Table<Notification, string>
  externalIntegrations!: Table<ExternalIntegration, string>
  dataExports!: Table<DataExport, string>

  constructor() {
    super(DATABASE_NAME)

    this.version(3).stores(V3_STORES)

    this.version(3).upgrade(async (transaction) => {
      const identityRows = (await transaction.table('identities').toArray()) as Identity[]
      const firstIdentityByVision = new Map<string, string>()
      for (const identity of identityRows) {
        if (!identity.visionId) continue
        if (!firstIdentityByVision.has(identity.visionId)) {
          firstIdentityByVision.set(identity.visionId, identity.id)
        }
      }
      await transaction
        .table<Direction>('directions')
        .toCollection()
        .modify((direction) => {
          if (!direction.identityId) {
            direction.identityId = firstIdentityByVision.get(direction.visionId) ?? null
          }
        })
    })

    this.version(5).stores(V5_STORES)

    this.version(5).upgrade(async (transaction) => {
      await transaction
        .table<Milestone>('milestones')
        .toCollection()
        .modify((milestone) => {
          if (milestone.competencyId === undefined) {
            milestone.competencyId = null
          }
        })
      await transaction
        .table<Goal>('goals')
        .toCollection()
        .modify((goal) => {
          if (goal.competencyId === undefined) {
            goal.competencyId = null
          }
        })
    })

    this.version(6).stores(V6_STORES)

    this.version(6).upgrade(async (transaction) => {
      await transaction
        .table<Task>('tasks')
        .toCollection()
        .modify((task) => {
          if (task.completedAt === undefined) {
            task.completedAt = task.status === 'COMPLETED' ? task.updatedAt : null
          }
        })
      await transaction
        .table<Evidence>('evidences')
        .toCollection()
        .modify((evidence) => {
          if (evidence.taskId === undefined) {
            evidence.taskId = null
          }
        })
    })

    this.version(7).stores(V7_STORES)

    this.version(7).upgrade(async (transaction) => {
      await transaction
        .table<Timebox>('timeboxes')
        .toCollection()
        .modify((timebox) => {
          if (timebox.kind === undefined) {
            timebox.kind = taskIdLike(timebox) ? 'TASK' : 'FOCUS'
          }
          if (timebox.reviewScheduleId === undefined) {
            timebox.reviewScheduleId = null
          }
        })
    })

    this.version(SCHEMA_VERSION).stores(CURRENT_STORES)

    this.version(SCHEMA_VERSION).upgrade(async (transaction) => {
      const input: V8MigrationInput = {
        identities: await transaction.table<Identity>('identities').toArray(),
        directions: await transaction.table<Direction>('directions').toArray(),
        competencies: await transaction.table<Competency>('competencies').toArray(),
        directionCompetencies: await transaction
          .table<DirectionCompetency>('directionCompetencies')
          .toArray(),
        goals: await transaction.table<Goal>('goals').toArray(),
        tasks: await transaction.table<Task>('tasks').toArray(),
        taskGoals: await transaction.table<TaskGoal>('taskGoals').toArray(),
        timeboxes: await transaction.table<Timebox>('timeboxes').toArray(),
        learningSessions: await transaction
          .table<LearningSession>('learningSessions')
          .toArray(),
      }
      const { data, report } = migrateV8Data(input, { fromSchemaVersion: 7 })
      await transaction.table<Identity>('identities').bulkPut(data.identities)
      await transaction.table<Competency>('competencies').bulkPut(data.competencies)
      await transaction.table<Task>('tasks').bulkPut(data.tasks)
      await transaction.table<Timebox>('timeboxes').bulkPut(data.timeboxes)
      await transaction.table<LearningSession>('learningSessions').bulkPut(data.learningSessions)

      const reportKey = 'migration.v8.report'
      const existing = await transaction.table<UserSettings>('userSettings').get(reportKey)
      await transaction
        .table<UserSettings>('userSettings')
        .put(buildMigrationReportSetting(report, existing, reportKey))
    })
  }
}

function taskIdLike(timebox: Timebox): boolean {
  return typeof timebox.taskId === 'string' && timebox.taskId.length > 0
}

export interface DatabaseInfo {
  name: string
  version: number
  counts: Record<string, number>
  total: number
}

export async function readDatabaseInfo(db: GrowthDatabase): Promise<DatabaseInfo> {
  const counts: Record<string, number> = {}
  let total = 0
  for (const store of ALL_STORES) {
    const count = await db.table(store).count()
    counts[store] = count
    total += count
  }
  return { name: db.name, version: db.verno, counts, total }
}

export async function clearAllData(db: GrowthDatabase): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const store of ALL_STORES) {
      await db.table(store).clear()
    }
  })
}
