import type { BaseEntity } from './base'
import type {
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  Importance,
  MilestoneStatus,
} from './enums'

export interface Competency extends BaseEntity {
  identityId: string | null
  name: string
  description: string
  category: CompetencyCategory
  parentId: string | null
  weight: number
  targetLevel: CompetencyLevel
  currentLevel: CompetencyLevel
  assessmentCriteria: string
  status: CompetencyStatus
}

export interface Milestone extends BaseEntity {
  directionId: string
  competencyId: string | null
  name: string
  description: string
  startDate: string | null
  dueDate: string | null
  importance: Importance
  status: MilestoneStatus
  successCriteria: string
}