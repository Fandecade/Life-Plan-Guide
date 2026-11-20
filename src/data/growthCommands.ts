import {
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  GoalStatus,
  GoalType,
  Importance,
  Priority,
  ProgressMode,
  TaskStatus,
  TaskType,
  TimeboxKind,
  TimeboxStatus,
  Urgency,
  type Competency,
  type Goal,
  type Identity,
  type Task,
  type TaskGoal,
  type Timebox,
} from '@/domain'
import type { GrowthDatabase } from './db'
import { buildBaseEntity } from './repository'

export interface CreateIdentityInput {
  id?: string
  title: string
  identityStatement: string
  description?: string
  visionId?: string | null
}

export interface CreateCompetencyInput {
  id?: string
  identityId: string
  parentId?: string | null
  name: string
  description?: string
  category?: Competency['category']
  weight?: number
  targetLevel?: Competency['targetLevel']
  currentLevel?: Competency['currentLevel']
  assessmentCriteria?: string
  status?: Competency['status']
}

export type CreateRootCompetencyInput = Omit<CreateCompetencyInput, 'parentId'>
export type CreateChildCompetencyInput = CreateCompetencyInput & { parentId: string }

export interface CreateStageOutcomeInput {
  id?: string
  competencyId: string
  title: string
  successCriteria: string
  description?: string
  startDate?: string | null
  dueDate?: string | null
  priority?: Goal['priority']
  status?: Goal['status']
}

export interface CreateTaskInput {
  id?: string
  stageOutcomeId: string
  title: string
  description?: string
  taskType?: Task['taskType']
  startDate?: string | null
  dueDate?: string | null
  scheduledDate?: string | null
  estimatedDuration?: number
  priority?: Task['priority']
  importance?: Task['importance']
  urgency?: Task['urgency']
  status?: Task['status']
  completionCriteria?: string
  parentTaskId?: string | null
  learningTemplateId?: string | null
}

export interface CreateTimeboxInput {
  id?: string
  taskId?: string | null
  plannedStart: string
  plannedEnd: string
  kind?: Timebox['kind']
  status?: Timebox['status']
  note?: string
  actualStart?: string | null
  actualEnd?: string | null
  actualDuration?: number
  reviewScheduleId?: string | null
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field}不能为空`)
  return trimmed
}

function isActive(row: { archivedAt: string | null; deletedAt: string | null }): boolean {
  return !row.archivedAt && !row.deletedAt
}

async function requireActiveIdentity(
  db: GrowthDatabase,
  identityId: string,
): Promise<Identity> {
  const identity = await db.identities.get(identityId)
  if (!identity || !isActive(identity)) throw new Error('身份不存在或已归档')
  return identity
}

async function requireActiveCompetency(
  db: GrowthDatabase,
  competencyId: string,
): Promise<Competency> {
  const competency = await db.competencies.get(competencyId)
  if (!competency || !isActive(competency)) throw new Error('能力不存在或已归档')
  return competency
}

async function requireActiveStageOutcome(
  db: GrowthDatabase,
  stageOutcomeId: string,
): Promise<Goal> {
  const outcome = await db.goals.get(stageOutcomeId)
  if (!outcome || !isActive(outcome) || outcome.status === GoalStatus.CANCELLED) {
    throw new Error('阶段成果不存在、已归档或已取消')
  }
  return outcome
}

function positiveWeight(weight: number | undefined): number {
  if (weight === undefined) return 1
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error('能力权重必须是大于 0 的数字')
  }
  return weight
}

function validTimeRange(plannedStart: string, plannedEnd: string): number {
  const start = new Date(plannedStart).getTime()
  const end = new Date(plannedEnd).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    throw new Error('时间块结束时间必须晚于开始时间')
  }
  return Math.round((end - start) / 60000)
}

export function createGrowthCommands(db: GrowthDatabase) {
  async function createIdentity(input: CreateIdentityInput): Promise<Identity> {
    const entity: Identity = {
      ...buildBaseEntity(input.id),
      visionId: input.visionId ?? null,
      title: requireText(input.title, '身份名称'),
      description: input.description?.trim() ?? '',
      identityStatement: requireText(input.identityStatement, '身份愿景'),
    }
    await db.identities.add(entity)
    return entity
  }

  async function createCompetency(input: CreateCompetencyInput): Promise<Competency> {
    const identity = await requireActiveIdentity(db, input.identityId)
    let parent: Competency | null = null
    if (input.parentId) {
      parent = await requireActiveCompetency(db, input.parentId)
      if (parent.identityId !== identity.id) {
        throw new Error('子能力必须与父能力属于同一身份')
      }
    }
    const entity: Competency = {
      ...buildBaseEntity(input.id),
      identityId: identity.id,
      parentId: parent?.id ?? null,
      name: requireText(input.name, '能力名称'),
      description: input.description?.trim() ?? '',
      category: input.category ?? CompetencyCategory.KNOWLEDGE,
      weight: positiveWeight(input.weight),
      targetLevel: input.targetLevel ?? CompetencyLevel.L3,
      currentLevel: input.currentLevel ?? CompetencyLevel.L0,
      assessmentCriteria: input.assessmentCriteria?.trim() ?? '',
      status: input.status ?? CompetencyStatus.NOT_STARTED,
    }
    await db.competencies.add(entity)
    return entity
  }

  async function createRootCompetency(
    input: CreateRootCompetencyInput,
  ): Promise<Competency> {
    return createCompetency({ ...input, parentId: null })
  }

  async function createChildCompetency(
    input: CreateChildCompetencyInput,
  ): Promise<Competency> {
    return createCompetency(input)
  }

  async function createStageOutcome(input: CreateStageOutcomeInput): Promise<Goal> {
    const competency = await requireActiveCompetency(db, input.competencyId)
    const activeChildren = await db.competencies
      .where('parentId')
      .equals(competency.id)
      .filter((row) => isActive(row))
      .count()
    if (activeChildren > 0) {
      throw new Error('阶段成果只能挂载在叶子能力上，请先选择或创建子能力')
    }

    const entity: Goal = {
      ...buildBaseEntity(input.id),
      title: requireText(input.title, '阶段成果名称'),
      description: input.description?.trim() ?? '',
      goalType: GoalType.OUTCOME,
      parentGoalId: null,
      competencyId: competency.id,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? Priority.MEDIUM,
      successCriteria: requireText(input.successCriteria, '验收标准'),
      status: input.status ?? GoalStatus.ACTIVE,
      progressMode: ProgressMode.TASK_BASED,
      manualProgress: 0,
      reviewFrequency: '每周',
    }
    await db.goals.add(entity)
    return entity
  }

  async function createTask(input: CreateTaskInput): Promise<Task> {
    const outcome = await requireActiveStageOutcome(db, input.stageOutcomeId)
    if (!outcome.competencyId) throw new Error('阶段成果尚未挂载能力')
    const competency = await requireActiveCompetency(db, outcome.competencyId)
    const activeChildren = await db.competencies
      .where('parentId')
      .equals(competency.id)
      .filter((row) => isActive(row))
      .count()
    if (activeChildren > 0) throw new Error('阶段成果必须挂载在叶子能力上')

    const entity: Task = {
      ...buildBaseEntity(input.id),
      stageOutcomeId: outcome.id,
      title: requireText(input.title, '任务名称'),
      description: input.description?.trim() ?? '',
      taskType: input.taskType ?? TaskType.LEARNING,
      parentTaskId: input.parentTaskId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      scheduledDate: input.scheduledDate ?? null,
      estimatedDuration: Math.max(0, Number(input.estimatedDuration) || 0),
      actualDuration: 0,
      priority: input.priority ?? Priority.MEDIUM,
      importance: input.importance ?? Importance.NORMAL,
      urgency: input.urgency ?? Urgency.MEDIUM,
      status: input.status ?? TaskStatus.TODO,
      completionCriteria: input.completionCriteria?.trim() ?? '',
      learningTemplateId: input.learningTemplateId ?? null,
      completedAt: input.status === TaskStatus.COMPLETED ? new Date().toISOString() : null,
    }
    const link: TaskGoal = {
      ...buildBaseEntity(),
      taskId: entity.id,
      goalId: outcome.id,
    }
    await db.transaction('rw', [db.tasks, db.taskGoals], async () => {
      await db.tasks.add(entity)
      await db.taskGoals.add(link)
    })
    return entity
  }

  async function createTimebox(input: CreateTimeboxInput): Promise<Timebox> {
    const taskId = input.taskId ?? null
    const task = taskId ? await db.tasks.get(taskId) : null
    if (taskId && (!task || !isActive(task))) throw new Error('关联任务不存在或已归档')
    const kind = input.kind ?? (taskId ? TimeboxKind.TASK : TimeboxKind.FOCUS)
    if (!taskId && kind !== TimeboxKind.FOCUS && kind !== TimeboxKind.BREAK) {
      throw new Error('无任务时间块只能是自由专注或休息')
    }
    const plannedDuration = validTimeRange(input.plannedStart, input.plannedEnd)
    const status = input.status ?? TimeboxStatus.PLANNED
    const completed = status === TimeboxStatus.COMPLETED
    const entity: Timebox = {
      ...buildBaseEntity(input.id),
      taskId,
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      plannedDuration,
      actualStart: input.actualStart ?? (completed ? input.plannedStart : null),
      actualEnd: input.actualEnd ?? (completed ? input.plannedEnd : null),
      actualDuration: completed ? input.actualDuration ?? plannedDuration : input.actualDuration ?? 0,
      status,
      note: input.note?.trim() ?? '',
      kind,
      reviewScheduleId: input.reviewScheduleId ?? null,
    }
    await db.timeboxes.add(entity)
    return entity
  }

  return {
    createIdentity,
    createCompetency,
    createRootCompetency,
    createChildCompetency,
    createStageOutcome,
    createTask,
    createTimebox,
  }
}

export type GrowthCommands = ReturnType<typeof createGrowthCommands>
