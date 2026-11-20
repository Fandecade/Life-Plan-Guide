import {
  GoalStatus,
  MilestoneStatus,
  ProgressMode,
  TaskStatus,
} from './enums'
import type { Goal, Task } from './planning'
import type { Milestone } from './roadmap'
import type { GoalMilestone, TaskGoal } from './relations'

const CLOSED_TASK_STATUSES = new Set<string>([TaskStatus.COMPLETED, TaskStatus.CANCELLED])
const CLOSED_MILESTONE_STATUSES = new Set<string>([
  MilestoneStatus.COMPLETED,
  MilestoneStatus.CANCELLED,
])

export function isClosedTaskStatus(status: string): boolean {
  return CLOSED_TASK_STATUSES.has(status)
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function goalSubtreeIds(
  goalId: string,
  goals: Goal[],
  options: { includeArchived?: boolean } = {},
): string[] {
  const includeArchived = options.includeArchived ?? false
  const ids: string[] = []
  const queue = [goalId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) continue
    const goal = goals.find((item) => item.id === currentId)
    if (!goal) continue
    if (currentId !== goalId && goal.archivedAt && !includeArchived) continue
    visited.add(currentId)
    ids.push(currentId)
    for (const child of goals) {
      if (child.parentGoalId === currentId) queue.push(child.id)
    }
  }
  return ids
}

export function taskIdsForGoalTree(
  goalId: string,
  goals: Goal[],
  taskGoals: TaskGoal[],
): string[] {
  const goalIds = new Set(goalSubtreeIds(goalId, goals))
  const taskIds = new Set<string>()
  for (const link of taskGoals) {
    if (link.archivedAt || !goalIds.has(link.goalId)) continue
    taskIds.add(link.taskId)
  }
  return [...taskIds]
}

export function computeGoalTaskStats(
  goal: Goal,
  goals: Goal[],
  tasks: Task[],
  taskGoals: TaskGoal[],
): { total: number; done: number } {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  let total = 0
  let done = 0
  for (const taskId of taskIdsForGoalTree(goal.id, goals, taskGoals)) {
    const task = taskMap.get(taskId)
    if (!task || task.archivedAt || task.status === TaskStatus.CANCELLED) continue
    total += 1
    if (task.status === TaskStatus.COMPLETED) done += 1
  }
  return { total, done }
}

export interface GoalProgressInput {
  goal: Goal
  goals: Goal[]
  tasks: Task[]
  taskGoals: TaskGoal[]
  milestones?: Milestone[]
  goalMilestones?: GoalMilestone[]
}

function milestoneProgressForGoal(input: GoalProgressInput): number | null {
  const { goal, goals, milestones, goalMilestones } = input
  if (!milestones || !goalMilestones) return null
  const goalIds = new Set(goalSubtreeIds(goal.id, goals))
  const milestoneIds = new Set(
    goalMilestones
      .filter((link) => !link.archivedAt && goalIds.has(link.goalId))
      .map((link) => link.milestoneId),
  )
  if (milestoneIds.size === 0) return null
  const relevant = milestones.filter(
    (milestone) =>
      milestoneIds.has(milestone.id) &&
      !milestone.archivedAt &&
      !CLOSED_MILESTONE_STATUSES.has(milestone.status),
  )
  if (relevant.length === 0) return 100
  const completed = relevant.filter(
    (milestone) => milestone.status === MilestoneStatus.COMPLETED,
  ).length
  return clampPercent((completed / relevant.length) * 100)
}

export function computeGoalProgress(input: GoalProgressInput): number {
  const { goal, goals, tasks, taskGoals } = input
  if (goal.progressMode === ProgressMode.MANUAL) {
    return clampPercent(goal.manualProgress)
  }
  if (goal.progressMode === ProgressMode.MILESTONE_BASED) {
    const milestoneProgress = milestoneProgressForGoal(input)
    if (milestoneProgress !== null) return milestoneProgress
  }

  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  let totalWeight = 0
  let completedWeight = 0
  for (const taskId of taskIdsForGoalTree(goal.id, goals, taskGoals)) {
    const task = taskMap.get(taskId)
    if (!task || task.archivedAt || task.status === TaskStatus.CANCELLED) continue
    const weight = task.estimatedDuration > 0 ? task.estimatedDuration : 30
    totalWeight += weight
    if (task.status === TaskStatus.COMPLETED) completedWeight += weight
  }
  if (totalWeight === 0) return 0
  return clampPercent((completedWeight / totalWeight) * 100)
}

export function resolveGoalStatusForProgress(
  goal: Goal,
  progress: number,
): Goal['status'] {
  if (goal.progressMode === ProgressMode.MANUAL) return goal.status
  if (progress >= 100 && goal.status === GoalStatus.ACTIVE) return GoalStatus.COMPLETED
  if (progress < 100 && goal.status === GoalStatus.COMPLETED) return GoalStatus.ACTIVE
  return goal.status
}