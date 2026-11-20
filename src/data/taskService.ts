import {
  EvidenceType,
  ProgressMode,
  TaskStatus,
  TimeboxStatus,
  computeGoalProgress,
  goalSubtreeIds,
  resolveGoalStatusForProgress,
  type CompetencyLevel,
  type Goal,
  type Task,
  type Timebox,
} from '@/domain'
import { nowIso } from '@/utils/date'
import { repos } from './index'
import { emitDataChange } from './events'

export interface TaskStatusChangeOptions {
  cascade?: boolean
  collectEvidence?: boolean
}

export interface TaskStatusChangeResult {
  task: Task
  autoCompletedGoals: Goal[]
  autoReopenedGoals: Goal[]
  evidenceCount: number
  skippedTimeboxes: number
}

function isClosingStatus(status: string): boolean {
  return status === TaskStatus.COMPLETED || status === TaskStatus.CANCELLED
}

function affectedGoalIds(
  directGoalIds: string[],
  goals: Goal[],
): string[] {
  const result = new Set<string>()
  for (const goalId of directGoalIds) {
    let current = goals.find((goal) => goal.id === goalId)
    while (current) {
      result.add(current.id)
      current = current.parentGoalId
        ? goals.find((goal) => goal.id === current?.parentGoalId)
        : undefined
    }
  }
  return [...result]
}

async function reconcileGoals(goalIds: string[]): Promise<{
  completed: Goal[]
  reopened: Goal[]
}> {
  const completed: Goal[] = []
  const reopened: Goal[] = []
  if (goalIds.length === 0) return { completed, reopened }

  const [goals, tasks, taskGoals, milestones, goalMilestones] = await Promise.all([
    repos.goals.list({ includeArchived: true }),
    repos.tasks.list({ includeArchived: true }),
    repos.taskGoals.list({ includeArchived: true }),
    repos.milestones.list({ includeArchived: true }),
    repos.goalMilestones.list({ includeArchived: true }),
  ])

  const targets = new Set(goalIds)
  for (const goal of goals) {
    if (!targets.has(goal.id) || goal.archivedAt) continue
    if (goal.progressMode === ProgressMode.MANUAL) continue
    const progress = computeGoalProgress({
      goal,
      goals,
      tasks,
      taskGoals,
      milestones,
      goalMilestones,
    })
    const nextStatus = resolveGoalStatusForProgress(goal, progress)
    if (nextStatus === goal.status) continue
    const updated = await repos.goals.update(goal.id, { status: nextStatus })
    if (nextStatus === 'COMPLETED') completed.push(updated)
    else reopened.push(updated)
  }
  return { completed, reopened }
}

async function skipOpenTimeboxesForTask(
  taskId: string,
  closingStatus: TaskStatus,
): Promise<number> {
  const rows = await repos.timeboxes.list({ includeArchived: true })
  let skipped = 0
  for (const row of rows) {
    if (row.taskId !== taskId || row.archivedAt) continue
    if (row.status === TimeboxStatus.COMPLETED) continue
    if (row.status === TimeboxStatus.SKIPPED) continue
    if (closingStatus === TaskStatus.COMPLETED && row.kind === 'REVIEW') continue
    await repos.timeboxes.update(row.id, { status: TimeboxStatus.SKIPPED })
    skipped += 1
  }
  return skipped
}

export async function syncTaskActualDuration(taskId: string | null): Promise<number> {
  if (!taskId) return 0
  const rows = await repos.timeboxes.list({ includeArchived: true })
  const total = rows
    .filter(
      (row: Timebox) =>
        row.taskId === taskId &&
        !row.archivedAt &&
        row.kind !== 'REVIEW' &&
        row.status === TimeboxStatus.COMPLETED,
    )
    .reduce((sum, row) => sum + row.actualDuration, 0)
  const task = await repos.tasks.get(taskId)
  if (task && task.actualDuration !== total) {
    await repos.tasks.update(taskId, { actualDuration: total })
  }
  return total
}

async function captureTaskEvidence(task: Task): Promise<number> {
  const existingEvidence = (await repos.evidences.list({ includeArchived: true })).find(
    (evidence) => evidence.taskId === task.id,
  )
  if (existingEvidence) return 0

  const links = await repos.taskCompetencies.list({ includeArchived: true })
  const competencyIds = [
    ...new Set(
      links
        .filter((link) => link.taskId === task.id && !link.archivedAt)
        .map((link) => link.competencyId),
    ),
  ]
  if (competencyIds.length === 0) return 0

  const competencyRows = await repos.competencies.list({ includeArchived: true })
  const assessedAt = task.completedAt ?? nowIso()
  const evidence = await repos.evidences.create({
    title: task.title,
    description: task.completionCriteria || task.description,
    evidenceType: EvidenceType.NOTE,
    fileUrl: '',
    externalUrl: '',
    qualityNote: '完成任务时自动沉淀',
    taskId: task.id,
  })

  let created = 0
  for (const competencyId of competencyIds) {
    const competency = competencyRows.find((row) => row.id === competencyId)
    if (!competency) continue
    await repos.competencyEvidences.create({
      competencyId,
      evidenceId: evidence.id,
      assessedLevel: competency.currentLevel as CompetencyLevel,
      assessmentNote: `完成任务「${task.title}」`,
      assessedAt,
    })
    created += 1
  }
  return created
}

export async function changeTaskStatus(
  taskId: string,
  status: TaskStatus,
  options: TaskStatusChangeOptions = {},
): Promise<TaskStatusChangeResult> {
  const current = await repos.tasks.get(taskId)
  if (!current) throw new Error(`任务不存在：${taskId}`)

  const patch: { status: TaskStatus; completedAt: string | null } = {
    status,
    completedAt: status === TaskStatus.COMPLETED ? current.completedAt ?? nowIso() : null,
  }
  const task = await repos.tasks.update(taskId, patch)

  const cascade = options.cascade !== false
  let evidenceCount = 0
  let skippedTimeboxes = 0
  let autoCompletedGoals: Goal[] = []
  let autoReopenedGoals: Goal[] = []

  if (cascade) {
    if (isClosingStatus(status)) {
      skippedTimeboxes = await skipOpenTimeboxesForTask(taskId, status)
      await syncTaskActualDuration(taskId)
    }

    if (status === TaskStatus.COMPLETED && options.collectEvidence !== false) {
      evidenceCount = await captureTaskEvidence(task)
    }

    const taskGoalLinks = await repos.taskGoals.list({ includeArchived: true })
    const directGoalIds = taskGoalLinks
      .filter((link) => link.taskId === taskId && !link.archivedAt)
      .map((link) => link.goalId)
    if (directGoalIds.length > 0) {
      const goals = await repos.goals.list({ includeArchived: true })
      const reconciled = await reconcileGoals(affectedGoalIds(directGoalIds, goals))
      autoCompletedGoals = reconciled.completed
      autoReopenedGoals = reconciled.reopened
    }
  }

  emitDataChange('task', 'goal', 'timebox', 'evidence', 'competency')
  return {
    task,
    autoCompletedGoals,
    autoReopenedGoals,
    evidenceCount,
    skippedTimeboxes,
  }
}

export async function reorderTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<TaskStatusChangeResult> {
  return changeTaskStatus(taskId, status)
}

export { goalSubtreeIds }