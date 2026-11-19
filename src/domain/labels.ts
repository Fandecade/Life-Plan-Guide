import type {
  AdjustmentStatus,
  AdjustmentTargetType,
  AnchorType,
  BehaviorCandidateStatus,
  BehaviorSourceType,
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  DependencyType,
  EvidenceType,
  ExportStatus,
  ExportType,
  FindingType,
  GoalStatus,
  GoalType,
  HabitCategory,
  HabitStatus,
  Importance,
  IntegrationStatus,
  LearningRecordType,
  MasteryLevel,
  MilestoneStatus,
  NotificationStatus,
  NotificationType,
  Priority,
  ProgressMode,
  PromptStatus,
  ResourceType,
  ReviewScheduleStatus,
  ReviewStatus,
  ReviewType,
  SessionStatus,
  TaskStatus,
  TaskType,
  TimeboxStatus,
  Urgency,
  VisionStatus,
  DirectionStatus,
} from './enums'

export const visionStatusLabels: Record<VisionStatus, string> = {
  DRAFT: '草拟',
  ACTIVE: '生效',
  ADJUSTING: '调整中',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
}

export const directionStatusLabels: Record<DirectionStatus, string> = {
  PLANNED: '规划中',
  ACTIVE: '进行中',
  PAUSED: '暂停',
  COMPLETED: '完成',
  ARCHIVED: '归档',
}

export const competencyCategoryLabels: Record<CompetencyCategory, string> = {
  KNOWLEDGE: '知识',
  SKILL: '技能',
  PRACTICE: '实践',
  SOFT_SKILL: '软技能',
}

export const competencyLevelLabels: Record<CompetencyLevel, string> = {
  L0: 'L0 · 未接触',
  L1: 'L1 · 初步了解',
  L2: 'L2 · 独立完成',
  L3: 'L3 · 熟练应用',
  L4: 'L4 · 综合运用',
  L5: 'L5 · 创新指导',
}

export const competencyStatusLabels: Record<CompetencyStatus, string> = {
  NOT_STARTED: '未开始',
  LEARNING: '学习中',
  PENDING_VALIDATION: '待验证',
  VALIDATED: '已验证',
}

export const importanceLabels: Record<Importance, string> = {
  CRITICAL: '关键',
  IMPORTANT: '重要',
  NORMAL: '普通',
}

export const milestoneStatusLabels: Record<MilestoneStatus, string> = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '完成',
  DELAYED: '延期',
  CANCELLED: '取消',
}

export const goalTypeLabels: Record<GoalType, string> = {
  OUTCOME: '结果目标',
  COMPETENCY: '能力目标',
  PROCESS: '过程目标',
}

export const goalStatusLabels: Record<GoalStatus, string> = {
  DRAFT: '草拟',
  ACTIVE: '进行中',
  PAUSED: '暂停',
  COMPLETED: '完成',
  CANCELLED: '取消',
}

export const progressModeLabels: Record<ProgressMode, string> = {
  TASK_BASED: '任务完成率',
  MILESTONE_BASED: '里程碑推进',
  MANUAL: '人工评估',
}

export const taskTypeLabels: Record<TaskType, string> = {
  PROJECT: '项目任务',
  LEARNING: '学习任务',
  OUTPUT: '输出任务',
  PRACTICE: '练习任务',
  REVIEW: '复习任务',
  DAILY: '日常事务',
  HABIT: '习惯任务',
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  BACKLOG: '待规划',
  TODO: '待办',
  IN_PROGRESS: '进行中',
  PAUSED: '暂停',
  BLOCKED: '阻塞',
  COMPLETED: '完成',
  CANCELLED: '取消',
}

export const priorityLabels: Record<Priority, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
}

export const urgencyLabels: Record<Urgency, string> = {
  LOW: '不紧急',
  MEDIUM: '一般',
  HIGH: '紧急',
}

export const timeboxStatusLabels: Record<TimeboxStatus, string> = {
  PLANNED: '已计划',
  RUNNING: '进行中',
  COMPLETED: '已完成',
  SKIPPED: '已跳过',
}

export const dependencyTypeLabels: Record<DependencyType, string> = {
  FINISH_TO_START: '完成后开始',
  START_TO_START: '同时开始',
  FINISH_TO_FINISH: '同时完成',
}

export const habitCategoryLabels: Record<HabitCategory, string> = {
  STARTER: '启动习惯',
  SUSTAINER: '持续习惯',
  SUPPORT: '支持性习惯',
}

export const habitStatusLabels: Record<HabitStatus, string> = {
  DRAFT: '草拟',
  ACTIVE: '启用',
  PAUSED: '暂停',
  ARCHIVED: '归档',
}

export const anchorTypeLabels: Record<AnchorType, string> = {
  TIME: '时间锚点',
  EVENT: '事件锚点',
  LOCATION: '地点锚点',
}

export const behaviorCandidateStatusLabels: Record<BehaviorCandidateStatus, string> = {
  CANDIDATE: '候选行为',
  DESIGNED: '已设计为习惯',
  ARCHIVED: '已归档',
}

export const behaviorSourceTypeLabels: Record<BehaviorSourceType, string> = {
  DIRECTION: '发展方向',
  GOAL: '目标',
  TASK: '任务',
  CUSTOM: '自主添加',
}

export const promptStatusLabels: Record<PromptStatus, string> = {
  UNCLEAR: '不明确',
  PARTIAL: '部分明确',
  CLEAR: '明确',
}

export const learningRecordTypeLabels: Record<LearningRecordType, string> = {
  INPUT: '输入',
  OUTPUT: '输出',
  FEEDBACK: '反馈',
  REFLECTION: '反思',
  RELEARNING: '重学',
  EVIDENCE: '成果',
}

export const sessionStatusLabels: Record<SessionStatus, string> = {
  IN_PROGRESS: '进行中',
  PAUSED: '暂停',
  COMPLETED: '完成',
  INTERRUPTED: '中断',
}

export const masteryLevelLabels: Record<MasteryLevel, string> = {
  L0: 'L0 · 无法回忆',
  L1: 'L1 · 零散回忆',
  L2: 'L2 · 解释核心',
  L3: 'L3 · 独立应用',
  L4: 'L4 · 迁移新问题',
}

export const reviewScheduleStatusLabels: Record<ReviewScheduleStatus, string> = {
  PENDING: '待复习',
  DUE: '已到期',
  COMPLETED: '已完成',
  SKIPPED: '已跳过',
}

export const evidenceTypeLabels: Record<EvidenceType, string> = {
  CODE: '代码',
  REPORT: '实验报告',
  PROJECT: '项目作品',
  PAPER: '论文/文章',
  NOTE: '笔记总结',
  COURSE: '课程作业',
  TEST: '测试结果',
  PRESENTATION: '演讲展示',
}

export const resourceTypeLabels: Record<ResourceType, string> = {
  ANKI: 'Anki',
  OBSIDIAN: 'Obsidian',
  ZOTERO: 'Zotero',
  GITHUB: 'GitHub',
  VSCODE: 'VS Code',
  CALENDAR: '日历',
  CLOUD: '云盘',
  OTHER: '其他',
}

export const reviewTypeLabels: Record<ReviewType, string> = {
  SESSION: '学习复盘',
  DAILY: '每日复盘',
  WEEKLY: '周复盘',
  MONTHLY: '月复盘',
  MILESTONE: '阶段复盘',
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  DRAFT: '草拟',
  COMPLETED: '已完成',
}

export const findingTypeLabels: Record<FindingType, string> = {
  EFFECTIVE: '有效做法',
  PROBLEM: '问题',
  BLIND_SPOT: '盲区',
  INSIGHT: '洞察',
}

export const adjustmentTargetTypeLabels: Record<AdjustmentTargetType, string> = {
  VISION: '愿景',
  IDENTITY: '身份',
  DIRECTION: '发展方向',
  COMPETENCY: '能力',
  MILESTONE: '里程碑',
  GOAL: '目标',
  TASK: '任务',
  HABIT: '习惯',
  LEARNING: '学习',
  REVIEW: '复盘',
  SCHEDULE: '时间预算',
}

export const adjustmentStatusLabels: Record<AdjustmentStatus, string> = {
  PROPOSED: '待确认',
  CONFIRMED: '已确认',
  APPLIED: '已应用',
  REJECTED: '已拒绝',
}

export const notificationTypeLabels: Record<NotificationType, string> = {
  TASK: '任务',
  REVIEW: '复习',
  HABIT: '习惯',
  MILESTONE: '里程碑',
  SYSTEM: '系统',
}

export const notificationStatusLabels: Record<NotificationStatus, string> = {
  PENDING: '待发送',
  SENT: '已发送',
  READ: '已读',
  DISMISSED: '已忽略',
}

export const integrationStatusLabels: Record<IntegrationStatus, string> = {
  DISCONNECTED: '未连接',
  CONNECTED: '已连接',
  DISABLED: '已停用',
}

export const exportStatusLabels: Record<ExportStatus, string> = {
  PENDING: '处理中',
  COMPLETED: '已完成',
  FAILED: '失败',
}

export const exportTypeLabels: Record<ExportType, string> = {
  FULL_JSON: '完整 JSON',
  MARKDOWN: 'Markdown',
}