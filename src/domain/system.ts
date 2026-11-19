import type { BaseEntity } from './base'
import type {
  ExportStatus,
  ExportType,
  IntegrationStatus,
  NotificationStatus,
  NotificationType,
} from './enums'

export interface UserSettings extends BaseEntity {
  key: string
  value: unknown
  description: string
}

export interface Notification extends BaseEntity {
  title: string
  content: string
  notificationType: NotificationType
  scheduledAt: string
  status: NotificationStatus
}

export interface ExternalIntegration extends BaseEntity {
  provider: string
  name: string
  externalUrl: string
  settings: Record<string, unknown>
  status: IntegrationStatus
}

export interface DataExport extends BaseEntity {
  exportType: ExportType
  fileName: string
  status: ExportStatus
  counts: Record<string, number>
}