import { computed, ref } from 'vue'
import {
  HabitStatus,
  PromptStatus,
  type Habit,
  type HabitLog,
  type NewEntity,
} from '@/domain'
import { repos } from '@/data'
import { isSameDay, startOfDay, todayKey } from '@/utils/date'

export type HabitInput = Omit<NewEntity<Habit>, 'id'>
export type HabitLogInput = Omit<NewEntity<HabitLog>, 'id'>

export interface HabitDiagnosis {
  type: 'M' | 'A' | 'P'
  title: string
  reason: string
  action: string
}

export interface HeatmapDay {
  key: string
  label: string
  weekday: string
  isToday: boolean
}

export interface WeekCalendarDay extends HeatmapDay {
  dateLabel: string
  isFuture: boolean
}

export interface HabitTrendPoint extends HeatmapDay {
  tinyCompleted: number
  expandedCompleted: number
  anchorTriggered: number
  recorded: number
}

export interface HabitTrendSummary {
  sampleCount: number
  tinyRate: number | null
  expandedRate: number | null
  anchorRate: number | null
  topObstacle: string
  topObstacleCount: number
  mapCounts: { M: number; A: number; P: number }
  mapSamples: number
}

export function useHabits() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const habits = ref<Habit[]>([])
  const logs = ref<HabitLog[]>([])
  const includeArchived = ref(false)

  const activeHabits = computed(() =>
    habits.value.filter((habit) => habit.status === HabitStatus.ACTIVE),
  )

  const visibleHabits = computed(() =>
    habits.value
      .filter((habit) => includeArchived.value || !habit.archivedAt)
      .sort((left, right) => {
        const rank: Record<string, number> = { ACTIVE: 0, DRAFT: 1, PAUSED: 2, ARCHIVED: 3 }
        return (rank[left.status] ?? 9) - (rank[right.status] ?? 9)
      }),
  )

  const activeLogs = computed(() => logs.value.filter((log) => !log.archivedAt))

  const logsByHabit = computed<Record<string, HabitLog[]>>(() => {
    const map: Record<string, HabitLog[]> = {}
    for (const log of activeLogs.value) {
      if (!map[log.habitId]) map[log.habitId] = []
      map[log.habitId].push(log)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    }
    return map
  })

  const todayLogByHabit = computed<Record<string, HabitLog>>(() => {
    const map: Record<string, HabitLog> = {}
    for (const log of activeLogs.value) {
      if (!isSameDay(log.occurredAt)) continue
      const current = map[log.habitId]
      if (!current || log.occurredAt > current.occurredAt) map[log.habitId] = log
    }
    return map
  })

  const weekStart = computed(() => {
    const start = startOfDay()
    start.setDate(start.getDate() - 6)
    return start.getTime()
  })

  const stats = computed(() => {
    const weekLogs = activeLogs.value.filter(
      (log) => new Date(log.occurredAt).getTime() >= weekStart.value,
    )
    const weekExecutions = weekLogs.filter((log) => log.tinyCompleted).length
    const todayDone = activeHabits.value.filter(
      (habit) => todayLogByHabit.value[habit.id]?.tinyCompleted,
    ).length
    const bestStreak = activeHabits.value.reduce(
      (best, habit) => Math.max(best, streakFor(habit.id)),
      0,
    )
    const difficulties = weekLogs
      .filter((log) => log.tinyCompleted)
      .map((log) => log.difficulty)
    const avgDifficulty =
      difficulties.length > 0
        ? difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length
        : 0

    return {
      active: activeHabits.value.length,
      todayDone,
      weekExecutions,
      bestStreak,
      avgDifficulty,
    }
  })

  function streakFor(habitId: string): number {
    const days = new Set(
      (logsByHabit.value[habitId] ?? [])
        .filter((log) => log.tinyCompleted)
        .map((log) => todayKey(new Date(log.occurredAt))),
    )
    if (days.size === 0) return 0
    let streak = 0
    const cursor = new Date()
    if (!days.has(todayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    while (days.has(todayKey(cursor))) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }

  function lastSevenLogs(habitId: string): HabitLog[] {
    return (logsByHabit.value[habitId] ?? []).filter(
      (log) => new Date(log.occurredAt).getTime() >= weekStart.value,
    )
  }

  const weekCalendarDays = computed<WeekCalendarDay[]>(() => {
    const today = startOfDay()
    const monday = new Date(today)
    const day = monday.getDay() === 0 ? 7 : monday.getDay()
    monday.setDate(monday.getDate() - (day - 1))
    const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + index)
      const key = todayKey(date)
      return {
        key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        dateLabel: `${date.getMonth() + 1} 月 ${date.getDate()} 日`,
        weekday: weekdayLabels[index],
        isToday: key === todayKey(),
        isFuture: date.getTime() > today.getTime(),
      }
    })
  })

  const trendPoints = computed<HabitTrendPoint[]>(() =>
    heatmapDays.value.map((day) => {
      const dayLogs = activeLogs.value.filter(
        (log) => todayKey(new Date(log.occurredAt)) === day.key,
      )
      return {
        ...day,
        recorded: dayLogs.length,
        tinyCompleted: dayLogs.filter((log) => log.tinyCompleted).length,
        expandedCompleted: dayLogs.filter((log) => log.expandedCompleted).length,
        anchorTriggered: dayLogs.filter((log) => log.anchorTriggered).length,
      }
    }),
  )

  const trendSummary = computed<HabitTrendSummary>(() => {
    const recent = activeLogs.value.filter(
      (log) => new Date(log.occurredAt).getTime() >= weekStart.value,
    )
    const tinyCompleted = recent.filter((log) => log.tinyCompleted)
    const obstacleCounts = new Map<string, number>()
    for (const log of recent) {
      const obstacle = log.obstacle.trim()
      if (!obstacle) continue
      obstacleCounts.set(obstacle, (obstacleCounts.get(obstacle) ?? 0) + 1)
    }
    const topObstacle = [...obstacleCounts.entries()].sort((left, right) => right[1] - left[1])[0]
    const mapCounts = { M: 0, A: 0, P: 0 }
    for (const log of recent) {
      if (!log.anchorTriggered) mapCounts.P += 1
      if (log.difficulty >= 4) mapCounts.A += 1
      const motivationCue = /(不想|没动力|动机|意义|疲惫|累|焦虑|压力)/.test(
        `${log.obstacle} ${log.note}`,
      )
      if (motivationCue || (!log.tinyCompleted && log.difficulty <= 2)) mapCounts.M += 1
    }
    return {
      sampleCount: recent.length,
      tinyRate: recent.length > 0 ? tinyCompleted.length / recent.length : null,
      expandedRate:
        tinyCompleted.length > 0
          ? tinyCompleted.filter((log) => log.expandedCompleted).length / tinyCompleted.length
          : null,
      anchorRate:
        recent.length > 0
          ? recent.filter((log) => log.anchorTriggered).length / recent.length
          : null,
      topObstacle: topObstacle?.[0] ?? '暂无记录',
      topObstacleCount: topObstacle?.[1] ?? 0,
      mapCounts,
      mapSamples: recent.length,
    }
  })

  function logsOnDay(habitId: string, dayKey: string): HabitLog[] {
    return (logsByHabit.value[habitId] ?? []).filter(
      (log) => todayKey(new Date(log.occurredAt)) === dayKey,
    )
  }

  function diagnosisFor(habit: Habit): HabitDiagnosis[] {
    if (habit.archivedAt) return []
    const recent = lastSevenLogs(habit.id).filter((log) => log.tinyCompleted)
    if (recent.length >= 6) return []

    const suggestions: HabitDiagnosis[] = []
    if (habit.promptStatus !== PromptStatus.CLEAR) {
      suggestions.push({
        type: 'P',
        title: 'P · 提示不够明确',
        reason:
          habit.promptStatus === PromptStatus.UNCLEAR
            ? '锚点还不清晰，行为很难被自然触发。'
            : '锚点只有部分明确，执行时容易忘记。',
        action: '把锚点改成“某个已有行为之后”，并写清时间或地点。',
      })
    }

    const difficulties = recent.map((log) => log.difficulty)
    const avgDifficulty =
      difficulties.length > 0
        ? difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length
        : 0
    if (habit.abilityLevel <= 3 || avgDifficulty >= 4) {
      suggestions.push({
        type: 'A',
        title: 'A · 行为还不够容易',
        reason:
          avgDifficulty >= 4
            ? `最近记录的平均难度是 ${avgDifficulty.toFixed(1)}/5，行为阻力偏高。`
            : `能力自评是 ${habit.abilityLevel}/5，当前行为可能仍然偏大。`,
        action: '把微行为再缩小到 2 分钟以内，或提前准备好所需资源。',
      })
    }

    if (habit.motivationLevel <= 3) {
      suggestions.push({
        type: 'M',
        title: 'M · 动机连接不足',
        reason: `动机自评是 ${habit.motivationLevel}/5，可能还没有和长期方向连接起来。`,
        action: '重新写下这个习惯服务于哪个方向，或降低心理负担。',
      })
    }

    if (suggestions.length === 0) {
      suggestions.push({
        type: 'P',
        title: 'P · 先固定锚点',
        reason: `最近 7 天完成了 ${recent.length} 次，记录还不够稳定。`,
        action: '再坚持记录 3 天，观察锚点是否稳定，不急着增加行为量。',
      })
    }

    return suggestions.slice(0, 2)
  }

  const diagnostics = computed(() =>
    activeHabits.value
      .map((habit) => ({ habit, suggestions: diagnosisFor(habit) }))
      .filter((item) => item.suggestions.length > 0),
  )

  const heatmapDays = computed<HeatmapDay[]>(() => {
    const days: HeatmapDay[] = []
    const today = new Date()
    const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(today)
      date.setDate(date.getDate() - offset)
      days.push({
        key: todayKey(date),
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        weekday: weekdayLabels[date.getDay()],
        isToday: offset === 0,
      })
    }
    return days
  })

  function heatmapFor(habitId: string): Set<string> {
    return new Set(
      (logsByHabit.value[habitId] ?? [])
        .filter((log) => log.tinyCompleted)
        .map((log) => todayKey(new Date(log.occurredAt))),
    )
  }

  function historyFor(habitId: string): HabitLog[] {
    return logsByHabit.value[habitId] ?? []
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [habitRows, logRows] = await Promise.all([
        repos.habits.list({ includeArchived: true }),
        repos.habitLogs.list({ includeArchived: true }),
      ])
      habits.value = habitRows
      logs.value = logRows
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveHabit(input: HabitInput, id?: string): Promise<Habit> {
    const entity = id
      ? await repos.habits.update(id, input)
      : await repos.habits.create(input)
    await refresh()
    return entity
  }

  async function setHabitStatus(id: string, status: HabitStatus): Promise<void> {
    await repos.habits.update(id, { status })
    await refresh()
  }

  async function setArchived(id: string, archived: boolean): Promise<void> {
    archived ? await repos.habits.archive(id) : await repos.habits.restore(id)
    await refresh()
  }

  function logForToday(habitId: string): HabitLog | undefined {
    return todayLogByHabit.value[habitId]
  }

  async function saveLog(input: HabitLogInput, id?: string): Promise<HabitLog> {
    const payload = {
      ...input,
      difficulty: Math.max(1, Math.min(5, Number(input.difficulty) || 3)),
    }
    const entity = id
      ? await repos.habitLogs.update(id, payload)
      : await repos.habitLogs.create(payload)
    await refresh()
    return entity
  }

  return {
    loading,
    error,
    habits,
    logs,
    includeArchived,
    activeHabits,
    visibleHabits,
    logsByHabit,
    todayLogByHabit,
    stats,
    diagnostics,
    heatmapDays,
    weekCalendarDays,
    trendPoints,
    trendSummary,
    logsOnDay,
    streakFor,
    diagnosisFor,
    heatmapFor,
    historyFor,
    logForToday,
    refresh,
    saveHabit,
    setHabitStatus,
    setArchived,
    saveLog,
  }
}