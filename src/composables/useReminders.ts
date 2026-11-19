import { ref } from 'vue'
import {
  HabitStatus,
  MilestoneStatus,
  ReviewScheduleStatus,
  TaskStatus,
  type Notification,
} from '@/domain'
import { repos } from '@/data'
import { daysUntil, endOfDay, isSameDay } from '@/utils/date'

export type ReminderIcon =
  | 'check'
  | 'refresh'
  | 'repeat'
  | 'flag'
  | 'spark'
  | 'sliders'

export interface ReminderItem {
  id: string
  title: string
  description: string
  route: string
  icon: ReminderIcon
  tone: 'accent' | 'amber' | 'danger' | 'blue'
}

const items = ref<ReminderItem[]>([])
const notifications = ref<Notification[]>([])
const loading = ref(false)
const loaded = ref(false)

const notificationRoutes: Record<string, string> = {
  TASK: '/goals',
  REVIEW: '/learning',
  HABIT: '/habits',
  MILESTONE: '/roadmap',
  SYSTEM: '/settings',
}

async function refresh(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    const [tasks, habits, habitLogs, reviewSchedules, reviews, milestones, notificationRows] =
      await Promise.all([
        repos.tasks.list(),
        repos.habits.list(),
        repos.habitLogs.list(),
        repos.reviewSchedules.list(),
        repos.reviews.list(),
        repos.milestones.list(),
        repos.notifications.list(),
      ])

    const list: ReminderItem[] = []

    const todayTasks = tasks.filter(
      (task) =>
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.CANCELLED &&
        (isSameDay(task.scheduledDate) || isSameDay(task.dueDate)),
    )
    if (todayTasks.length > 0) {
      list.push({
        id: 'today-tasks',
        title: `${todayTasks.length} 个任务安排在今天`,
        description: '先选一个最重要的推进点，不需要一次完成全部。',
        route: '/goals',
        icon: 'check',
        tone: 'accent',
      })
    }

    const deadline = endOfDay().toISOString()
    const dueReviews = reviewSchedules.filter(
      (row) =>
        (row.status === ReviewScheduleStatus.PENDING ||
          row.status === ReviewScheduleStatus.DUE) &&
        row.scheduledAt <= deadline,
    )
    if (dueReviews.length > 0) {
      list.push({
        id: 'due-reviews',
        title: `${dueReviews.length} 个知识点需要复习`,
        description: '到期不等于遗忘，做一次主动回忆再决定下一次间隔。',
        route: '/learning',
        icon: 'refresh',
        tone: 'amber',
      })
    }

    const completedHabitIds = new Set(
      habitLogs
        .filter((log) => isSameDay(log.occurredAt) && log.tinyCompleted)
        .map((log) => log.habitId),
    )
    const pendingHabits = habits.filter(
      (habit) =>
        habit.status === HabitStatus.ACTIVE &&
        !habit.archivedAt &&
        !completedHabitIds.has(habit.id),
    )
    if (pendingHabits.length > 0) {
      list.push({
        id: 'pending-habits',
        title: `${pendingHabits.length} 个微习惯还未打卡`,
        description: '微行为也算完成，先打开第一步就好。',
        route: '/habits',
        icon: 'repeat',
        tone: 'blue',
      })
    }

    const upcomingMilestone = milestones
      .filter(
        (milestone) =>
          !milestone.archivedAt &&
          milestone.status !== MilestoneStatus.COMPLETED &&
          milestone.status !== MilestoneStatus.CANCELLED &&
          milestone.dueDate !== null &&
          (daysUntil(milestone.dueDate) ?? 99) >= 0 &&
          (daysUntil(milestone.dueDate) ?? 99) <= 7,
      )
      .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))[0]
    if (upcomingMilestone) {
      const days = daysUntil(upcomingMilestone.dueDate) ?? 0
      list.push({
        id: 'milestone',
        title: `里程碑「${upcomingMilestone.name}」${days === 0 ? '今天到期' : `还有 ${days} 天`}`,
        description: '检查当前任务是否仍在支撑这个阶段成果。',
        route: '/roadmap',
        icon: 'flag',
        tone: 'danger',
      })
    }

    const latestReview = [...reviews]
      .filter((review) => !review.archivedAt)
      .sort((left, right) => right.targetDate.localeCompare(left.targetDate))[0]
    const daysSinceReview = latestReview
      ? Math.floor((Date.now() - new Date(latestReview.targetDate).getTime()) / 86400000)
      : 999
    if (daysSinceReview >= 7) {
      list.push({
        id: 'review-gap',
        title:
          latestReview && daysSinceReview < 900
            ? `距离上次复盘 ${daysSinceReview} 天`
            : '还没有复盘记录',
        description: '复盘不是日记，写下一条发现并生成一个计划调整。',
        route: '/review',
        icon: 'spark',
        tone: 'amber',
      })
    }

    items.value = list
    notifications.value = notificationRows.filter(
      (notification) => notification.status === 'PENDING' && !notification.archivedAt,
    )
    loaded.value = true
  } finally {
    loading.value = false
  }
}

export function useReminders() {
  return {
    items,
    notifications,
    loading,
    loaded,
    refresh,
    notificationRoute: (type: string): string => notificationRoutes[type] ?? '/review',
  }
}