import type { BaseEntity } from './base'
import type {
  AnchorType,
  BehaviorCandidateStatus,
  BehaviorSourceType,
  HabitCategory,
  HabitStatus,
  PromptStatus,
} from './enums'

export interface Habit extends BaseEntity {
  name: string
  description: string
  category: HabitCategory
  anchorType: AnchorType
  anchorDescription: string
  tinyBehavior: string
  celebration: string
  motivationLevel: number
  abilityLevel: number
  promptStatus: PromptStatus
  frequency: string
  status: HabitStatus
}

export interface HabitLog extends BaseEntity {
  habitId: string
  occurredAt: string
  anchorTriggered: boolean
  tinyCompleted: boolean
  expandedCompleted: boolean
  celebrationDone: boolean
  difficulty: number
  obstacle: string
  note: string
}
export interface BehaviorCandidate extends BaseEntity {
  title: string
  description: string
  sourceType: BehaviorSourceType
  sourceId: string | null
  directionId: string | null
  impact: number
  ease: number
  status: BehaviorCandidateStatus
  habitId: string | null
  note: string
}