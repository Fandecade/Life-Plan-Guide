import type { BaseEntity } from './base'
import type {
  GoalStatus,
  GoalType,
  Importance,
  Priority,
  ProgressMode,
  TaskStatus,
  TaskType,
  TimeboxKind,
  TimeboxStatus,
  Urgency,
} from './enums'

export interface Goal extends BaseEntity {
  title: string
  description: string
  goalType: GoalType
  parentGoalId: string | null
  competencyId: string | null
  startDate: string | null
  dueDate: string | null
  priority: Priority
  successCriteria: string
  status: GoalStatus
  progressMode: ProgressMode
  manualProgress: number
  reviewFrequency: string
}

export interface Task extends BaseEntity {
  stageOutcomeId: string | null
  title: string
  description: string
  taskType: TaskType
  parentTaskId: string | null
  startDate: string | null
  dueDate: string | null
  scheduledDate: string | null
  estimatedDuration: number
  actualDuration: number
  priority: Priority
  importance: Importance
  urgency: Urgency
  status: TaskStatus
  completionCriteria: string
  learningTemplateId: string | null
  completedAt: string | null
}

export interface Timebox extends BaseEntity {
  taskId: string | null
  plannedStart: string
  plannedEnd: string
  plannedDuration: number
  actualStart: string | null
  actualEnd: string | null
  actualDuration: number
  status: TimeboxStatus
  note: string
  kind: TimeboxKind
  reviewScheduleId: string | null
}
