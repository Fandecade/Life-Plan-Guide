import type { BaseEntity } from './base'
import type { EvidenceType, ResourceType } from './enums'

export interface Evidence extends BaseEntity {
  title: string
  description: string
  evidenceType: EvidenceType
  fileUrl: string
  externalUrl: string
  qualityNote: string
  taskId: string | null
}

export interface Resource extends BaseEntity {
  title: string
  resourceType: ResourceType
  externalUrl: string
  description: string
  source: string
}