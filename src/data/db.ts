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

export const DATABASE_NAME = 'personal-growth-os'

const V3_STORES = {
  visions: 'id, createdAt, updatedAt, status, reviewDate, archivedAt',
  identities: 'id, visionId, createdAt, updatedAt, archivedAt',
  directions: 'id, visionId, identityId, status, priority, createdAt, updatedAt, archivedAt',
  competencies: 'id, parentId, category, status, createdAt, updatedAt, archivedAt',
  directionCompetencies: 'id, directionId, competencyId, [directionId+competencyId], updatedAt',
  milestones: 'id, directionId, status, dueDate, importance, createdAt, updatedAt, archivedAt',
  goals: 'id, parentGoalId, status, goalType, dueDate, createdAt, updatedAt, archivedAt',
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

const CURRENT_STORES = {
  ...V3_STORES,
  milestones:
    'id, directionId, competencyId, status, dueDate, importance, createdAt, updatedAt, archivedAt',
}

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

    this.version(SCHEMA_VERSION).stores(CURRENT_STORES)

    this.version(SCHEMA_VERSION).upgrade(async (transaction) => {
      await transaction
        .table<Milestone>('milestones')
        .toCollection()
        .modify((milestone) => {
          if (milestone.competencyId === undefined) {
            milestone.competencyId = null
          }
        })
    })
  }
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