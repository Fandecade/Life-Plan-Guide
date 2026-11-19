import type { BaseEntity } from './base'
import type {
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  Importance,
  MilestoneStatus,
} from './enums'

export interface Competency extends BaseEntity {
  name: string
  description: string
  category: CompetencyCategory
  parentId: string | null
  targetLevel: CompetencyLevel
  currentLevel: CompetencyLevel
  assessmentCriteria: string
  status: CompetencyStatus
}

export interface Milestone extends BaseEntity {
  directionId: string
  name: string
  description: string
  startDate: string | null
  dueDate: string | null
  importance: Importance
  status: MilestoneStatus
  successCriteria: string
}