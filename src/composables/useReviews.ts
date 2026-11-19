import { computed, ref } from 'vue'
import {
  AdjustmentStatus,
  FindingType,
  MilestoneStatus,
  TaskStatus,
  type Adjustment,
  type AdjustmentTargetType,
  type Direction,
  type Goal,
  type Competency,
  type CompetencyEvidence,
  type Evidence,
  type GoalDirection,
  type GoalMilestone,
  type Habit,
  type HabitLog,
  type LearningRecord,
  type LearningRecordType,
  type LearningSession,
  type Milestone,
  type NewEntity,
  type Review,
  type ReviewFinding,
  type ReviewSchedule,
  type Task,
  type TaskGoal,
  type Timebox,
} from '@/domain'
import { repos } from '@/data'
import { startOfDay, toDateInput, todayKey } from '@/utils/date'

export type ReviewInput = Omit<NewEntity<Review>, 'id'>
export type AdjustmentInput = Omit<NewEntity<Adjustment>, 'id'>

export interface FindingInput {
  id?: string
  findingType: FindingType
  description: string
  rootCause: string
  proposedAction: string
}

export interface ReviewInsightStats {
  reviewsWeek: number
  completedTasksWeek: number
  habitWeek: number
  learningMinutesWeek: number
}

export interface TrendPoint {
  key: string
  label: string
  taskCount: number
  habitCount: number
  learningMinutes: number
}

export interface AdjustmentFieldMeta {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select'
}

export interface ReviewContext {
  startKey: string
  endKey: string
  tasks: Task[]
  completedTasks: Task[]
  incompleteTasks: Task[]
  sessions: LearningSession[]
  learningRecords: LearningRecord[]
  habitLogs: HabitLog[]
  evidences: Evidence[]
  timeboxes: Timebox[]
  plannedMinutes: number
  recordedMinutes: number
  learningMinutes: number
}

export interface DirectionTimeInsight {
  id: string
  name: string
  color: string
  focusMinutes: number
  learningMinutes: number
  weeklyBudget: number
}

export interface PlanActualPoint {
  key: string
  label: string
  plannedTasks: number
  completedTasks: number
  plannedMinutes: number
  recordedMinutes: number
}

export interface GoalProgressInsight {
  id: string
  title: string
  progress: number
  taskDone: number
  taskTotal: number
  milestoneDone: number
  milestoneTotal: number
}

export interface HabitDiagnostics {
  logCount: number
  tinyRate: number
  expandedRate: number
  anchorRate: number
  obstacles: Array<{ label: string; count: number }>
  map: Array<{ code: 'M' | 'A' | 'P' | '?'; label: string; count: number }>
}

export interface CompetencyEvidenceInsight {
  id: string
  name: string
  currentLevel: string
  latestLevel: string
  evidenceCount: number
  change: number
}

export const ADJUSTMENT_FIELDS: Record<string, AdjustmentFieldMeta[]> = {
  TASK: [
    { key: 'dueDate', label: '截止日期', type: 'date' },
    { key: 'scheduledDate', label: '计划日期', type: 'date' },
    { key: 'estimatedDuration', label: '预计耗时（分钟）', type: 'number' },
    { key: 'status', label: '任务状态', type: 'select' },
  ],
  GOAL: [
    { key: 'dueDate', label: '截止日期', type: 'date' },
    { key: 'manualProgress', label: '人工进度（%）', type: 'number' },
    { key: 'status', label: '目标状态', type: 'select' },
  ],
  HABIT: [
    { key: 'tinyBehavior', label: '微行为', type: 'text' },
    { key: 'anchorDescription', label: '锚点描述', type: 'text' },
    { key: 'status', label: '习惯状态', type: 'select' },
  ],
  MILESTONE: [
    { key: 'dueDate', label: '完成日期', type: 'date' },
    { key: 'status', label: '里程碑状态', type: 'select' },
  ],
  DIRECTION: [
    { key: 'weeklyTimeBudget', label: '每周预算（分钟）', type: 'number' },
    { key: 'priority', label: '优先级（1—3）', type: 'number' },
    { key: 'status', label: '方向状态', type: 'select' },
  ],
}


export function useReviews() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const reviews = ref<Review[]>([])
  const findings = ref<ReviewFinding[]>([])
  const adjustments = ref<Adjustment[]>([])
  const tasks = ref<Task[]>([])
  const goals = ref<Goal[]>([])
  const habits = ref<Habit[]>([])
  const habitLogs = ref<HabitLog[]>([])
  const sessions = ref<LearningSession[]>([])
  const learningRecords = ref<LearningRecord[]>([])
  const evidences = ref<Evidence[]>([])
  const competencies = ref<Competency[]>([])
  const competencyEvidences = ref<CompetencyEvidence[]>([])
  const timeboxes = ref<Timebox[]>([])
  const goalDirections = ref<GoalDirection[]>([])
  const taskGoals = ref<TaskGoal[]>([])
  const goalMilestones = ref<GoalMilestone[]>([])
  const milestones = ref<Milestone[]>([])
  const directions = ref<Direction[]>([])
  const reviewSchedules = ref<ReviewSchedule[]>([])
  const includeArchived = ref(false)

  const visibleReviews = computed(() =>
    reviews.value
      .filter((review) => includeArchived.value || !review.archivedAt)
      .sort((left, right) => right.targetDate.localeCompare(left.targetDate)),
  )

  const findingsByReview = computed<Record<string, ReviewFinding[]>>(() => {
    const map: Record<string, ReviewFinding[]> = {}
    for (const finding of findings.value) {
      if (finding.archivedAt) continue
      if (!map[finding.reviewId]) map[finding.reviewId] = []
      map[finding.reviewId].push(finding)
    }
    return map
  })

  const adjustmentsByReview = computed<Record<string, Adjustment[]>>(() => {
    const map: Record<string, Adjustment[]> = {}
    for (const adjustment of adjustments.value) {
      if (adjustment.archivedAt) continue
      if (!map[adjustment.reviewId]) map[adjustment.reviewId] = []
      map[adjustment.reviewId].push(adjustment)
    }
    return map
  })

  const completedSessions = computed(() =>
    sessions.value
      .filter((session) => session.status === 'COMPLETED' && !session.archivedAt)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
  )

  const activeMilestones = computed(() =>
    milestones.value.filter(
      (milestone) =>
        !milestone.archivedAt &&
        milestone.status !== MilestoneStatus.CANCELLED,
    ),
  )

  const taskById = computed<Record<string, Task>>(() => {
    const map: Record<string, Task> = {}
    for (const task of tasks.value) map[task.id] = task
    return map
  })

  const goalById = computed<Record<string, Goal>>(() => {
    const map: Record<string, Goal> = {}
    for (const goal of goals.value) map[goal.id] = goal
    return map
  })

  const habitById = computed<Record<string, Habit>>(() => {
    const map: Record<string, Habit> = {}
    for (const habit of habits.value) map[habit.id] = habit
    return map
  })

  const milestoneById = computed<Record<string, Milestone>>(() => {
    const map: Record<string, Milestone> = {}
    for (const milestone of milestones.value) map[milestone.id] = milestone
    return map
  })

  const directionById = computed<Record<string, Direction>>(() => {
    const map: Record<string, Direction> = {}
    for (const direction of directions.value) map[direction.id] = direction
    return map
  })

  const lastSevenStart = computed(() => {
    const start = startOfDay()
    start.setDate(start.getDate() - 6)
    return start
  })

  const weekStart = computed(() => {
    const start = startOfDay()
    const day = start.getDay() === 0 ? 7 : start.getDay()
    start.setDate(start.getDate() - (day - 1))
    return start
  })

  const stats = computed<ReviewInsightStats>(() => {
    const since = lastSevenStart.value.getTime()
    const reviewsWeek = reviews.value.filter(
      (review) => new Date(review.targetDate).getTime() >= since,
    ).length
    const completedTasksWeek = tasks.value.filter(
      (task) =>
        task.status === TaskStatus.COMPLETED &&
        new Date(task.updatedAt).getTime() >= since,
    ).length
    const habitWeek = habitLogs.value.filter(
      (log) =>
        log.tinyCompleted &&
        new Date(log.occurredAt).getTime() >= since &&
        !log.archivedAt,
    ).length
    const learningMinutesWeek = sessions.value
      .filter(
        (session) =>
          session.status === 'COMPLETED' &&
          new Date(session.startedAt).getTime() >= since,
      )
      .reduce((total, session) => total + session.actualDuration, 0)

    return { reviewsWeek, completedTasksWeek, habitWeek, learningMinutesWeek }
  })

  const trend = computed<TrendPoint[]>(() => {
    const points: TrendPoint[] = []
    for (let offset = 3; offset >= 0; offset -= 1) {
      const start = new Date(weekStart.value)
      start.setDate(start.getDate() - offset * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const startTime = start.getTime()
      const endTime = end.getTime()

      const taskCount = tasks.value.filter((task) => {
        const time = new Date(task.updatedAt).getTime()
        return task.status === TaskStatus.COMPLETED && time >= startTime && time < endTime
      }).length
      const habitCount = habitLogs.value.filter((log) => {
        const time = new Date(log.occurredAt).getTime()
        return log.tinyCompleted && time >= startTime && time < endTime && !log.archivedAt
      }).length
      const learningMinutes = sessions.value
        .filter((session) => {
          const time = new Date(session.startedAt).getTime()
          return session.status === 'COMPLETED' && time >= startTime && time < endTime
        })
        .reduce((total, session) => total + session.actualDuration, 0)

      points.push({
        key: todayKey(start),
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        taskCount,
        habitCount,
        learningMinutes,
      })
    }
    return points
  })

  const insights = computed<string[]>(() => {
    const list: string[] = []
    const now = Date.now()
    const overdue = tasks.value.filter(
      (task) =>
        !task.archivedAt &&
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.CANCELLED &&
        task.dueDate !== null &&
        new Date(task.dueDate).getTime() < now,
    ).length
    if (overdue > 0) {
      list.push(`有 ${overdue} 个逾期任务。建议在复盘中拆分、延期或明确取消，而不是让它们持续堆积。`)
    }

    const activeHabitCount = habits.value.filter(
      (habit) => !habit.archivedAt && habit.status === 'ACTIVE',
    ).length
    if (activeHabitCount > 0) {
      const expected = activeHabitCount * 7
      const rate = stats.value.habitWeek / expected
      if (rate < 0.4) {
        list.push(
          `近 7 天习惯执行 ${stats.value.habitWeek} 次，低于启用习惯的 40%。先检查锚点与行为大小，而不是责怪动机。`,
        )
      }
    }

    const lastReview = visibleReviews.value[0]
    if (!lastReview) {
      list.push('还没有复盘记录。建议先完成一次每日复盘，建立 Check → Act 的节奏。')
    } else {
      const days = Math.floor(
        (now - new Date(lastReview.targetDate).getTime()) / 86400000,
      )
      if (days >= 7) {
        list.push(`距离上次复盘已经 ${days} 天。复盘不是日记，建议本周安排一次周复盘。`)
      }
    }

    const dueKnowledge = reviewSchedules.value.filter(
      (row) =>
        (row.status === 'PENDING' || row.status === 'DUE') &&
        new Date(row.scheduledAt).getTime() <= now,
    ).length
    if (dueKnowledge > 0) {
      list.push(`有 ${dueKnowledge} 个知识点到期未复习。复习到期不等于遗忘，但值得安排一次主动回忆。`)
    }

    if (stats.value.learningMinutesWeek === 0) {
      list.push('近 7 天没有完成的学习会话。如果正在推进长期方向，检查是否需要重新安排时间块。')
    }

    if (list.length === 0) {
      list.push('当前任务、习惯与学习节奏基本稳定。继续记录，下一次复盘时关注质量而不是数量。')
    }
    return list.slice(0, 4)
  })

  function rangeForReview(
    reviewType: Review['reviewType'],
    targetDate: string,
    startDate: string | null,
    endDate: string | null,
  ): { startKey: string; endKey: string } {
    if (startDate || endDate) {
      return {
        startKey: toDateInput(startDate ?? targetDate),
        endKey: toDateInput(endDate ?? targetDate),
      }
    }
    if (reviewType === 'WEEKLY') {
      const target = startOfDay(new Date(targetDate))
      const weekday = target.getDay() === 0 ? 7 : target.getDay()
      const monday = new Date(target)
      monday.setDate(monday.getDate() - (weekday - 1))
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      return { startKey: todayKey(monday), endKey: todayKey(sunday) }
    }
    if (reviewType === 'MONTHLY') {
      const target = new Date(targetDate)
      return {
        startKey: todayKey(new Date(target.getFullYear(), target.getMonth(), 1)),
        endKey: todayKey(new Date(target.getFullYear(), target.getMonth() + 1, 0)),
      }
    }
    const key = toDateInput(targetDate)
    return { startKey: key, endKey: key }
  }

  function keyInRange(value: string | null, startKey: string, endKey: string): boolean {
    if (!value) return false
    const key = toDateInput(value)
    return Boolean(key) && key >= startKey && key <= endKey
  }

  function reviewContextFor(
    reviewType: Review['reviewType'],
    targetDate: string,
    startDate: string | null = null,
    endDate: string | null = null,
  ): ReviewContext {
    const range = rangeForReview(reviewType, targetDate, startDate, endDate)
    const taskRows = tasks.value.filter(
      (task) =>
        !task.archivedAt &&
        (keyInRange(task.scheduledDate, range.startKey, range.endKey) ||
          keyInRange(task.dueDate, range.startKey, range.endKey) ||
          (task.status === TaskStatus.COMPLETED &&
            keyInRange(task.updatedAt, range.startKey, range.endKey))),
    )
    const completedTasks = taskRows.filter((task) => task.status === TaskStatus.COMPLETED)
    const incompleteTasks = taskRows.filter(
      (task) => task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.CANCELLED,
    )
    const sessionRows = completedSessions.value.filter((session) =>
      keyInRange(session.startedAt, range.startKey, range.endKey),
    )
    const recordRows = learningRecords.value.filter(
      (record) =>
        !record.archivedAt &&
        keyInRange(record.occurredAt, range.startKey, range.endKey),
    )
    const habitRows = habitLogs.value.filter(
      (log) =>
        !log.archivedAt && keyInRange(log.occurredAt, range.startKey, range.endKey),
    )
    const evidenceRows = evidences.value.filter(
      (evidence) =>
        !evidence.archivedAt && keyInRange(evidence.createdAt, range.startKey, range.endKey),
    )
    const timeboxRows = timeboxes.value.filter(
      (timebox) =>
        !timebox.archivedAt &&
        keyInRange(timebox.plannedStart, range.startKey, range.endKey),
    )
    return {
      ...range,
      tasks: taskRows,
      completedTasks,
      incompleteTasks,
      sessions: sessionRows,
      learningRecords: recordRows,
      habitLogs: habitRows,
      evidences: evidenceRows,
      timeboxes: timeboxRows,
      plannedMinutes: timeboxRows.reduce((sum, row) => sum + row.plannedDuration, 0),
      recordedMinutes: timeboxRows
        .filter((row) => row.status === 'COMPLETED')
        .reduce((sum, row) => sum + row.actualDuration, 0),
      learningMinutes: sessionRows.reduce((sum, row) => sum + row.actualDuration, 0),
    }
  }

  const directionTime = computed<DirectionTimeInsight[]>(() => {
    const since = new Date()
    since.setDate(since.getDate() - 27)
    const sinceKey = todayKey(since)
    const directionIdsByTask = new Map<string, string[]>()
    const goalDirectionIds = new Map<string, string[]>()
    for (const row of goalDirections.value) {
      if (row.archivedAt) continue
      if (!goalDirectionIds.has(row.goalId)) goalDirectionIds.set(row.goalId, [])
      goalDirectionIds.get(row.goalId)?.push(row.directionId)
    }
    for (const row of taskGoals.value) {
      if (row.archivedAt) continue
      const ids = goalDirectionIds.get(row.goalId) ?? []
      if (!ids.length) continue
      const existing = directionIdsByTask.get(row.taskId) ?? []
      directionIdsByTask.set(row.taskId, [...new Set([...existing, ...ids])])
    }

    const focus = new Map<string, number>()
    const learning = new Map<string, number>()
    const distribute = (target: Map<string, number>, taskId: string | null, minutes: number) => {
      if (!taskId || minutes <= 0) return
      const directionIds = directionIdsByTask.get(taskId) ?? []
      if (!directionIds.length) return
      const share = minutes / directionIds.length
      for (const id of directionIds) target.set(id, (target.get(id) ?? 0) + share)
    }
    for (const timebox of timeboxes.value) {
      if (timebox.archivedAt || !keyInRange(timebox.plannedStart, sinceKey, todayKey())) continue
      const minutes =
        timebox.status === 'COMPLETED' ? timebox.actualDuration : timebox.plannedDuration
      distribute(focus, timebox.taskId, minutes)
    }
    for (const session of completedSessions.value) {
      if (!keyInRange(session.startedAt, sinceKey, todayKey())) continue
      distribute(learning, session.taskId, session.actualDuration)
    }

    return directions.value
      .filter((direction) => !direction.archivedAt)
      .map((direction) => ({
        id: direction.id,
        name: direction.name,
        color: direction.color,
        focusMinutes: Math.round(focus.get(direction.id) ?? 0),
        learningMinutes: Math.round(learning.get(direction.id) ?? 0),
        weeklyBudget: direction.weeklyTimeBudget,
      }))
      .sort(
        (left, right) =>
          right.focusMinutes + right.learningMinutes - (left.focusMinutes + left.learningMinutes),
      )
  })

  const planActual = computed<PlanActualPoint[]>(() => {
    const points: PlanActualPoint[] = []
    for (let offset = 3; offset >= 0; offset -= 1) {
      const start = new Date(weekStart.value)
      start.setDate(start.getDate() - offset * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const startKey = todayKey(start)
      const endKey = todayKey(new Date(end.getTime() - 1))
      const plannedTaskRows = tasks.value.filter(
        (task) =>
          !task.archivedAt &&
          (keyInRange(task.scheduledDate, startKey, endKey) ||
            keyInRange(task.dueDate, startKey, endKey)),
      )
      const completedTaskRows = tasks.value.filter(
        (task) =>
          !task.archivedAt &&
          task.status === TaskStatus.COMPLETED &&
          keyInRange(task.updatedAt, startKey, endKey),
      )
      const timeboxRows = timeboxes.value.filter(
        (row) => !row.archivedAt && keyInRange(row.plannedStart, startKey, endKey),
      )
      points.push({
        key: startKey,
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        plannedTasks: plannedTaskRows.length,
        completedTasks: completedTaskRows.length,
        plannedMinutes: timeboxRows.reduce((sum, row) => sum + row.plannedDuration, 0),
        recordedMinutes: timeboxRows
          .filter((row) => row.status === 'COMPLETED')
          .reduce((sum, row) => sum + row.actualDuration, 0),
      })
    }
    return points
  })

  const goalProgress = computed<GoalProgressInsight[]>(() => {
    return goals.value
      .filter(
        (goal) =>
          !goal.archivedAt &&
          goal.status !== 'CANCELLED' &&
          goal.status !== 'COMPLETED',
      )
      .map((goal) => {
        const taskIds = new Set(
          taskGoals.value
            .filter((row) => row.goalId === goal.id && !row.archivedAt)
            .map((row) => row.taskId),
        )
        const linkedTasks = tasks.value.filter(
          (task) => !task.archivedAt && taskIds.has(task.id),
        )
        const taskDone = linkedTasks.filter(
          (task) => task.status === TaskStatus.COMPLETED,
        ).length
        const milestoneIds = new Set(
          goalMilestones.value
            .filter((row) => row.goalId === goal.id && !row.archivedAt)
            .map((row) => row.milestoneId),
        )
        const linkedMilestones = activeMilestones.value.filter((milestone) =>
          milestoneIds.has(milestone.id),
        )
        const milestoneDone = linkedMilestones.filter(
          (milestone) => milestone.status === MilestoneStatus.COMPLETED,
        ).length
        const taskRatio = linkedTasks.length ? taskDone / linkedTasks.length : null
        const milestoneRatio = linkedMilestones.length
          ? milestoneDone / linkedMilestones.length
          : null
        const progress = Math.round(
          (goal.progressMode === 'MANUAL'
            ? goal.manualProgress
            : goal.progressMode === 'MILESTONE_BASED' && milestoneRatio !== null
              ? milestoneRatio * 100
              : taskRatio !== null
                ? taskRatio * 100
                : goal.manualProgress) ?? 0,
        )
        return {
          id: goal.id,
          title: goal.title,
          progress,
          taskDone,
          taskTotal: linkedTasks.length,
          milestoneDone,
          milestoneTotal: linkedMilestones.length,
        }
      })
      .sort((left, right) => right.progress - left.progress)
      .slice(0, 6)
  })

  const habitDiagnostics = computed<HabitDiagnostics>(() => {
    const since = new Date()
    since.setDate(since.getDate() - 27)
    const rows = habitLogs.value.filter(
      (log) => !log.archivedAt && new Date(log.occurredAt).getTime() >= since.getTime(),
    )
    const obstacleCounts = new Map<string, number>()
    const mapCounts = { M: 0, A: 0, P: 0, '?': 0 }
    for (const log of rows) {
      if (log.obstacle.trim()) {
        obstacleCounts.set(log.obstacle.trim(), (obstacleCounts.get(log.obstacle.trim()) ?? 0) + 1)
      }
      if (log.tinyCompleted) continue
      const obstacle = log.obstacle.toLowerCase()
      if (/提醒|锚点|触发|忘记|环境|prompt/.test(obstacle)) mapCounts.P += 1
      else if (/时间|精力|累|难|能力|忙|ability/.test(obstacle)) mapCounts.A += 1
      else if (/不想|动机|意义|兴趣|情绪|motivation/.test(obstacle)) mapCounts.M += 1
      else mapCounts['?'] += 1
    }
    const rate = (count: number) => (rows.length ? Math.round((count / rows.length) * 100) : 0)
    return {
      logCount: rows.length,
      tinyRate: rate(rows.filter((log) => log.tinyCompleted).length),
      expandedRate: rate(rows.filter((log) => log.expandedCompleted).length),
      anchorRate: rate(rows.filter((log) => log.anchorTriggered).length),
      obstacles: [...obstacleCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      map: [
        { code: 'M', label: '动机线索', count: mapCounts.M },
        { code: 'A', label: '能力 / 条件线索', count: mapCounts.A },
        { code: 'P', label: '提示线索', count: mapCounts.P },
        { code: '?', label: '未说明', count: mapCounts['?'] },
      ],
    }
  })

  const learningMix = computed<Array<{ type: LearningRecordType; count: number }>>(() => {
    const counts = new Map<LearningRecordType, number>()
    for (const record of learningRecords.value) {
      if (record.archivedAt) continue
      counts.set(record.recordType, (counts.get(record.recordType) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count)
  })

  const competencyEvidence = computed<CompetencyEvidenceInsight[]>(() =>
    competencies.value
      .filter((competency) => !competency.archivedAt)
      .map((competency) => {
        const rows = competencyEvidences.value
          .filter(
            (row) => !row.archivedAt && row.competencyId === competency.id,
          )
          .sort((left, right) => left.assessedAt.localeCompare(right.assessedAt))
        const latest = rows.at(-1)
        const first = rows[0]
        const level = (value: string) => Number(value.replace('L', ''))
        return {
          id: competency.id,
          name: competency.name,
          currentLevel: competency.currentLevel,
          latestLevel: latest?.assessedLevel ?? competency.currentLevel,
          evidenceCount: rows.length,
          change:
            rows.length >= 2 && first && latest
              ? level(latest.assessedLevel) - level(first.assessedLevel)
              : 0,
        }
      })
      .filter((row) => row.evidenceCount > 0)
      .sort((left, right) => right.evidenceCount - left.evidenceCount),
  )

  const reviewCounts = computed<Record<string, { findings: number; adjustments: number }>>(() => {
    const map: Record<string, { findings: number; adjustments: number }> = {}
    for (const review of reviews.value) {
      map[review.id] = {
        findings: findingsByReview.value[review.id]?.length ?? 0,
        adjustments: adjustmentsByReview.value[review.id]?.length ?? 0,
      }
    }
    return map
  })

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [
        reviewRows,
        findingRows,
        adjustmentRows,
        taskRows,
        goalRows,
        habitRows,
        habitLogRows,
        sessionRows,
        learningRecordRows,
        evidenceRows,
        competencyRows,
        competencyEvidenceRows,
        timeboxRows,
        goalDirectionRows,
        taskGoalRows,
        goalMilestoneRows,
        milestoneRows,
        directionRows,
        scheduleRows,
      ] = await Promise.all([
        repos.reviews.list({ includeArchived: true }),
        repos.reviewFindings.list({ includeArchived: true }),
        repos.adjustments.list({ includeArchived: true }),
        repos.tasks.list({ includeArchived: true }),
        repos.goals.list({ includeArchived: true }),
        repos.habits.list({ includeArchived: true }),
        repos.habitLogs.list({ includeArchived: true }),
        repos.learningSessions.list({ includeArchived: true }),
        repos.learningRecords.list({ includeArchived: true }),
        repos.evidences.list({ includeArchived: true }),
        repos.competencies.list({ includeArchived: true }),
        repos.competencyEvidences.list({ includeArchived: true }),
        repos.timeboxes.list({ includeArchived: true }),
        repos.goalDirections.list({ includeArchived: true }),
        repos.taskGoals.list({ includeArchived: true }),
        repos.goalMilestones.list({ includeArchived: true }),
        repos.milestones.list({ includeArchived: true }),
        repos.directions.list({ includeArchived: true }),
        repos.reviewSchedules.list({ includeArchived: true }),
      ])
      reviews.value = reviewRows
      findings.value = findingRows
      adjustments.value = adjustmentRows
      tasks.value = taskRows
      goals.value = goalRows
      habits.value = habitRows
      habitLogs.value = habitLogRows
      sessions.value = sessionRows
      learningRecords.value = learningRecordRows
      evidences.value = evidenceRows
      competencies.value = competencyRows
      competencyEvidences.value = competencyEvidenceRows
      timeboxes.value = timeboxRows
      goalDirections.value = goalDirectionRows
      taskGoals.value = taskGoalRows
      goalMilestones.value = goalMilestoneRows
      milestones.value = milestoneRows
      directions.value = directionRows
      reviewSchedules.value = scheduleRows
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveReview(
    input: ReviewInput,
    findingInputs: FindingInput[],
    id?: string,
  ): Promise<Review> {
    const entity = id
      ? await repos.reviews.update(id, input)
      : await repos.reviews.create(input)

    const existing = findings.value.filter(
      (finding) => finding.reviewId === entity.id && !finding.archivedAt,
    )
    for (const finding of existing) {
      if (!findingInputs.some((item) => item.id === finding.id)) {
        await repos.reviewFindings.remove(finding.id)
      }
    }
    for (const item of findingInputs) {
      const payload = {
        reviewId: entity.id,
        findingType: item.findingType,
        description: item.description.trim(),
        rootCause: item.rootCause.trim(),
        proposedAction: item.proposedAction.trim(),
      }
      if (item.id) {
        await repos.reviewFindings.update(item.id, payload)
      } else {
        await repos.reviewFindings.create(payload)
      }
    }

    await refresh()
    return entity
  }

  async function saveAdjustment(input: AdjustmentInput, id?: string): Promise<Adjustment> {
    const entity = id
      ? await repos.adjustments.update(id, input)
      : await repos.adjustments.create(input)
    await refresh()
    return entity
  }

  async function setAdjustmentStatus(
    id: string,
    status: AdjustmentStatus,
  ): Promise<void> {
    await repos.adjustments.update(id, { status })
    await refresh()
  }

  async function applyAdjustment(adjustment: Adjustment): Promise<void> {
    if (!adjustment.field) {
      throw new Error('该调整没有记录修改字段，无法自动应用')
    }
    const value = adjustment.newValue

    if (adjustment.targetType === 'TASK') {
      const patch: Record<string, unknown> = {}
      if (adjustment.field === 'status') patch.status = value
      else if (adjustment.field === 'dueDate') patch.dueDate = value
      else if (adjustment.field === 'scheduledDate') patch.scheduledDate = value
      else if (adjustment.field === 'estimatedDuration') patch.estimatedDuration = Number(value)
      else throw new Error('不支持的任务字段')
      await repos.tasks.update(adjustment.targetId, patch)
    } else if (adjustment.targetType === 'GOAL') {
      const patch: Record<string, unknown> = {}
      if (adjustment.field === 'status') patch.status = value
      else if (adjustment.field === 'dueDate') patch.dueDate = value
      else if (adjustment.field === 'manualProgress') patch.manualProgress = Number(value)
      else throw new Error('不支持的目标字段')
      await repos.goals.update(adjustment.targetId, patch)
    } else if (adjustment.targetType === 'HABIT') {
      const patch: Record<string, unknown> = {}
      if (adjustment.field === 'status') patch.status = value
      else if (adjustment.field === 'tinyBehavior') patch.tinyBehavior = value
      else if (adjustment.field === 'anchorDescription') patch.anchorDescription = value
      else throw new Error('不支持的习惯字段')
      await repos.habits.update(adjustment.targetId, patch)
    } else if (adjustment.targetType === 'MILESTONE') {
      const patch: Record<string, unknown> = {}
      if (adjustment.field === 'status') patch.status = value
      else if (adjustment.field === 'dueDate') patch.dueDate = value
      else throw new Error('不支持的里程碑字段')
      await repos.milestones.update(adjustment.targetId, patch)
    } else if (adjustment.targetType === 'DIRECTION') {
      const patch: Record<string, unknown> = {}
      if (adjustment.field === 'status') patch.status = value
      else if (adjustment.field === 'weeklyTimeBudget') patch.weeklyTimeBudget = Number(value)
      else if (adjustment.field === 'priority') patch.priority = Number(value)
      else throw new Error('不支持的方向字段')
      await repos.directions.update(adjustment.targetId, patch)
    } else {
      throw new Error('该调整对象暂不支持自动应用')
    }

    await repos.adjustments.update(adjustment.id, {
      status: AdjustmentStatus.APPLIED,
    })
    await refresh()
  }

  async function setArchived(id: string, archived: boolean): Promise<void> {
    archived ? await repos.reviews.archive(id) : await repos.reviews.restore(id)
    await refresh()
  }

  function targetLabel(type: AdjustmentTargetType, id: string): string {
    if (type === 'TASK') return taskById.value[id]?.title ?? '任务已不存在'
    if (type === 'GOAL') return goalById.value[id]?.title ?? '目标已不存在'
    if (type === 'HABIT') return habitById.value[id]?.name ?? '习惯已不存在'
    if (type === 'MILESTONE') return milestoneById.value[id]?.name ?? '里程碑已不存在'
    if (type === 'DIRECTION') return directionById.value[id]?.name ?? '方向已不存在'
    return '未知对象'
  }

  function oldValueFor(
    type: AdjustmentTargetType,
    id: string,
    field: string,
  ): string {
    if (type === 'TASK') {
      const task = taskById.value[id]
      if (!task) return '对象不存在'
      if (field === 'dueDate') return task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '未设置'
      if (field === 'scheduledDate') return task.scheduledDate ? new Date(task.scheduledDate).toLocaleDateString('zh-CN') : '未设置'
      if (field === 'estimatedDuration') return `${task.estimatedDuration} 分钟`
      if (field === 'status') return task.status
    }
    if (type === 'GOAL') {
      const goal = goalById.value[id]
      if (!goal) return '对象不存在'
      if (field === 'dueDate') return goal.dueDate ? new Date(goal.dueDate).toLocaleDateString('zh-CN') : '未设置'
      if (field === 'manualProgress') return `${goal.manualProgress}%`
      if (field === 'status') return goal.status
    }
    if (type === 'HABIT') {
      const habit = habitById.value[id]
      if (!habit) return '对象不存在'
      if (field === 'tinyBehavior') return habit.tinyBehavior
      if (field === 'anchorDescription') return habit.anchorDescription
      if (field === 'status') return habit.status
    }
    if (type === 'MILESTONE') {
      const milestone = milestoneById.value[id]
      if (!milestone) return '对象不存在'
      if (field === 'dueDate') return milestone.dueDate ? new Date(milestone.dueDate).toLocaleDateString('zh-CN') : '未设置'
      if (field === 'status') return milestone.status
    }
    if (type === 'DIRECTION') {
      const direction = directionById.value[id]
      if (!direction) return '对象不存在'
      if (field === 'weeklyTimeBudget') return `${direction.weeklyTimeBudget} 分钟`
      if (field === 'priority') return `${direction.priority}`
      if (field === 'status') return direction.status
    }
    return '—'
  }

  return {
    loading,
    error,
    reviews,
    findings,
    adjustments,
    tasks,
    goals,
    habits,
    habitLogs,
    sessions,
    learningRecords,
    evidences,
    competencies,
    competencyEvidences,
    timeboxes,
    milestones,
    directions,
    includeArchived,
    visibleReviews,
    findingsByReview,
    adjustmentsByReview,
    completedSessions,
    activeMilestones,
    stats,
    trend,
    insights,
    reviewContextFor,
    directionTime,
    planActual,
    goalProgress,
    habitDiagnostics,
    learningMix,
    competencyEvidence,
    reviewCounts,
    lastSevenStart,
    taskById,
    goalById,
    habitById,
    milestoneById,
    directionById,
    refresh,
    saveReview,
    saveAdjustment,
    setAdjustmentStatus,
    applyAdjustment,
    setArchived,
    targetLabel,
    oldValueFor,
  }
}
