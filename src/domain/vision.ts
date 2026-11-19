import type { BaseEntity } from './base'
import type { DirectionStatus, VisionStatus } from './enums'

export interface Vision extends BaseEntity {
  title: string
  description: string
  timeHorizon: string
  lifeArea: string
  motivation: string
  successCriteria: string
  status: VisionStatus
  reviewDate: string | null
}

export interface Identity extends BaseEntity {
  visionId: string
  title: string
  description: string
  identityStatement: string
}

export interface Direction extends BaseEntity {
  visionId: string
  identityId: string | null
  name: string
  description: string
  priority: number
  startDate: string | null
  targetDate: string | null
  weeklyTimeBudget: number
  status: DirectionStatus
  color: string
  reviewFrequency: string
}