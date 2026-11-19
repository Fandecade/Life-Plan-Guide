import { computed, ref } from 'vue'
import {
  GoalStatus,
  HabitStatus,
  Priority,
  ProgressMode,
  ReviewScheduleStatus,
  ReviewType,
  TaskStatus,
  TaskType,
  TimeboxStatus,
  taskStatusLabels,
  timeboxStatusLabels,
  type Goal,
  type UserSettings,
} from '@/domain'
import { repos } from '@/data'
import { endOfDay, isSameDay, nowIso, startOfDay, todayKey } from '@/utils/date'

const priorityRank: Record<string, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

const importanceRank: Record<string, number> = {
  CRITICAL: 3,
  IMPORTANT: 2,
  NORMAL: 1,
}

const CLOSED_TASK_STATUSES = new Set<string>([
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
])

export type GrowthRange = 'week' | 'month' | 'quarter'

export interface TodayScheduleItem {
  id: string
  kind: 'timebox' | 'task'
  timeboxId: string | null
  taskId: string
  title: string
  description: string
  start: string | null
  duration: number
  statusLabel: string
  taskType: TaskType | null
  taskStatus: TaskStatus | null
  isCompleted: boolean
}

function rangeStart(range: GrowthRange): Date {
  const start = startOfDay()
  if (range === 'month') {
    start.setDate(1)
    return start
  }
  if (range === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
    return start
  }
  const day = start.getDay() === 0 ? 7 : start.getDay()
  start.setDate(start.getDate() - (day - 1))
  return start
}

function rangeEnd(range: GrowthRange): Date {
  const end = rangeStart(range)
  if (range === 'month') end.setMonth(end.getMonth() + 1)
  else if (range === 'quarter') end.setMonth(end.getMonth() + 3)
  else end.setDate(end.getDate() + 7)
  return end
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return Math.max(0, Math.min(23, hours || 0)) * 60 + Math.max(0, Math.min(59, minutes || 0))
}

export function useDashboard() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const lastLoadedAt = ref<string | null>(null)

  const tasks = ref<Awaited<ReturnType<typeof repos.tasks.list>>>([])
  const habits = ref<Awaited<ReturnType<typeof repos.habits.list>>>([])
  const habitLogs = ref<Awaited<ReturnType<typeof repos.habitLogs.list>>>([])
  const reviewSchedules = ref<Awaited<ReturnType<typeof repos.reviewSchedules.list>>>([])
  const evidences = ref<Awaited<ReturnType<typeof repos.evidences.list>>>([])
  const sessions = ref<Awaited<ReturnType<typeof repos.learningSessions.list>>>([])
  const timeboxes = ref<Awaited<ReturnType<typeof repos.timeboxes.list>>>([])
  const goals = ref<Awaited<ReturnType<typeof repos.goals.list>>>([])
  const knowledgeItems = ref<Awaited<ReturnType<typeof repos.knowledgeItems.list>>>([])
  const taskGoals = ref<Awaited<ReturnType<typeof repos.taskGoals.list>>>([])
  const reviews = ref<Awaited<ReturnType<typeof repos.reviews.list>>>([])
  const settings = ref<UserSettings[]>([])
  const visionCount = ref(0)

  const taskOrder = ref<string[]>([])
  const selectedFocusTaskId = ref('')
  const summaryRange = ref<GrowthRange>('week')

  const knowledgeTitle = (id: string): string =>
    knowledgeItems.value.find((item) => item.id === id)?.title ?? '未知知识点'

  const todayTasks = computed(() => {
    return tasks.value
      .filter((task) => isSameDay(task.scheduledDate) || isSameDay(task.dueDate))
      .sort((left, right) => {
        const leftClosed = CLOSED_TASK_STATUSES.has(left.status) ? 1 : 0
        const rightClosed = CLOSED_TASK_STATUSES.has(right.status) ? 1 : 0
        if (leftClosed !== rightClosed) return leftClosed - rightClosed

        const leftOrder = taskOrder.value.indexOf(left.id)
        const rightOrder = taskOrder.value.indexOf(right.id)
        if (leftOrder !== -1 || rightOrder !== -1) {
          if (leftOrder === -1) return 1
          if (rightOrder === -1) return -1
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
        }

        const leftRank = priorityRank[left.priority as Priority] ?? 0
        const rightRank = priorityRank[right.priority as Priority] ?? 0
        if (leftRank !== rightRank) return rightRank - leftRank
        const leftWeight = importanceRank[left.importance] ?? 0
        const rightWeight = importanceRank[right.importance] ?? 0
        if (leftWeight !== rightWeight) return rightWeight - leftWeight
        const dueCompare = (left.dueDate ?? '').localeCompare(right.dueDate ?? '')
        if (dueCompare !== 0) return dueCompare
        return left.createdAt.localeCompare(right.createdAt)
      })
  })

  const openTodayTasks = computed(() =>
    todayTasks.value.filter((task) => !CLOSED_TASK_STATUSES.has(task.status)),
  )

  const focusTask = computed(() => {
    const selected = openTodayTasks.value.find((task) => task.id === selectedFocusTaskId.value)
    return selected ?? openTodayTasks.value[0] ?? null
  })

  const inProgressTasks = computed(
    () => openTodayTasks.value.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
  )

  const completedTodayTasks = computed(
    () => todayTasks.value.filter((task) => task.status === TaskStatus.COMPLETED).length,
  )

  const todaySchedule = computed<TodayScheduleItem[]>(() => {
    const taskMap = new Map(tasks.value.map((task) => [task.id, task]))
    const todayTimeboxes = timeboxes.value
      .filter(
        (timebox) =>
          isSameDay(timebox.plannedStart) && timebox.status !== TimeboxStatus.SKIPPED,
      )
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart))
    const boxedTaskIds = new Set(todayTimeboxes.map((timebox) => timebox.taskId))

    const entries: TodayScheduleItem[] = todayTimeboxes.map((timebox) => {
      const task = taskMap.get(timebox.taskId)
      const taskStatus = task?.status ?? null
      return {
        id: `timebox-${timebox.id}`,
        kind: 'timebox',
        timeboxId: timebox.id,
        taskId: timebox.taskId,
        title: task?.title ?? '任务已不存在',
        description: task?.description ?? '',
        start: timebox.plannedStart,
        duration: timebox.plannedDuration,
        statusLabel:
          taskStatus && CLOSED_TASK_STATUSES.has(taskStatus)
            ? taskStatusLabels[taskStatus]
            : timeboxStatusLabels[timebox.status],
        taskType: task?.taskType ?? null,
        taskStatus,
        isCompleted: taskStatus === TaskStatus.COMPLETED,
      }
    })

    for (const task of todayTasks.value) {
      if (boxedTaskIds.has(task.id)) continue
      entries.push({
        id: `task-${task.id}`,
        kind: 'task',
        timeboxId: null,
        taskId: task.id,
        title: task.title,
        description: task.description,
        start: null,
        duration: task.estimatedDuration,
        statusLabel: taskStatusLabels[task.status],
        taskType: task.taskType,
        taskStatus: task.status,
        isCompleted: task.status === TaskStatus.COMPLETED,
      })
    }

    return entries.sort((left, right) => {
      if (left.isCompleted !== right.isCompleted) return left.isCompleted ? 1 : -1
      if (left.start && !right.start) return -1
      if (!left.start && right.start) return 1
      if (left.start && right.start) return left.start.localeCompare(right.start)
      const leftOrder = taskOrder.value.indexOf(left.taskId)
      const rightOrder = taskOrder.value.indexOf(right.taskId)
      if (leftOrder !== -1 || rightOrder !== -1) {
        if (leftOrder === -1) return 1
        if (rightOrder === -1) return -1
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
      }
      return left.title.localeCompare(right.title, 'zh-CN')
    })
  })

  const activeHabits = computed(() =>
    habits.value.filter((habit) => habit.status === HabitStatus.ACTIVE),
  )

  const checkedHabitIds = computed(() => {
    const ids = new Set<string>()
    for (const log of habitLogs.value) {
      if (isSameDay(log.occurredAt)) ids.add(log.habitId)
    }
    return ids
  })

  const pendingHabits = computed(() =>
    activeHabits.value.filter((habit) => !checkedHabitIds.value.has(habit.id)),
  )

  const dueReviews = computed(() => {
    const deadline = endOfDay().toISOString()
    return reviewSchedules.value
      .filter(
        (item) =>
          (item.status === ReviewScheduleStatus.PENDING ||
            item.status === ReviewScheduleStatus.DUE) &&
          item.scheduledAt <= deadline,
      )
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
  })

  const recentEvidence = computed(() =>
    [...evidences.value]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 3),
  )

  const todayMinutes = computed(() =>
    sessions.value
      .filter(
        (session) =>
          isSameDay(session.startedAt) && session.status === 'COMPLETED',
      )
      .reduce((total, session) => total + (session.actualDuration ?? 0), 0),
  )

  const activeGoals = computed(() =>
    goals.value.filter((goal) => goal.status === GoalStatus.ACTIVE),
  )

  const upcomingGoals = computed(() =>
    activeGoals.value
      .filter((goal) => goal.dueDate !== null)
      .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))
      .slice(0, 3),
  )

  const activeSession = computed(() => {
    const list = sessions.value
      .filter((session) => session.status === 'IN_PROGRESS')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    return list[0] ?? null
  })

  function goalSubtreeIds(goalId: string): string[] {
    const ids: string[] = []
    const queue = [goalId]
    const visited = new Set<string>()
    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId || visited.has(currentId)) continue
      const goal = goals.value.find((item) => item.id === currentId)
      if (!goal || (currentId !== goalId && goal.archivedAt)) continue
      visited.add(currentId)
      ids.push(currentId)
      for (const child of goals.value) {
        if (child.parentGoalId === currentId) queue.push(child.id)
      }
    }
    return ids
  }

  function progressForGoal(goal: Goal): number {
    if (goal.progressMode === ProgressMode.MANUAL) {
      return Math.max(0, Math.min(100, Math.round(goal.manualProgress)))
    }
    const goalIds = new Set(goalSubtreeIds(goal.id))
    const links = taskGoals.value.filter(
      (row) => goalIds.has(row.goalId) && !row.archivedAt,
    )
    const taskMap = new Map(tasks.value.map((task) => [task.id, task]))
    let total = 0
    let done = 0
    const seenTaskIds = new Set<string>()
    for (const row of links) {
      if (seenTaskIds.has(row.taskId)) continue
      seenTaskIds.add(row.taskId)
      const task = taskMap.get(row.taskId)
      if (!task || task.archivedAt || task.status === TaskStatus.CANCELLED) continue
      const weight = task.estimatedDuration > 0 ? task.estimatedDuration : 30
      total += weight
      if (task.status === TaskStatus.COMPLETED) done += weight
    }
    return total === 0 ? 0 : Math.round((done / total) * 100)
  }

  const goalProgressList = computed(() =>
    activeGoals.value
      .slice()
      .sort((left, right) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999'))
      .slice(0, 3)
      .map((goal) => ({ goal, progress: progressForGoal(goal) })),
  )

  const summaryStats = computed(() => {
    const start = rangeStart(summaryRange.value).getTime()
    const end = rangeEnd(summaryRange.value).getTime()

    const completedTasks = tasks.value.filter((task) => {
      const time = new Date(task.updatedAt).getTime()
      return task.status === TaskStatus.COMPLETED && time >= start && time < end
    }).length

    const habitExecutions = habitLogs.value.filter((log) => {
      const time = new Date(log.occurredAt).getTime()
      return log.tinyCompleted && time >= start && time < end && !log.archivedAt
    }).length

    const learningMinutes = sessions.value
      .filter((session) => {
        const time = new Date(session.startedAt).getTime()
        return session.status === 'COMPLETED' && time >= start && time < end
      })
      .reduce((total, session) => total + session.actualDuration, 0)

    return { completedTasks, habitExecutions, learningMinutes }
  })

  const summaryRangeLabel = computed(() => {
    if (summaryRange.value === 'month') return '本月'
    if (summaryRange.value === 'quarter') return '本季度'
    return '本周'
  })

  const latestReview = computed(() =>
    [...reviews.value]
      .filter((review) => !review.archivedAt)
      .sort((left, right) => right.targetDate.localeCompare(left.targetDate))[0],
  )

  const daysSinceReview = computed(() => {
    if (!latestReview.value) return 999
    return Math.floor(
      (Date.now() - new Date(latestReview.value.targetDate).getTime()) / 86400000,
    )
  })

  const todayReviewDone = computed(() =>
    reviews.value.some(
      (review) =>
        review.reviewType === ReviewType.DAILY && isSameDay(review.targetDate),
    ),
  )

  const needsReview = computed(() => daysSinceReview.value >= 7)

  const checkedHabitsToday = computed(
    () => Math.max(activeHabits.value.length - pendingHabits.value.length, 0),
  )

  const isDatabaseEmpty = computed(
    () => visionCount.value === 0 && tasks.value.length === 0 && habits.value.length === 0,
  )

  const greeting = computed(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  })

  const dateLabel = computed(() =>
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date()),
  )

  function hydrateDashboardPreferences(rows: UserSettings[]): void {
    const day = todayKey()
    const savedOrder = rows.find((row) => row.key === `dashboard.taskOrder.${day}`)?.value
    taskOrder.value = Array.isArray(savedOrder)
      ? savedOrder.filter((value): value is string => typeof value === 'string')
      : []
    const savedFocus = rows.find((row) => row.key === `dashboard.focusTask.${day}`)?.value
    selectedFocusTaskId.value = typeof savedFocus === 'string' ? savedFocus : ''
  }

  async function persistSetting(key: string, value: unknown, description: string): Promise<void> {
    const existing = settings.value.find((row) => row.key === key)
    if (existing) {
      await repos.userSettings.update(existing.id, { value })
    } else {
      await repos.userSettings.create({ key, value, description })
    }
    settings.value = await repos.userSettings.list()
  }

  async function setFocusTask(taskId: string): Promise<void> {
    if (!openTodayTasks.value.some((task) => task.id === taskId)) return
    selectedFocusTaskId.value = taskId
    await persistSetting(
      `dashboard.focusTask.${todayKey()}`,
      taskId,
      'Dashboard 今日重点任务',
    )
  }

  async function setSummaryRange(range: GrowthRange): Promise<void> {
    summaryRange.value = range
  }

  async function persistTaskOrder(next: string[]): Promise<void> {
    taskOrder.value = next
    await persistSetting(
      `dashboard.taskOrder.${todayKey()}`,
      next,
      'Dashboard 今日任务排序',
    )
  }

  async function moveTodayTask(taskId: string, direction: -1 | 1): Promise<void> {
    const unscheduled = todaySchedule.value
      .filter((item) => item.kind === 'task' && !item.isCompleted)
      .map((item) => item.taskId)
    const index = unscheduled.indexOf(taskId)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= unscheduled.length) return
    const next = [...unscheduled]
    ;[next[index], next[target]] = [next[target], next[index]]
    await persistTaskOrder(next)
  }

  async function reorderTodayTask(draggedTaskId: string, targetTaskId: string): Promise<void> {
    if (draggedTaskId === targetTaskId) return
    const unscheduled = todaySchedule.value
      .filter((item) => item.kind === 'task' && !item.isCompleted)
      .map((item) => item.taskId)
    const from = unscheduled.indexOf(draggedTaskId)
    const to = unscheduled.indexOf(targetTaskId)
    if (from < 0 || to < 0) return
    const next = [...unscheduled]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await persistTaskOrder(next)
  }

  async function toggleTaskCompletion(taskId: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === taskId)
    if (!task) throw new Error('任务不存在')
    const nextStatus =
      task.status === TaskStatus.COMPLETED ? TaskStatus.TODO : TaskStatus.COMPLETED
    await repos.tasks.update(taskId, { status: nextStatus })
    await refresh()
  }

  async function saveScheduleTime(
    item: TodayScheduleItem,
    startTime: string,
    durationMinutes: number,
  ): Promise<void> {
    const duration = Math.max(5, Math.round(durationMinutes))
    const date = new Date()
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const plannedStart = new Date(dayStart.getTime() + minutesFromTime(startTime) * 60000)
    const plannedEnd = new Date(plannedStart.getTime() + duration * 60000)

    if (plannedEnd.getDate() !== plannedStart.getDate()) {
      throw new Error('时间盒不能跨到第二天')
    }

    const conflict = timeboxes.value.find((timebox) => {
      if (timebox.id === item.timeboxId) return false
      if (timebox.status === TimeboxStatus.SKIPPED) return false
      if (!isSameDay(timebox.plannedStart)) return false
      const start = new Date(timebox.plannedStart).getTime()
      const end = new Date(timebox.plannedEnd).getTime()
      return plannedStart.getTime() < end && start < plannedEnd.getTime()
    })
    if (conflict) {
      const task = tasks.value.find((row) => row.id === conflict.taskId)
      throw new Error(`与「${task?.title ?? '其他任务'}」的时间盒冲突`)
    }

    if (item.timeboxId) {
      await repos.timeboxes.update(item.timeboxId, {
        plannedStart: plannedStart.toISOString(),
        plannedEnd: plannedEnd.toISOString(),
        plannedDuration: duration,
      })
    } else {
      await repos.timeboxes.create({
        taskId: item.taskId,
        plannedStart: plannedStart.toISOString(),
        plannedEnd: plannedEnd.toISOString(),
        plannedDuration: duration,
        actualStart: null,
        actualEnd: null,
        actualDuration: 0,
        status: TimeboxStatus.PLANNED,
        note: '在今日概览中安排',
      })
    }
    await refresh()
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [
        taskRows,
        habitRows,
        habitLogRows,
        reviewRows,
        evidenceRows,
        sessionRows,
        timeboxRows,
        goalRows,
        knowledgeRows,
        taskGoalRows,
        reviewEntryRows,
        settingRows,
        visionTotal,
      ] = await Promise.all([
        repos.tasks.list(),
        repos.habits.list(),
        repos.habitLogs.list(),
        repos.reviewSchedules.list(),
        repos.evidences.list(),
        repos.learningSessions.list(),
        repos.timeboxes.list(),
        repos.goals.list(),
        repos.knowledgeItems.list(),
        repos.taskGoals.list(),
        repos.reviews.list(),
        repos.userSettings.list(),
        repos.visions.count(),
      ])

      tasks.value = taskRows
      habits.value = habitRows
      habitLogs.value = habitLogRows
      reviewSchedules.value = reviewRows
      evidences.value = evidenceRows
      sessions.value = sessionRows
      timeboxes.value = timeboxRows
      goals.value = goalRows
      knowledgeItems.value = knowledgeRows
      taskGoals.value = taskGoalRows
      reviews.value = reviewEntryRows
      settings.value = settingRows
      visionCount.value = visionTotal
      hydrateDashboardPreferences(settingRows)
      lastLoadedAt.value = nowIso()
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    lastLoadedAt,
    todayTasks,
    openTodayTasks,
    focusTask,
    selectedFocusTaskId,
    inProgressTasks,
    completedTodayTasks,
    todaySchedule,
    activeHabits,
    pendingHabits,
    checkedHabitsToday,
    dueReviews,
    upcomingGoals,
    recentEvidence,
    todayMinutes,
    activeGoals,
    activeSession,
    goalProgressList,
    summaryStats,
    summaryRange,
    summaryRangeLabel,
    latestReview,
    daysSinceReview,
    todayReviewDone,
    needsReview,
    isDatabaseEmpty,
    greeting,
    dateLabel,
    knowledgeTitle,
    refresh,
    setFocusTask,
    setSummaryRange,
    moveTodayTask,
    reorderTodayTask,
    toggleTaskCompletion,
    saveScheduleTime,
  }
}
