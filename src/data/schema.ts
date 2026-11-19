import type {
  Adjustment,
  AdjustmentTargetType,
  BehaviorCandidate,
  Competency,
  CompetencyEvidence,
  DataExport,
  Direction,
  DirectionCompetency,
  Evidence,
  ExternalIntegration,
  Goal,
  GoalDirection,
  GoalMilestone,
  Habit,
  HabitLog,
  Identity,
  KnowledgeItem,
  LearningRecord,
  LearningSession,
  Milestone,
  Notification,
  Resource,
  Review,
  ReviewFinding,
  ReviewSchedule,
  SessionKnowledge,
  Task,
  TaskCompetency,
  TaskDependency,
  TaskGoal,
  Timebox,
  UserSettings,
  Vision,
  Workflow,
} from '@/domain'

export const StoreName = {
  VISIONS: 'visions',
  IDENTITIES: 'identities',
  DIRECTIONS: 'directions',
  COMPETENCIES: 'competencies',
  DIRECTION_COMPETENCIES: 'directionCompetencies',
  MILESTONES: 'milestones',
  GOALS: 'goals',
  GOAL_DIRECTIONS: 'goalDirections',
  GOAL_MILESTONES: 'goalMilestones',
  TASKS: 'tasks',
  TASK_GOALS: 'taskGoals',
  TASK_COMPETENCIES: 'taskCompetencies',
  TASK_DEPENDENCIES: 'taskDependencies',
  TIMEBOXES: 'timeboxes',
  HABITS: 'habits',
  HABIT_LOGS: 'habitLogs',
  BEHAVIOR_CANDIDATES: 'behaviorCandidates',
  WORKFLOWS: 'workflows',
  LEARNING_SESSIONS: 'learningSessions',
  LEARNING_RECORDS: 'learningRecords',
  KNOWLEDGE_ITEMS: 'knowledgeItems',
  SESSION_KNOWLEDGE: 'sessionKnowledge',
  REVIEW_SCHEDULES: 'reviewSchedules',
  EVIDENCES: 'evidences',
  COMPETENCY_EVIDENCES: 'competencyEvidences',
  RESOURCES: 'resources',
  REVIEWS: 'reviews',
  REVIEW_FINDINGS: 'reviewFindings',
  ADJUSTMENTS: 'adjustments',
  USER_SETTINGS: 'userSettings',
  NOTIFICATIONS: 'notifications',
  EXTERNAL_INTEGRATIONS: 'externalIntegrations',
  DATA_EXPORTS: 'dataExports',
} as const

export type StoreName = (typeof StoreName)[keyof typeof StoreName]

export interface StoreEntityMap {
  visions: Vision
  identities: Identity
  directions: Direction
  competencies: Competency
  directionCompetencies: DirectionCompetency
  milestones: Milestone
  goals: Goal
  goalDirections: GoalDirection
  goalMilestones: GoalMilestone
  tasks: Task
  taskGoals: TaskGoal
  taskCompetencies: TaskCompetency
  taskDependencies: TaskDependency
  timeboxes: Timebox
  habits: Habit
  habitLogs: HabitLog
  behaviorCandidates: BehaviorCandidate
  workflows: Workflow
  learningSessions: LearningSession
  learningRecords: LearningRecord
  knowledgeItems: KnowledgeItem
  sessionKnowledge: SessionKnowledge
  reviewSchedules: ReviewSchedule
  evidences: Evidence
  competencyEvidences: CompetencyEvidence
  resources: Resource
  reviews: Review
  reviewFindings: ReviewFinding
  adjustments: Adjustment
  userSettings: UserSettings
  notifications: Notification
  externalIntegrations: ExternalIntegration
  dataExports: DataExport
}

export const ALL_STORES = Object.values(StoreName) as StoreName[]

export const CORE_STORES: StoreName[] = [
  StoreName.VISIONS,
  StoreName.IDENTITIES,
  StoreName.DIRECTIONS,
  StoreName.COMPETENCIES,
  StoreName.DIRECTION_COMPETENCIES,
  StoreName.MILESTONES,
  StoreName.GOALS,
  StoreName.TASKS,
  StoreName.TASK_GOALS,
  StoreName.TASK_DEPENDENCIES,
  StoreName.HABITS,
  StoreName.HABIT_LOGS,
  StoreName.WORKFLOWS,
  StoreName.LEARNING_SESSIONS,
  StoreName.LEARNING_RECORDS,
  StoreName.EVIDENCES,
  StoreName.COMPETENCY_EVIDENCES,
  StoreName.REVIEWS,
  StoreName.REVIEW_FINDINGS,
  StoreName.ADJUSTMENTS,
  StoreName.USER_SETTINGS,
]

export const STORE_LABELS: Record<StoreName, string> = {
  visions: '愿景',
  identities: '身份',
  directions: '发展方向',
  competencies: '能力节点',
  directionCompetencies: '方向-能力关系',
  milestones: '里程碑',
  goals: '目标',
  goalDirections: '目标-方向关系',
  goalMilestones: '目标-里程碑关系',
  tasks: '任务',
  taskGoals: '任务-目标关系',
  taskCompetencies: '任务-能力关系',
  taskDependencies: '任务依赖',
  timeboxes: '时间盒',
  habits: '习惯',
  habitLogs: '习惯记录',
  behaviorCandidates: '行为候选',
  workflows: '学习流程',
  learningSessions: '学习会话',
  learningRecords: '学习记录',
  knowledgeItems: '知识点',
  sessionKnowledge: '会话-知识点关系',
  reviewSchedules: '复习计划',
  evidences: '成果证据',
  competencyEvidences: '能力-证据关系',
  resources: '学习资源',
  reviews: '复盘',
  reviewFindings: '复盘发现',
  adjustments: '调整记录',
  userSettings: '用户设置',
  notifications: '通知',
  externalIntegrations: '外部工具',
  dataExports: '备份记录',
}

export type ForeignKeyRule = {
  field: string
  target: StoreName
  nullable?: boolean
  label: string
}

export const FOREIGN_KEYS: Partial<Record<StoreName, ForeignKeyRule[]>> = {
  identities: [{ field: 'visionId', target: StoreName.VISIONS, label: '所属愿景' }],
  directions: [
    { field: 'visionId', target: StoreName.VISIONS, label: '所属愿景' },
    { field: 'identityId', target: StoreName.IDENTITIES, nullable: true, label: '所属身份' },
  ],
  competencies: [
    { field: 'parentId', target: StoreName.COMPETENCIES, nullable: true, label: '父能力' },
  ],
  milestones: [
    { field: 'directionId', target: StoreName.DIRECTIONS, label: '所属方向' },
    { field: 'competencyId', target: StoreName.COMPETENCIES, nullable: true, label: '关联能力' },
  ],
  goals: [
    { field: 'parentGoalId', target: StoreName.GOALS, nullable: true, label: '父目标' },
    { field: 'competencyId', target: StoreName.COMPETENCIES, nullable: true, label: '主能力' },
  ],
  tasks: [
    { field: 'parentTaskId', target: StoreName.TASKS, nullable: true, label: '父任务' },
    { field: 'learningTemplateId', target: StoreName.WORKFLOWS, nullable: true, label: '学习流程' },
  ],
  timeboxes: [{ field: 'taskId', target: StoreName.TASKS, label: '关联任务' }],
  habitLogs: [{ field: 'habitId', target: StoreName.HABITS, label: '关联习惯' }],
  behaviorCandidates: [
    { field: 'directionId', target: StoreName.DIRECTIONS, nullable: true, label: '关联方向' },
    { field: 'habitId', target: StoreName.HABITS, nullable: true, label: '转化后的习惯' },
  ],
  learningSessions: [
    { field: 'taskId', target: StoreName.TASKS, nullable: true, label: '关联任务' },
    { field: 'workflowId', target: StoreName.WORKFLOWS, nullable: true, label: '学习流程' },
  ],
  learningRecords: [
    { field: 'sessionId', target: StoreName.LEARNING_SESSIONS, label: '所属会话' },
    { field: 'taskId', target: StoreName.TASKS, nullable: true, label: '关联任务' },
  ],
  reviewSchedules: [
    { field: 'knowledgeItemId', target: StoreName.KNOWLEDGE_ITEMS, nullable: true, label: '知识点' },
    { field: 'taskId', target: StoreName.TASKS, nullable: true, label: '复习任务' },
  ],
  directionCompetencies: [
    { field: 'directionId', target: StoreName.DIRECTIONS, label: '发展方向' },
    { field: 'competencyId', target: StoreName.COMPETENCIES, label: '能力' },
  ],
  goalDirections: [
    { field: 'goalId', target: StoreName.GOALS, label: '目标' },
    { field: 'directionId', target: StoreName.DIRECTIONS, label: '方向' },
  ],
  goalMilestones: [
    { field: 'goalId', target: StoreName.GOALS, label: '目标' },
    { field: 'milestoneId', target: StoreName.MILESTONES, label: '里程碑' },
  ],
  taskGoals: [
    { field: 'taskId', target: StoreName.TASKS, label: '任务' },
    { field: 'goalId', target: StoreName.GOALS, label: '目标' },
  ],
  taskCompetencies: [
    { field: 'taskId', target: StoreName.TASKS, label: '任务' },
    { field: 'competencyId', target: StoreName.COMPETENCIES, label: '能力' },
  ],
  taskDependencies: [
    { field: 'predecessorTaskId', target: StoreName.TASKS, label: '前置任务' },
    { field: 'successorTaskId', target: StoreName.TASKS, label: '后续任务' },
  ],
  sessionKnowledge: [
    { field: 'sessionId', target: StoreName.LEARNING_SESSIONS, label: '学习会话' },
    { field: 'knowledgeItemId', target: StoreName.KNOWLEDGE_ITEMS, label: '知识点' },
  ],
  competencyEvidences: [
    { field: 'competencyId', target: StoreName.COMPETENCIES, label: '能力' },
    { field: 'evidenceId', target: StoreName.EVIDENCES, label: '成果' },
  ],
  reviewFindings: [{ field: 'reviewId', target: StoreName.REVIEWS, label: '复盘' }],
  adjustments: [{ field: 'reviewId', target: StoreName.REVIEWS, label: '复盘' }],
}

export type AdjustmentTarget = {
  type: AdjustmentTargetType
  store: StoreName
}

export const ADJUSTMENT_TARGET_STORES: Record<AdjustmentTargetType, StoreName> = {
  VISION: StoreName.VISIONS,
  IDENTITY: StoreName.IDENTITIES,
  DIRECTION: StoreName.DIRECTIONS,
  COMPETENCY: StoreName.COMPETENCIES,
  MILESTONE: StoreName.MILESTONES,
  GOAL: StoreName.GOALS,
  TASK: StoreName.TASKS,
  HABIT: StoreName.HABITS,
  LEARNING: StoreName.LEARNING_SESSIONS,
  REVIEW: StoreName.REVIEWS,
  SCHEDULE: StoreName.USER_SETTINGS,
}
