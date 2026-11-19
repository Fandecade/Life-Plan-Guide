export const VisionStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ADJUSTING: 'ADJUSTING',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const
export type VisionStatus = (typeof VisionStatus)[keyof typeof VisionStatus]

export const DirectionStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const
export type DirectionStatus = (typeof DirectionStatus)[keyof typeof DirectionStatus]

export const CompetencyCategory = {
  KNOWLEDGE: 'KNOWLEDGE',
  SKILL: 'SKILL',
  PRACTICE: 'PRACTICE',
  SOFT_SKILL: 'SOFT_SKILL',
} as const
export type CompetencyCategory = (typeof CompetencyCategory)[keyof typeof CompetencyCategory]

export const CompetencyLevel = {
  L0: 'L0',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
  L5: 'L5',
} as const
export type CompetencyLevel = (typeof CompetencyLevel)[keyof typeof CompetencyLevel]

export const CompetencyStatus = {
  NOT_STARTED: 'NOT_STARTED',
  LEARNING: 'LEARNING',
  PENDING_VALIDATION: 'PENDING_VALIDATION',
  VALIDATED: 'VALIDATED',
} as const
export type CompetencyStatus = (typeof CompetencyStatus)[keyof typeof CompetencyStatus]

export const Importance = {
  CRITICAL: 'CRITICAL',
  IMPORTANT: 'IMPORTANT',
  NORMAL: 'NORMAL',
} as const
export type Importance = (typeof Importance)[keyof typeof Importance]

export const MilestoneStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DELAYED: 'DELAYED',
  CANCELLED: 'CANCELLED',
} as const
export type MilestoneStatus = (typeof MilestoneStatus)[keyof typeof MilestoneStatus]

export const GoalType = {
  OUTCOME: 'OUTCOME',
  COMPETENCY: 'COMPETENCY',
  PROCESS: 'PROCESS',
} as const
export type GoalType = (typeof GoalType)[keyof typeof GoalType]

export const GoalStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus]

export const ProgressMode = {
  TASK_BASED: 'TASK_BASED',
  MILESTONE_BASED: 'MILESTONE_BASED',
  MANUAL: 'MANUAL',
} as const
export type ProgressMode = (typeof ProgressMode)[keyof typeof ProgressMode]

export const TaskType = {
  PROJECT: 'PROJECT',
  LEARNING: 'LEARNING',
  OUTPUT: 'OUTPUT',
  PRACTICE: 'PRACTICE',
  REVIEW: 'REVIEW',
  DAILY: 'DAILY',
  HABIT: 'HABIT',
} as const
export type TaskType = (typeof TaskType)[keyof typeof TaskType]

export const TaskStatus = {
  BACKLOG: 'BACKLOG',
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

export const Urgency = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const
export type Urgency = (typeof Urgency)[keyof typeof Urgency]

export const TimeboxStatus = {
  PLANNED: 'PLANNED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const
export type TimeboxStatus = (typeof TimeboxStatus)[keyof typeof TimeboxStatus]

export const DependencyType = {
  FINISH_TO_START: 'FINISH_TO_START',
  START_TO_START: 'START_TO_START',
  FINISH_TO_FINISH: 'FINISH_TO_FINISH',
} as const
export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType]

export const HabitCategory = {
  STARTER: 'STARTER',
  SUSTAINER: 'SUSTAINER',
  SUPPORT: 'SUPPORT',
} as const
export type HabitCategory = (typeof HabitCategory)[keyof typeof HabitCategory]

export const HabitStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const
export type HabitStatus = (typeof HabitStatus)[keyof typeof HabitStatus]

export const AnchorType = {
  TIME: 'TIME',
  EVENT: 'EVENT',
  LOCATION: 'LOCATION',
} as const
export type AnchorType = (typeof AnchorType)[keyof typeof AnchorType]

export const PromptStatus = {
  UNCLEAR: 'UNCLEAR',
  PARTIAL: 'PARTIAL',
  CLEAR: 'CLEAR',
} as const
export type PromptStatus = (typeof PromptStatus)[keyof typeof PromptStatus]

export const BehaviorCandidateStatus = {
  CANDIDATE: 'CANDIDATE',
  DESIGNED: 'DESIGNED',
  ARCHIVED: 'ARCHIVED',
} as const
export type BehaviorCandidateStatus =
  (typeof BehaviorCandidateStatus)[keyof typeof BehaviorCandidateStatus]

export const BehaviorSourceType = {
  DIRECTION: 'DIRECTION',
  GOAL: 'GOAL',
  TASK: 'TASK',
  CUSTOM: 'CUSTOM',
} as const
export type BehaviorSourceType =
  (typeof BehaviorSourceType)[keyof typeof BehaviorSourceType]

export const LearningRecordType = {
  INPUT: 'INPUT',
  OUTPUT: 'OUTPUT',
  FEEDBACK: 'FEEDBACK',
  REFLECTION: 'REFLECTION',
  RELEARNING: 'RELEARNING',
  EVIDENCE: 'EVIDENCE',
} as const
export type LearningRecordType = (typeof LearningRecordType)[keyof typeof LearningRecordType]

export const SessionStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  INTERRUPTED: 'INTERRUPTED',
} as const
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus]

export const MasteryLevel = {
  L0: 'L0',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
} as const
export type MasteryLevel = (typeof MasteryLevel)[keyof typeof MasteryLevel]

export const ReviewScheduleStatus = {
  PENDING: 'PENDING',
  DUE: 'DUE',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const
export type ReviewScheduleStatus = (typeof ReviewScheduleStatus)[keyof typeof ReviewScheduleStatus]

export const EvidenceType = {
  CODE: 'CODE',
  REPORT: 'REPORT',
  PROJECT: 'PROJECT',
  PAPER: 'PAPER',
  NOTE: 'NOTE',
  COURSE: 'COURSE',
  TEST: 'TEST',
  PRESENTATION: 'PRESENTATION',
} as const
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType]

export const ResourceType = {
  ANKI: 'ANKI',
  OBSIDIAN: 'OBSIDIAN',
  ZOTERO: 'ZOTERO',
  GITHUB: 'GITHUB',
  VSCODE: 'VSCODE',
  CALENDAR: 'CALENDAR',
  CLOUD: 'CLOUD',
  OTHER: 'OTHER',
} as const
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType]

export const ReviewType = {
  SESSION: 'SESSION',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  MILESTONE: 'MILESTONE',
} as const
export type ReviewType = (typeof ReviewType)[keyof typeof ReviewType]

export const ReviewStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
} as const
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus]

export const FindingType = {
  EFFECTIVE: 'EFFECTIVE',
  PROBLEM: 'PROBLEM',
  BLIND_SPOT: 'BLIND_SPOT',
  INSIGHT: 'INSIGHT',
} as const
export type FindingType = (typeof FindingType)[keyof typeof FindingType]

export const AdjustmentTargetType = {
  VISION: 'VISION',
  IDENTITY: 'IDENTITY',
  DIRECTION: 'DIRECTION',
  COMPETENCY: 'COMPETENCY',
  MILESTONE: 'MILESTONE',
  GOAL: 'GOAL',
  TASK: 'TASK',
  HABIT: 'HABIT',
  LEARNING: 'LEARNING',
  REVIEW: 'REVIEW',
  SCHEDULE: 'SCHEDULE',
} as const
export type AdjustmentTargetType = (typeof AdjustmentTargetType)[keyof typeof AdjustmentTargetType]

export const AdjustmentStatus = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
} as const
export type AdjustmentStatus = (typeof AdjustmentStatus)[keyof typeof AdjustmentStatus]

export const NotificationType = {
  TASK: 'TASK',
  REVIEW: 'REVIEW',
  HABIT: 'HABIT',
  MILESTONE: 'MILESTONE',
  SYSTEM: 'SYSTEM',
} as const
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]

export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  READ: 'READ',
  DISMISSED: 'DISMISSED',
} as const
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus]

export const IntegrationStatus = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTED: 'CONNECTED',
  DISABLED: 'DISABLED',
} as const
export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus]

export const ExportStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus]

export const ExportType = {
  FULL_JSON: 'FULL_JSON',
  MARKDOWN: 'MARKDOWN',
} as const
export type ExportType = (typeof ExportType)[keyof typeof ExportType]