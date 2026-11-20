import type {
  Competency,
  Goal,
  Identity,
  LearningSession,
  Task,
  TaskGoal,
  Timebox,
} from '@/domain'

export interface GrowthSnapshot {
  identities: Identity[]
  competencies: Competency[]
  stageOutcomes: Goal[]
  tasks: Task[]
  timeboxes: Timebox[]
  learningSessions: LearningSession[]
  taskGoals: TaskGoal[]
}

export interface GrowthQueryOptions {
  includeArchived?: boolean
}

export interface StageOutcomeProgress {
  stageOutcomeId: string
  percent: number
  completedMinutes: number
  totalMinutes: number
  taskCount: number
  completedTaskCount: number
  openTaskCount: number
}

export interface CompetencyProgress {
  competencyId: string
  percent: number
  levelPercent: number
  isLeaf: boolean
  stageOutcomeCount: number
  taskCount: number
  completedTaskCount: number
}

export interface GrowthStageOutcomeNode {
  stageOutcome: Goal
  progress: StageOutcomeProgress
  tasks: Task[]
}

export interface GrowthCompetencyNode {
  competency: Competency
  children: GrowthCompetencyNode[]
  stageOutcomes: GrowthStageOutcomeNode[]
  progress: CompetencyProgress
}

export interface GrowthIdentityNode {
  identity: Identity
  roots: GrowthCompetencyNode[]
  percent: number
  stageOutcomeCount: number
  taskCount: number
  completedTaskCount: number
}

export interface GrowthOverview {
  snapshot: GrowthSnapshot
  identities: GrowthIdentityNode[]
  unassignedCompetencies: GrowthCompetencyNode[]
}

export interface GrowthDomainIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  store: 'identities' | 'competencies' | 'goals' | 'tasks' | 'timeboxes' | 'learningSessions'
  id: string
  field?: string
}

export interface GrowthValidationResult {
  valid: boolean
  issues: GrowthDomainIssue[]
  errorCount: number
  warningCount: number
}
