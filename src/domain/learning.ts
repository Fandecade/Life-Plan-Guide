import type { BaseEntity } from './base'
import type {
  LearningRecordType,
  MasteryLevel,
  ReviewScheduleStatus,
  SessionStatus,
  TaskType,
} from './enums'

export interface WorkflowStage {
  key: string
  name: string
  goal: string
  prompt: string
  suggestedMinutes: number
  required: boolean
  needsRecord: boolean
  externalTool: string | null
}

export interface Workflow extends BaseEntity {
  name: string
  description: string
  stages: WorkflowStage[]
  applicableTaskTypes: TaskType[]
  defaultDuration: number
  outputRequirements: string
  feedbackRequirements: string
  externalToolSuggestions: string[]
}

export interface LearningSession extends BaseEntity {
  taskId: string | null
  workflowId: string | null
  startedAt: string
  endedAt: string | null
  currentStage: string | null
  status: SessionStatus
  learningIntention: string
  selfPrediction: number
  actualAssessment: number | null
  actualDuration: number
}

export interface LearningRecord extends BaseEntity {
  sessionId: string
  taskId: string | null
  recordType: LearningRecordType
  title: string
  content: string
  externalUrl: string
  occurredAt: string
  selfAssessment: number | null
}

export interface KnowledgeItem extends BaseEntity {
  title: string
  description: string
  source: string
  masteryLevel: MasteryLevel
  lastReviewedAt: string | null
}

export interface ReviewSchedule extends BaseEntity {
  knowledgeItemId: string
  scheduledAt: string
  completedAt: string | null
  recallResult: number | null
  difficulty: number | null
  nextReviewAt: string | null
  externalTool: string
  externalUrl: string
  status: ReviewScheduleStatus
}