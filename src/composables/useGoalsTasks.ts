import { computed, ref } from 'vue'
import {
  GoalStatus,
  ProgressMode,

  TaskStatus,
  type Goal,
  type GoalDirection,
  type GoalMilestone,
  type Milestone,
  type NewEntity,
  type ReviewSchedule,
  type Task,
  type TaskCompetency,
  type TaskDependency,
  type TaskGoal,
  type Timebox,
  type Direction,
  type Competency,
} from '@/domain'
import { repos } from '@/data'
import { addDays, endOfDay, isSameDay, startOfDay } from '@/utils/date'

export type GoalInput = Omit<NewEntity<Goal>, 'id'>
export type TaskInput = Omit<NewEntity<Task>, 'id'>
export type TimeboxInput = Omit<NewEntity<Timebox>, 'id'>
export type GoalsTasksKind = 'goal' | 'task'

export interface TaskNode {
  task: Task
  children: TaskNode[]
}

const CLOSED_STATUSES = new Set<string>([TaskStatus.COMPLETED, TaskStatus.CANCELLED])

const taskStatusRank: Record<string, number> = {
  IN_PROGRESS: 0,
  BLOCKED: 1,
  TODO: 2,
  PAUSED: 3,
  BACKLOG: 4,
  COMPLETED: 5,
  CANCELLED: 6,
}

const priorityRank: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function useGoalsTasks() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const goals = ref<Goal[]>([])
  const tasks = ref<Task[]>([])
  const timeboxes = ref<Timebox[]>([])
  const reviewSchedules = ref<ReviewSchedule[]>([])
  const directions = ref<Direction[]>([])
  const milestones = ref<Milestone[]>([])
  const competencies = ref<Competency[]>([])
  const goalDirections = ref<GoalDirection[]>([])
  const goalMilestones = ref<GoalMilestone[]>([])
  const taskGoals = ref<TaskGoal[]>([])
  const taskCompetencies = ref<TaskCompetency[]>([])
  const taskDependencies = ref<TaskDependency[]>([])
  const includeArchived = ref(false)

  const activeGoals = computed(() =>
    goals.value.filter((goal) => !goal.archivedAt),
  )

  const visibleGoals = computed(() =>
    (includeArchived.value
      ? [...goals.value]
      : goals.value.filter((goal) => !goal.archivedAt)
    ).sort((left, right) => {
      const leftRank = left.status === GoalStatus.ACTIVE ? 0 : 1
      const rightRank = right.status === GoalStatus.ACTIVE ? 0 : 1
      if (leftRank !== rightRank) return rightRank - leftRank
      return (left.dueDate ?? '').localeCompare(right.dueDate ?? '')
    }),
  )

  const visibleTasks = computed(() =>
    includeArchived.value
      ? [...tasks.value]
      : tasks.value.filter((task) => !task.archivedAt),
  )

  const activeRelations = {
    goalDirections: computed(() => goalDirections.value.filter((row) => !row.archivedAt)),
    goalMilestones: computed(() => goalMilestones.value.filter((row) => !row.archivedAt)),
    taskGoals: computed(() => taskGoals.value.filter((row) => !row.archivedAt)),
    taskCompetencies: computed(() => taskCompetencies.value.filter((row) => !row.archivedAt)),
    taskDependencies: computed(() => taskDependencies.value.filter((row) => !row.archivedAt)),
  }

  const goalDirectionIds = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const row of activeRelations.goalDirections.value) {
      if (!map[row.goalId]) map[row.goalId] = []
      map[row.goalId].push(row.directionId)
    }
    return map
  })

  const goalMilestoneIds = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const row of activeRelations.goalMilestones.value) {
      if (!map[row.goalId]) map[row.goalId] = []
      map[row.goalId].push(row.milestoneId)
    }
    return map
  })

  const taskGoalIds = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const row of activeRelations.taskGoals.value) {
      if (!map[row.taskId]) map[row.taskId] = []
      map[row.taskId].push(row.goalId)
    }
    return map
  })

  const taskCompetencyIds = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const row of activeRelations.taskCompetencies.value) {
      if (!map[row.taskId]) map[row.taskId] = []
      map[row.taskId].push(row.competencyId)
    }
    return map
  })

  const predecessorIds = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const row of activeRelations.taskDependencies.value) {
      if (!map[row.successorTaskId]) map[row.successorTaskId] = []
      map[row.successorTaskId].push(row.predecessorTaskId)
    }
    return map
  })

  const taskNameById = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const task of tasks.value) map[task.id] = task.title
    return map
  })

  function goalSubtreeIds(goalId: string): string[] {
    const ids: string[] = []
    const queue = [goalId]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId || visited.has(currentId)) continue
      visited.add(currentId)
      ids.push(currentId)
      for (const goal of goals.value) {
        if (goal.parentGoalId === currentId) queue.push(goal.id)
      }
    }
    return ids
  }

  function taskIdsForGoalTree(goalId: string): string[] {
    const goalIds = new Set(goalSubtreeIds(goalId))
    return Object.entries(taskGoalIds.value)
      .filter(([, linkedGoalIds]) => linkedGoalIds.some((id) => goalIds.has(id)))
      .map(([taskId]) => taskId)
  }

  const goalTaskStats = computed<Record<string, { total: number; done: number }>>(() => {
    const map: Record<string, { total: number; done: number }> = {}
    const taskMap = new Map(tasks.value.map((task) => [task.id, task]))
    for (const goal of goals.value) {
      map[goal.id] = { total: 0, done: 0 }
      for (const taskId of taskIdsForGoalTree(goal.id)) {
        const task = taskMap.get(taskId)
        if (!task || task.archivedAt || task.status === TaskStatus.CANCELLED) continue
        map[goal.id].total += 1
        if (task.status === TaskStatus.COMPLETED) map[goal.id].done += 1
      }
    }
    return map
  })

  const stats = computed(() => {
    const openTasks = visibleTasks.value.filter(
      (task) => !CLOSED_STATUSES.has(task.status),
    )
    const todayTasks = openTasks.filter(
      (task) => isSameDay(task.scheduledDate) || isSameDay(task.dueDate),
    )
    const overdue = openTasks.filter(
      (task) => task.dueDate !== null && new Date(task.dueDate) < startOfDay(),
    )
    const now = new Date()
    const day = now.getDay() === 0 ? 7 : now.getDay()
    const monday = startOfDay(new Date(now))
    monday.setDate(monday.getDate() - (day - 1))
    const nextMonday = new Date(monday)
    nextMonday.setDate(nextMonday.getDate() + 7)
    const weekMinutes = timeboxes.value
      .filter((timebox) => {
        const start = new Date(timebox.plannedStart).getTime()
        return start >= monday.getTime() && start < nextMonday.getTime()
      })
      .reduce((total, timebox) => total + timebox.plannedDuration, 0)

    return {
      activeGoals: activeGoals.value.filter((goal) => goal.status === GoalStatus.ACTIVE).length,
      openTasks: openTasks.length,
      todayTasks: todayTasks.length,
      overdueTasks: overdue.length,
      weekMinutes,
    }
  })

  function progressForGoal(goal: Goal): number {
    if (goal.progressMode === ProgressMode.MANUAL) {
      return clampPercent(goal.manualProgress)
    }

    const ids = taskIdsForGoalTree(goal.id)
    const taskMap = new Map(tasks.value.map((task) => [task.id, task]))
    let totalWeight = 0
    let completedWeight = 0
    for (const id of ids) {
      const task = taskMap.get(id)
      if (!task || task.archivedAt || task.status === TaskStatus.CANCELLED) continue
      const weight = task.estimatedDuration > 0 ? task.estimatedDuration : 30
      totalWeight += weight
      if (task.status === TaskStatus.COMPLETED) completedWeight += weight
    }
    if (totalWeight === 0) return 0
    return clampPercent((completedWeight / totalWeight) * 100)
  }

  function sortTaskNodes(nodes: TaskNode[]): TaskNode[] {
    return nodes
      .sort((left, right) => {
        const leftRank = taskStatusRank[left.task.status] ?? 9
        const rightRank = taskStatusRank[right.task.status] ?? 9
        if (leftRank !== rightRank) return leftRank - rightRank
        const priorityDiff =
          (priorityRank[right.task.priority] ?? 0) - (priorityRank[left.task.priority] ?? 0)
        if (priorityDiff !== 0) return priorityDiff
        return (left.task.dueDate ?? '9999').localeCompare(right.task.dueDate ?? '9999')
      })
      .map((node) => ({ ...node, children: sortTaskNodes(node.children) }))
  }

  function buildTaskTree(goalFilter = 'all', includeCompleted = true): TaskNode[] {
    const nodes = new Map<string, TaskNode>()
    for (const task of visibleTasks.value) {
      nodes.set(task.id, { task, children: [] })
    }

    const roots: TaskNode[] = []
    for (const node of nodes.values()) {
      const parentId = node.task.parentTaskId
      const parent = parentId ? nodes.get(parentId) : undefined
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }

    function prune(list: TaskNode[]): TaskNode[] {
      const result: TaskNode[] = []
      for (const node of list) {
        const children = prune(node.children)
        const isClosed = CLOSED_STATUSES.has(node.task.status)
        const statusVisible = includeCompleted || !isClosed
        const goalMatch =
          goalFilter === 'all' ||
          (taskGoalIds.value[node.task.id] ?? []).includes(goalFilter)
        if ((statusVisible && goalMatch) || children.length > 0) {
          result.push({ task: node.task, children })
        }
      }
      return result
    }

    return sortTaskNodes(prune(roots))
  }

  function keywordsForTask(taskId: string): {
    goalIds: string[]
    competencyIds: string[]
    predecessorIds: string[]
  } {
    return {
      goalIds: taskGoalIds.value[taskId] ?? [],
      competencyIds: taskCompetencyIds.value[taskId] ?? [],
      predecessorIds: predecessorIds.value[taskId] ?? [],
    }
  }

  function taskDescendants(taskId: string): string[] {
    const children = tasks.value.filter((task) => task.parentTaskId === taskId)
    const ids: string[] = []
    for (const child of children) ids.push(child.id, ...taskDescendants(child.id))
    return ids
  }

  function incompleteChildren(taskId: string): Task[] {
    return tasks.value.filter(
      (task) => task.parentTaskId === taskId && !CLOSED_STATUSES.has(task.status),
    )
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [
        goalRows,
        taskRows,
        timeboxRows,
        reviewScheduleRows,
        directionRows,
        milestoneRows,
        competencyRows,
        goalDirectionRows,
        goalMilestoneRows,
        taskGoalRows,
        taskCompetencyRows,
        dependencyRows,
      ] = await Promise.all([
        repos.goals.list({ includeArchived: true }),
        repos.tasks.list({ includeArchived: true }),
        repos.timeboxes.list({ includeArchived: true }),
        repos.reviewSchedules.list({ includeArchived: true }),
        repos.directions.list({ includeArchived: true }),
        repos.milestones.list({ includeArchived: true }),
        repos.competencies.list({ includeArchived: true }),
        repos.goalDirections.list({ includeArchived: true }),
        repos.goalMilestones.list({ includeArchived: true }),
        repos.taskGoals.list({ includeArchived: true }),
        repos.taskCompetencies.list({ includeArchived: true }),
        repos.taskDependencies.list({ includeArchived: true }),
      ])
      goals.value = goalRows
      tasks.value = taskRows
      timeboxes.value = timeboxRows
      reviewSchedules.value = reviewScheduleRows
      directions.value = directionRows
      milestones.value = milestoneRows
      competencies.value = competencyRows
      goalDirections.value = goalDirectionRows
      goalMilestones.value = goalMilestoneRows
      taskGoals.value = taskGoalRows
      taskCompetencies.value = taskCompetencyRows
      taskDependencies.value = dependencyRows
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveGoal(
    input: GoalInput,
    id?: string,
  ): Promise<Goal> {
    const entity = id
      ? await repos.goals.update(id, input)
      : await repos.goals.create(input)

    await refresh()
    return entity
  }

  async function saveTask(
    input: TaskInput,
    goalIds: string[],
    competencyIds: string[],
    id?: string,
  ): Promise<Task> {
    const entity = id
      ? await repos.tasks.update(id, input)
      : await repos.tasks.create(input)

    const existingGoals = activeRelations.taskGoals.value.filter(
      (row) => row.taskId === entity.id,
    )
    for (const row of existingGoals) {
      if (!goalIds.includes(row.goalId)) await repos.taskGoals.remove(row.id)
    }
    for (const goalId of goalIds) {
      if (!existingGoals.some((row) => row.goalId === goalId)) {
        await repos.taskGoals.create({ taskId: entity.id, goalId })
      }
    }

    const existingCompetencies = activeRelations.taskCompetencies.value.filter(
      (row) => row.taskId === entity.id,
    )
    for (const row of existingCompetencies) {
      if (!competencyIds.includes(row.competencyId)) {
        await repos.taskCompetencies.remove(row.id)
      }
    }
    for (const competencyId of competencyIds) {
      if (!existingCompetencies.some((row) => row.competencyId === competencyId)) {
        await repos.taskCompetencies.create({ taskId: entity.id, competencyId })
      }
    }

    await refresh()
    return entity
  }

  async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await repos.tasks.update(id, { status })
    await refresh()
  }

  async function saveDependencies(taskId: string, predecessorTaskIds: string[]): Promise<void> {
    if (predecessorTaskIds.includes(taskId)) {
      throw new Error('任务不能依赖自己')
    }

    const edges = new Map<string, string[]>()
    for (const row of activeRelations.taskDependencies.value) {
      if (row.successorTaskId === taskId) continue
      if (!edges.has(row.predecessorTaskId)) edges.set(row.predecessorTaskId, [])
      edges.get(row.predecessorTaskId)?.push(row.successorTaskId)
    }

    function hasPath(from: string, to: string, visited = new Set<string>()): boolean {
      if (from === to) return true
      if (visited.has(from)) return false
      visited.add(from)
      for (const next of edges.get(from) ?? []) {
        if (hasPath(next, to, visited)) return true
      }
      return false
    }

    for (const predecessorId of predecessorTaskIds) {
      if (hasPath(taskId, predecessorId)) {
        throw new Error('保存后会形成任务依赖环路，请调整前置任务')
      }
    }

    const existing = activeRelations.taskDependencies.value.filter(
      (row) => row.successorTaskId === taskId,
    )
    for (const row of existing) await repos.taskDependencies.remove(row.id)
    for (const predecessorTaskId of predecessorTaskIds) {
      await repos.taskDependencies.create({
        predecessorTaskId,
        successorTaskId: taskId,
        dependencyType: 'FINISH_TO_START',
      })
    }
    await refresh()
  }

  async function syncTaskActualDuration(taskId: string): Promise<void> {
    const rows = await repos.timeboxes.list({ includeArchived: true })
    const total = rows
      .filter((row) => row.taskId === taskId && row.status === 'COMPLETED')
      .reduce((sum, row) => sum + row.actualDuration, 0)
    const task = await repos.tasks.get(taskId)
    if (task && task.actualDuration !== total) {
      await repos.tasks.update(taskId, { actualDuration: total })
    }
  }

  async function saveTimebox(input: TimeboxInput, id?: string): Promise<Timebox> {
    const duration = assertNoTimeboxConflict(
      input.plannedStart,
      input.plannedEnd,
      id,
    )
    if (duration <= 0) throw new Error('时间盒时长必须大于 0')

    const completed = input.status === 'COMPLETED'
    const payload = {
      ...input,
      plannedDuration: duration,
      actualStart: completed ? input.plannedStart : null,
      actualEnd: completed ? input.plannedEnd : null,
      actualDuration: completed ? duration : 0,
    }

    const entity = id
      ? await repos.timeboxes.update(id, payload)
      : await repos.timeboxes.create(payload)
    await syncTaskActualDuration(entity.taskId)
    await refresh()
    return entity
  }

  function assertNoTimeboxConflict(
    plannedStart: string,
    plannedEnd: string,
    excludeId?: string,
  ): number {
    const start = new Date(plannedStart).getTime()
    const end = new Date(plannedEnd).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      throw new Error('结束时间必须晚于开始时间')
    }
    const conflict = timeboxes.value.find((row) => {
      if (row.id === excludeId || row.status === 'SKIPPED') return false
      const otherStart = new Date(row.plannedStart).getTime()
      const otherEnd = new Date(row.plannedEnd).getTime()
      return start < otherEnd && otherStart < end
    })
    if (conflict) {
      const name = taskNameById.value[conflict.taskId] ?? '其他任务'
      throw new Error(`与「${name}」的时间盒存在时间冲突，请先调整时间`)
    }
    return Math.round((end - start) / 60000)
  }

  async function resizeTimebox(id: string, deltaMinutes: number): Promise<void> {
    const row = timeboxes.value.find((timebox) => timebox.id === id)
    if (!row) throw new Error('时间盒不存在')
    if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return

    const plannedEnd = new Date(
      new Date(row.plannedEnd).getTime() + deltaMinutes * 60000,
    ).toISOString()
    const definedDuration = assertNoTimeboxConflict(row.plannedStart, plannedEnd, id)
    if (definedDuration <= 0) throw new Error('时间盒时长必须大于 0')
    const nextDuration = Math.round(
      (new Date(plannedEnd).getTime() - new Date(row.plannedStart).getTime()) / 60000,
    )
    const completed = row.status === 'COMPLETED'
    const actualStart = completed ? row.actualStart ?? row.plannedStart : row.actualStart
    const actualEnd = completed
      ? new Date(new Date(actualStart ?? row.plannedStart).getTime() + nextDuration * 60000).toISOString()
      : row.actualEnd
    await repos.timeboxes.update(id, {
      plannedEnd,
      plannedDuration: nextDuration,
      actualStart,
      actualEnd,
      actualDuration: completed ? nextDuration : row.actualDuration,
    })
    await syncTaskActualDuration(row.taskId)
    await refresh()
  }

  async function deleteTimebox(id: string): Promise<void> {
    const row = timeboxes.value.find((timebox) => timebox.id === id)
    if (!row) return
    await repos.timeboxes.remove(id)
    await syncTaskActualDuration(row.taskId)
    await refresh()
  }

  async function setArchived(kind: GoalsTasksKind, id: string, archived: boolean): Promise<void> {
    if (kind === 'goal') {
      archived ? await repos.goals.archive(id) : await repos.goals.restore(id)
    } else {
      archived ? await repos.tasks.archive(id) : await repos.tasks.restore(id)
    }
    await refresh()
  }

  function goalDescendants(goalId: string): string[] {
    const children = goals.value.filter((goal) => goal.parentGoalId === goalId)
    const ids: string[] = []
    for (const child of children) {
      ids.push(child.id, ...goalDescendants(child.id))
    }
    return ids
  }

  async function setGoalParent(goalId: string, parentId: string | null): Promise<void> {
    if (parentId) {
      if (parentId === goalId || goalDescendants(goalId).includes(parentId)) {
        throw new Error('不能把目标移动到自身或自己的子目标下')
      }
    }
    await repos.goals.update(goalId, { parentGoalId: parentId })
    await refresh()
  }

  async function setTaskQuadrant(
    id: string,
    importance: Task['importance'],
    urgency: Task['urgency'],
  ): Promise<void> {
    await repos.tasks.update(id, { importance, urgency })
    await refresh()
  }

  async function moveTimeboxToDate(id: string, targetDateKey: string): Promise<void> {
    const row = timeboxes.value.find((timebox) => timebox.id === id)
    if (!row) throw new Error('时间盒不存在')
    const target = new Date(`${targetDateKey}T12:00:00`)
    if (Number.isNaN(target.getTime())) throw new Error('目标日期无效')
    const current = new Date(row.plannedStart)
    const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate())
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    const deltaDays = Math.round(
      (targetDay.getTime() - currentDay.getTime()) / 86400000,
    )
    if (deltaDays === 0) return

    const plannedStart = addDays(row.plannedStart, deltaDays)
    const plannedEnd = addDays(row.plannedEnd, deltaDays)
    assertNoTimeboxConflict(plannedStart, plannedEnd, id)
    await repos.timeboxes.update(id, { plannedStart, plannedEnd })
    await refresh()
  }

  function tasksForGoal(goalId: string): Task[] {
    return tasks.value
      .filter(
        (task) =>
          !task.archivedAt && (taskGoalIds.value[task.id] ?? []).includes(goalId),
      )
      .sort((left, right) => {
        const leftRank = taskStatusRank[left.status] ?? 9
        const rightRank = taskStatusRank[right.status] ?? 9
        return leftRank - rightRank
      })
  }

  function tasksForGoalTree(goalId: string): Task[] {
    const goalIds = new Set([goalId, ...goalDescendants(goalId)])
    return tasks.value
      .filter(
        (task) =>
          !task.archivedAt &&
          (taskGoalIds.value[task.id] ?? []).some((id) => goalIds.has(id)),
      )
      .sort((left, right) => {
        const leftRank = taskStatusRank[left.status] ?? 9
        const rightRank = taskStatusRank[right.status] ?? 9
        return leftRank - rightRank
      })
  }

  function timeboxesForTask(taskId: string): Timebox[] {
    return timeboxes.value
      .filter((timebox) => timebox.taskId === taskId)
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart))
  }

  return {
    loading,
    error,
    goals,
    tasks,
    timeboxes,
    reviewSchedules,
    directions,
    milestones,
    competencies,
    activeGoals,
    visibleGoals,
    visibleTasks,
    goalDirectionIds,
    goalMilestoneIds,
    taskGoalIds,
    taskCompetencyIds,
    predecessorIds,
    taskNameById,
    goalTaskStats,
    stats,
    includeArchived,
    progressForGoal,
    buildTaskTree,
    keywordsForTask,
    taskDescendants,
    incompleteChildren,
    timeboxesForTask,
    tasksForGoal,
    tasksForGoalTree,
    goalDescendants,
    refresh,
    saveGoal,
    saveTask,
    setTaskStatus,
    setTaskQuadrant,
    setGoalParent,
    moveTimeboxToDate,
    saveDependencies,
    saveTimebox,
    resizeTimebox,
    deleteTimebox,
    setArchived,
    endOfDay,
  }
}
