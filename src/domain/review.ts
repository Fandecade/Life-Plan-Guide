import type { BaseEntity } from './base'
import type {
  AdjustmentStatus,
  AdjustmentTargetType,
  FindingType,
  ReviewStatus,
  ReviewType,
} from './enums'

export interface Review extends BaseEntity {
  reviewType: ReviewType
  targetDate: string
  startDate: string | null
  endDate: string | null
  content: string
  energyLevel: number
  status: ReviewStatus
}

export interface ReviewFinding extends BaseEntity {
  reviewId: string
  findingType: FindingType
  description: string
  rootCause: string
  proposedAction: string
}

export interface Adjustment extends BaseEntity {
  reviewId: string
  targetType: AdjustmentTargetType
  targetId: string
  field?: string
  oldValue: string
  newValue: string
  reason: string
  status: AdjustmentStatus
}