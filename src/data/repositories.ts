import type { GrowthDatabase } from './db'
import { createDexieRepository, type Repository } from './repository'
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

export interface Repositories {
  visions: Repository<Vision>
  identities: Repository<Identity>
  directions: Repository<Direction>
  competencies: Repository<Competency>
  directionCompetencies: Repository<DirectionCompetency>
  milestones: Repository<Milestone>
  goals: Repository<Goal>
  goalDirections: Repository<GoalDirection>
  goalMilestones: Repository<GoalMilestone>
  tasks: Repository<Task>
  taskGoals: Repository<TaskGoal>
  taskCompetencies: Repository<TaskCompetency>
  taskDependencies: Repository<TaskDependency>
  timeboxes: Repository<Timebox>
  habits: Repository<Habit>
  habitLogs: Repository<HabitLog>
  behaviorCandidates: Repository<BehaviorCandidate>
  workflows: Repository<Workflow>
  learningSessions: Repository<LearningSession>
  learningRecords: Repository<LearningRecord>
  knowledgeItems: Repository<KnowledgeItem>
  sessionKnowledge: Repository<SessionKnowledge>
  reviewSchedules: Repository<ReviewSchedule>
  evidences: Repository<Evidence>
  competencyEvidences: Repository<CompetencyEvidence>
  resources: Repository<Resource>
  reviews: Repository<Review>
  reviewFindings: Repository<ReviewFinding>
  adjustments: Repository<Adjustment>
  userSettings: Repository<UserSettings>
  notifications: Repository<Notification>
  externalIntegrations: Repository<ExternalIntegration>
  dataExports: Repository<DataExport>
}

export function createRepositories(db: GrowthDatabase): Repositories {
  return {
    visions: createDexieRepository(db.visions),
    identities: createDexieRepository(db.identities),
    directions: createDexieRepository(db.directions),
    competencies: createDexieRepository(db.competencies),
    directionCompetencies: createDexieRepository(db.directionCompetencies),
    milestones: createDexieRepository(db.milestones),
    goals: createDexieRepository(db.goals),
    goalDirections: createDexieRepository(db.goalDirections),
    goalMilestones: createDexieRepository(db.goalMilestones),
    tasks: createDexieRepository(db.tasks),
    taskGoals: createDexieRepository(db.taskGoals),
    taskCompetencies: createDexieRepository(db.taskCompetencies),
    taskDependencies: createDexieRepository(db.taskDependencies),
    timeboxes: createDexieRepository(db.timeboxes),
    habits: createDexieRepository(db.habits),
    habitLogs: createDexieRepository(db.habitLogs),
    behaviorCandidates: createDexieRepository(db.behaviorCandidates),
    workflows: createDexieRepository(db.workflows),
    learningSessions: createDexieRepository(db.learningSessions),
    learningRecords: createDexieRepository(db.learningRecords),
    knowledgeItems: createDexieRepository(db.knowledgeItems),
    sessionKnowledge: createDexieRepository(db.sessionKnowledge),
    reviewSchedules: createDexieRepository(db.reviewSchedules),
    evidences: createDexieRepository(db.evidences),
    competencyEvidences: createDexieRepository(db.competencyEvidences),
    resources: createDexieRepository(db.resources),
    reviews: createDexieRepository(db.reviews),
    reviewFindings: createDexieRepository(db.reviewFindings),
    adjustments: createDexieRepository(db.adjustments),
    userSettings: createDexieRepository(db.userSettings),
    notifications: createDexieRepository(db.notifications),
    externalIntegrations: createDexieRepository(db.externalIntegrations),
    dataExports: createDexieRepository(db.dataExports),
  }
}