<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DetailDrawer from './DetailDrawer.vue'
import AppIcon from './AppIcon.vue'
import { repos } from '@/data'
import { isSameDay, endOfDay, formatTime, formatDuration, formatShortDate, relativeDay } from '@/utils/date'
import { timeboxStatusLabels, type Task, type Timebox, type Milestone } from '@/domain'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const loading = ref(false)
const tasks = ref<Task[]>([])
const timeboxes = ref<Timebox[]>([])
const milestones = ref<Milestone[]>([])

const taskMap = computed(() => {
  const map: Record<string, Task> = {}
  for (const task of tasks.value) map[task.id] = task
  return map
})

const todayTimeboxes = computed(() =>
  timeboxes.value
    .filter((timebox) => isSameDay(timebox.plannedStart))
    .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart)),
)

const todayTasks = computed(() =>
  tasks.value.filter(
    (task) =>
      task.status !== 'COMPLETED' &&
      task.status !== 'CANCELLED' &&
      (isSameDay(task.scheduledDate) || isSameDay(task.dueDate)),
  ),
)

const upcomingMilestones = computed(() => {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + 14)
  return milestones.value
    .filter(
      (milestone) =>
        milestone.dueDate !== null &&
        milestone.status !== 'COMPLETED' &&
        milestone.status !== 'CANCELLED' &&
        new Date(milestone.dueDate).getTime() <= endOfDay(deadline).getTime(),
    )
    .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))
    .slice(0, 3)
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [taskRows, timeboxRows, milestoneRows] = await Promise.all([
      repos.tasks.list(),
      repos.timeboxes.list(),
      repos.milestones.list(),
    ])
    tasks.value = taskRows
    timeboxes.value = timeboxRows
    milestones.value = milestoneRows
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load()
  },
)

function go(path: string): void {
  emit('close')
  void router.push(path)
}
</script>

<template>
  <DetailDrawer
    :open="open"
    title="今日日历"
    subtitle="时间盒、今日任务与近期里程碑"
    :width="430"
    @close="emit('close')"
  >
    <div v-if="loading" class="calendar-loading">正在读取今日安排…</div>
    <div v-else class="calendar-body">
      <section class="calendar-section">
        <h4 class="calendar-title">
          <AppIcon name="clock" :size="14" />
          时间盒
          <span class="calendar-count">{{ todayTimeboxes.length }}</span>
        </h4>
        <div v-if="todayTimeboxes.length === 0" class="calendar-empty">
          今天还没有时间盒。可以到目标与任务里安排具体时段。
        </div>
        <div v-else class="timeline">
          <div v-for="timebox in todayTimeboxes" :key="timebox.id" class="timeline-row">
            <span class="timeline-time">{{ formatTime(timebox.plannedStart) }}</span>
            <span class="timeline-dot" />
            <div class="timeline-copy">
              <span class="timeline-task">
                {{ taskMap[timebox.taskId]?.title ?? '任务已不存在' }}
              </span>
              <span class="timeline-meta">
                {{ formatTime(timebox.plannedStart) }} – {{ formatTime(timebox.plannedEnd) }}
                · {{ formatDuration(timebox.plannedDuration) }}
                · {{ timeboxStatusLabels[timebox.status] }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="calendar-section">
        <h4 class="calendar-title">
          <AppIcon name="check" :size="14" />
          今日任务
          <span class="calendar-count">{{ todayTasks.length }}</span>
        </h4>
        <div v-if="todayTasks.length === 0" class="calendar-empty">今天没有安排任务。</div>
        <div v-else class="calendar-task-list">
          <div v-for="task in todayTasks.slice(0, 5)" :key="task.id" class="calendar-task">
            <span class="calendar-task-dot" />
            <span class="calendar-task-title">{{ task.title }}</span>
            <span class="calendar-task-time">{{ formatDuration(task.estimatedDuration) }}</span>
          </div>
        </div>
      </section>

      <section class="calendar-section">
        <h4 class="calendar-title">
          <AppIcon name="flag" :size="14" />
          近期里程碑
        </h4>
        <div v-if="upcomingMilestones.length === 0" class="calendar-empty">
          未来 14 天没有里程碑。
        </div>
        <div v-else class="milestone-list">
          <div v-for="milestone in upcomingMilestones" :key="milestone.id" class="milestone-row">
            <span class="milestone-mark"><AppIcon name="flag" :size="12" /></span>
            <div>
              <span class="milestone-title">{{ milestone.name }}</span>
              <span class="milestone-meta">
                {{ formatShortDate(milestone.dueDate) }} · {{ relativeDay(milestone.dueDate) }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button class="btn btn-sm btn-secondary" @click="go('/roadmap')">发展路线</button>
      <button class="btn btn-sm btn-primary" @click="go('/goals')">打开时间盒</button>
    </template>
  </DetailDrawer>
</template>

<style scoped>
.calendar-loading {
  padding: 28px 10px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}

.calendar-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.calendar-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calendar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-soft);
}

.calendar-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.calendar-empty {
  padding: 11px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 0;
}

.timeline-time {
  width: 42px;
  flex: none;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-faint);
}

.timeline-dot {
  width: 6px;
  height: 6px;
  flex: none;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.timeline-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.timeline-task {
  font-size: 11px;
  font-weight: 600;
}

.timeline-meta {
  color: var(--muted);
  font-size: 8.5px;
}

.calendar-task-list,
.milestone-list {
  display: flex;
  flex-direction: column;
}

.calendar-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--line-faint);
}

.calendar-task:first-child {
  border-top: none;
}

.calendar-task-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.calendar-task-title {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-task-time {
  flex: none;
  color: var(--muted);
  font-size: 8.5px;
}

.milestone-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--line-faint);
}

.milestone-row:first-child {
  border-top: none;
}

.milestone-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: var(--radius-xs);
  background: var(--amber-soft);
  color: var(--amber);
}

.milestone-title {
  display: block;
  font-size: 10.5px;
  font-weight: 600;
}

.milestone-meta {
  color: var(--muted);
  font-size: 8.5px;
}
</style>