import type { BaseEntity } from './base'
import type {
  CompetencyLevel,
  DependencyType,
  Priority,
} from './enums'

export interface DirectionCompetency extends BaseEntity {
  directionId: string
  competencyId: string
  requiredLevel: CompetencyLevel
  priority: Priority
}

export interface GoalDirection extends BaseEntity {
  goalId: string
  directionId: string
}

export interface GoalMilestone extends BaseEntity {
  goalId: string
  milestoneId: string
}

export interface TaskGoal extends BaseEntity {
  taskId: string
  goalId: string
}

export interface TaskCompetency extends BaseEntity {
  taskId: string
  competencyId: string
}

export interface TaskDependency extends BaseEntity {
  predecessorTaskId: string
  successorTaskId: string
  dependencyType: DependencyType
}

export interface SessionKnowledge extends BaseEntity {
  sessionId: string
  knowledgeItemId: string
}

export interface CompetencyEvidence extends BaseEntity {
  competencyId: string
  evidenceId: string
  assessedLevel: CompetencyLevel
  assessmentNote: string
  assessedAt: string
}