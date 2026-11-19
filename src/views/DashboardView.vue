<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useDashboard } from '@/composables/useDashboard'
import { useToast } from '@/composables/useToast'
import { repos, seedDemoData } from '@/data'
import {
  evidenceTypeLabels,
  goalStatusLabels,
  priorityLabels,
  ProgressMode,
  progressModeLabels,
  taskTypeLabels,
  type Goal,
} from '@/domain'
import { formatDuration, formatShortDate, formatTime, relativeDay } from '@/utils/date'

const router = useRouter()
const { success, error: toastError } = useToast()
const seeding = ref(false)

const {
  loading,
  error,
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
} = useDashboard()

function isHabitChecked(habitId: string): boolean {
  return !pendingHabits.value.some((habit) => habit.id === habitId)
}

function go(path: string): void {
  void router.push(path)
}

function progressModeText(goal: Goal): string {
  const mode =
    goal.progressMode === ProgressMode.MILESTONE_BASED
      ? ProgressMode.TASK_BASED
      : goal.progressMode
  return progressModeLabels[mode]
}

function goLearningForTask(taskId: string): void {
  void router.push({ path: '/learning', query: { task: taskId } })
}

function openTask(taskId: string): void {
  void router.push({ path: '/goals', query: { task: taskId } })
}

function openReview(reviewId: string): void {
  void router.push({ path: '/learning', query: { review: reviewId } })
}

function openGoal(goalId: string): void {
  void router.push({ path: '/goals', query: { goal: goalId } })
}

async function chooseFocus(event: Event): Promise<void> {
  const taskId = (event.target as HTMLSelectElement).value
  try {
    await setFocusTask(taskId)
    success('今日重点已更新')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function changeSummaryRange(range: 'week' | 'month' | 'quarter'): Promise<void> {
  await setSummaryRange(range)
}

async function completeScheduleItem(taskId: string, completed: boolean): Promise<void> {
  try {
    await toggleTaskCompletion(taskId)
    success(completed ? '任务已恢复为待办' : '任务已完成')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const draggingTaskId = ref<string | null>(null)

function startTaskDrag(taskId: string, event: DragEvent): void {
  draggingTaskId.value = taskId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', taskId)
  }
}

async function dropTask(targetTaskId: string): Promise<void> {
  const dragged = draggingTaskId.value
  draggingTaskId.value = null
  if (!dragged) return
  try {
    await reorderTodayTask(dragged, targetTaskId)
    success('今日任务顺序已保存')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const scheduleModalOpen = ref(false)
const scheduleSaving = ref(false)
const scheduleError = ref('')
const scheduleTargetId = ref<string | null>(null)
const scheduleForm = reactive({ start: '09:00', duration: 30 })

const scheduleTarget = () =>
  todaySchedule.value.find((item) => item.id === scheduleTargetId.value) ?? null

function openScheduleEditor(item: (typeof todaySchedule.value)[number]): void {
  scheduleTargetId.value = item.id
  scheduleForm.start = item.start ? formatTime(item.start) : '09:00'
  scheduleForm.duration = item.duration || 30
  scheduleError.value = ''
  scheduleModalOpen.value = true
}

async function submitScheduleEditor(): Promise<void> {
  const item = scheduleTarget()
  if (!item) return
  scheduleSaving.value = true
  scheduleError.value = ''
  try {
    await saveScheduleTime(item, scheduleForm.start, scheduleForm.duration)
    scheduleModalOpen.value = false
    success('时间安排已更新')
  } catch (caught) {
    scheduleError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    scheduleSaving.value = false
  }
}

async function quickCheckHabit(habit: { id: string; name: string }): Promise<void> {
  if (isHabitChecked(habit.id)) {
    success('今天已经记录过这个微习惯')
    return
  }
  try {
    await repos.habitLogs.create({
      habitId: habit.id,
      occurredAt: new Date().toISOString(),
      anchorTriggered: true,
      tinyCompleted: true,
      expandedCompleted: false,
      celebrationDone: true,
      difficulty: 3,
      obstacle: '',
      note: '从今日概览快速记录微行为',
    })
    await refresh()
    success(`已记录微行为：${habit.name}`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function loadDemo(): Promise<void> {
  seeding.value = true
  try {
    await seedDemoData(repos)
    await refresh()
    success('演示数据已载入，可以从首页开始探索')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    seeding.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page dashboard">
    <section class="hero">
      <div class="hero-glow" aria-hidden="true" />
      <div class="hero-copy">
        <p class="hero-eyebrow">{{ dateLabel }}</p>
        <h2 class="hero-title">
          {{ greeting }}，<br />
          今天也是向目标前进的一天。
        </h2>
        <p class="hero-sub">
          从最重要的一件事开始。你不需要一次完成所有计划，只需要让今天比昨天更接近方向。
        </p>
        <div class="hero-actions">
          <button class="btn btn-primary" @click="go('/goals')">
            查看今日任务
            <AppIcon name="arrow-right" :size="15" />
          </button>
          <button class="btn btn-secondary" @click="go('/learning')">
            <AppIcon name="book" :size="15" />
            开始学习
          </button>
        </div>
      </div>

      <div v-if="focusTask" class="hero-focus">
        <div class="focus-head">
          <span class="focus-label">Today's Focus</span>
          <label class="focus-switch" title="切换今日重点">
            <AppIcon name="target" :size="14" />
            <select
              :value="selectedFocusTaskId || focusTask.id"
              aria-label="选择今日重点任务"
              @change="chooseFocus"
            >
              <option v-for="task in openTodayTasks" :key="task.id" :value="task.id">
                {{ task.title }}
              </option>
            </select>
          </label>
        </div>
        <p class="focus-title">{{ focusTask.title }}</p>
        <p class="focus-desc">{{ focusTask.description || '这是今天优先级最高的推进点。' }}</p>
        <div class="focus-meta">
          <span class="badge badge-accent">{{ taskTypeLabels[focusTask.taskType] }}</span>
          <span class="badge">{{ priorityLabels[focusTask.priority] }}优先级</span>
          <span class="focus-time">
            <AppIcon name="clock" :size="13" />
            预计 {{ formatDuration(focusTask.estimatedDuration) }}
          </span>
        </div>
        <button class="focus-start" @click="goLearningForTask(focusTask.id)">
          <span class="focus-play"><AppIcon name="play" :size="11" /></span>
          开始这个任务
        </button>
      </div>
      <div v-else class="hero-focus hero-focus-empty">
        <span class="focus-label">Today's Focus</span>
        <p class="focus-title focus-title-empty">今天还没有选出重点</p>
        <p class="focus-desc">从一个 15 分钟内可以开始的小动作起步，比等待完整状态更可靠。</p>
        <button class="focus-start" @click="go('/goals')">
          <span class="focus-play"><AppIcon name="plus" :size="11" /></span>
          去安排今天的任务
        </button>
      </div>
    </section>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取本地数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="stats">
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-icon stat-icon-violet"><AppIcon name="play" :size="16" /></span>
          <span class="stat-label">今日进行中</span>
        </div>
        <div class="stat-value">{{ loading ? '—' : inProgressTasks }}</div>
        <p class="stat-note">
          {{ inProgressTasks ? '正在推进的任务，先保持单点专注' : '还没有标记进行中的任务' }}
        </p>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-icon"><AppIcon name="target" :size="16" /></span>
          <span class="stat-label">今日任务</span>
        </div>
        <div class="stat-value">{{ loading ? '—' : todayTasks.length }}</div>
        <p class="stat-note">
          {{
            todayTasks.length
              ? `已完成 ${completedTodayTasks} 项，可拖动或使用箭头排序`
              : '今日清单仍是空的'
          }}
        </p>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-icon stat-icon-blue"><AppIcon name="clock" :size="16" /></span>
          <span class="stat-label">今日学习</span>
        </div>
        <div class="stat-value">{{ loading ? '—' : formatDuration(todayMinutes) }}</div>
        <p class="stat-note">只统计已完成的学习会话</p>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <span class="stat-icon stat-icon-amber"><AppIcon name="refresh" :size="16" /></span>
          <span class="stat-label">待复习</span>
        </div>
        <div class="stat-value">{{ loading ? '—' : dueReviews.length }}</div>
        <p class="stat-note">
          {{ dueReviews.length ? '主动回忆比重复阅读更有效' : '没有到期的知识点' }}
        </p>
      </div>
    </section>

    <section v-if="activeSession" class="resume-card card">
      <span class="resume-icon"><AppIcon name="play" :size="16" /></span>
      <div class="resume-copy">
        <strong>有进行中的学习会话</strong>
        <p>{{ activeSession.learningIntention || '继续按学习流程推进当前会话。' }}</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="go('/learning')">
        继续学习
        <AppIcon name="arrow-right" :size="13" />
      </button>
    </section>

    <section v-if="isDatabaseEmpty && !loading" class="onboarding card">
      <div class="onboarding-main">
        <p class="page-eyebrow">开始使用</p>
        <h3 class="onboarding-title">这套系统从“想成为谁”开始，而不是从待办清单开始。</h3>
        <p class="onboarding-sub">
          第一版已经把完整数据结构和本地数据库准备好了。接下来的阶段会逐个开放业务模块，
          你可以按顺序建立愿景、路线、目标与学习闭环。
        </p>
        <ol class="onboarding-steps">
          <li>
            <span class="step-index">01</span>
            <div>
              <strong>写下未来愿景与身份</strong>
              <p>明确想成为怎样的人，以及为什么。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/future-self')">进入</button>
          </li>
          <li>
            <span class="step-index">02</span>
            <div>
              <strong>建立发展方向与能力地图</strong>
              <p>用方向组织需要具备的能力，作为目标拆解的锚点。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/roadmap')">进入</button>
          </li>
          <li>
            <span class="step-index">03</span>
            <div>
              <strong>从能力拆出可执行任务</strong>
              <p>多级目标、任务、时间盒与任务依赖。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/goals')">进入</button>
          </li>
          <li>
            <span class="step-index">04</span>
            <div>
              <strong>开始一次学习会话</strong>
              <p>用可配置流程推动输入、输出、反馈与反思。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/learning')">进入</button>
          </li>
          <li>
            <span class="step-index">05</span>
            <div>
              <strong>建立第一个微习惯</strong>
              <p>用锚点、微行为和即时庆祝降低开始阻力。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/habits')">进入</button>
          </li>
          <li>
            <span class="step-index">06</span>
            <div>
              <strong>用复盘调整下一轮计划</strong>
              <p>检查、5Why 与可预览的计划调整。已开放。</p>
            </div>
            <button class="btn btn-sm btn-secondary" @click="go('/review')">进入</button>
          </li>
        </ol>
      </div>
      <aside class="onboarding-side">
        <span class="side-icon"><AppIcon name="spark" :size="19" /></span>
        <h4>先看看完整的样子</h4>
        <p>
          载入一套演示数据：一个愿景、两个方向、能力地图、多级目标、任务、习惯、学习会话、成果与复盘。
        </p>
        <button class="btn btn-primary" :disabled="seeding" @click="loadDemo">
          <AppIcon :name="seeding ? 'refresh' : 'layers'" :size="15" />
          {{ seeding ? '正在写入…' : '载入演示数据' }}
        </button>
        <p class="side-note">演示数据可以随时在“设置与数据”中清空。</p>
      </aside>
    </section>

    <section v-else class="dashboard-grid">
      <div class="dashboard-col">
        <article class="card card-pad schedule-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="calendar" :size="16" />
              今日安排
              <span class="count-pill">{{ todaySchedule.length }}</span>
            </h3>
            <button class="link-btn" @click="go('/goals')">
              全部任务 <AppIcon name="arrow-right" :size="13" />
            </button>
          </div>

          <div v-if="loading" class="stack">
            <div class="skeleton skeleton-row" />
            <div class="skeleton skeleton-row" />
            <div class="skeleton skeleton-row" />
          </div>
          <EmptyState
            v-else-if="todaySchedule.length === 0"
            title="今天没有安排任务"
            description="从目标中拆出一个 15 分钟内可以开始的动作，或者留出真正的休息。"
          >
            <button class="btn btn-sm btn-secondary" @click="go('/goals')">去安排任务</button>
          </EmptyState>
          <div v-else class="schedule-list">
            <div
              v-for="item in todaySchedule"
              :key="item.id"
              class="schedule-item"
              :class="{
                completed: item.isCompleted,
                draggable: item.kind === 'task' && !item.isCompleted,
                dragging: draggingTaskId === item.taskId,
              }"
              :draggable="item.kind === 'task' && !item.isCompleted"
              @dragstart="startTaskDrag(item.taskId, $event)"
              @dragover.prevent
              @drop.prevent="dropTask(item.taskId)"
              @dragend="draggingTaskId = null"
            >
              <span class="schedule-time" :class="{ unscheduled: !item.start }">
                {{ item.start ? formatTime(item.start) : '待安排' }}
              </span>
              <span class="schedule-rail">
                <span class="schedule-dot" :class="{ timeboxed: item.kind === 'timebox' }" />
              </span>
              <button class="schedule-copy schedule-open" @click="openTask(item.taskId)">
                <span class="schedule-title">{{ item.title }}</span>
                <span class="schedule-meta">
                  <span v-if="item.taskType" class="badge">{{ taskTypeLabels[item.taskType] }}</span>
                  <span>{{ formatDuration(item.duration) }}</span>
                  <span>· {{ item.statusLabel }}</span>
                </span>
              </button>
              <div class="schedule-actions">
                <template v-if="item.kind === 'task' && !item.isCompleted">
                  <button
                    class="icon-btn"
                    title="上移"
                    aria-label="上移今日任务"
                    @click="moveTodayTask(item.taskId, -1)"
                  >
                    <AppIcon name="arrow-up" :size="12" />
                  </button>
                  <button
                    class="icon-btn"
                    title="下移"
                    aria-label="下移今日任务"
                    @click="moveTodayTask(item.taskId, 1)"
                  >
                    <AppIcon name="arrow-down" :size="12" />
                  </button>
                </template>
                <button
                  class="icon-btn"
                  :title="item.start ? '调整时间盒' : '加入时间盒'"
                  :aria-label="item.start ? '调整时间盒' : '加入时间盒'"
                  @click="openScheduleEditor(item)"
                >
                  <AppIcon name="clock" :size="12" />
                </button>
                <button
                  v-if="!item.isCompleted"
                  class="icon-btn icon-btn-play"
                  title="开始学习"
                  aria-label="开始学习"
                  :disabled="item.taskStatus === null"
                  @click="goLearningForTask(item.taskId)"
                >
                  <AppIcon name="play" :size="12" />
                </button>
                <button
                  class="icon-btn"
                  :class="{ 'icon-btn-check': item.isCompleted }"
                  :title="item.isCompleted ? '恢复任务' : '完成任务'"
                  :aria-label="item.isCompleted ? '恢复任务' : '完成任务'"
                  :disabled="item.taskStatus === null"
                  @click="completeScheduleItem(item.taskId, item.isCompleted)"
                >
                  <AppIcon :name="item.isCompleted ? 'refresh' : 'check'" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="target" :size="16" />
              目标推进
              <span class="count-pill">{{ activeGoals.length }}</span>
            </h3>
            <button class="link-btn" @click="go('/goals')">
              目标与任务 <AppIcon name="arrow-right" :size="13" />
            </button>
          </div>
          <EmptyState
            v-if="!loading && goalProgressList.length === 0"
            title="还没有进行中的目标"
            description="从能力拆出一个目标，再用可执行任务推进它。"
          >
            <button class="btn btn-sm btn-secondary" @click="go('/goals')">去创建目标</button>
          </EmptyState>
          <ul v-else class="goal-progress-list">
            <li v-for="item in goalProgressList" :key="item.goal.id" class="goal-progress-item">
              <div class="goal-progress-head">
                <span class="goal-progress-name">{{ item.goal.title }}</span>
                <span class="goal-progress-pct">{{ item.progress }}%</span>
              </div>
              <div class="progress-track">
                <span class="progress-bar" :style="{ width: `${item.progress}%` }" />
              </div>
              <div class="goal-progress-meta">
                <span>{{ progressModeText(item.goal) }}</span>
                <span v-if="item.goal.dueDate">{{ relativeDay(item.goal.dueDate) }}</span>
              </div>
            </li>
          </ul>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="target" :size="16" />
              近期目标
            </h3>
            <button class="link-btn" @click="go('/goals')">
              目标拆解 <AppIcon name="arrow-right" :size="13" />
            </button>
          </div>
          <EmptyState
            v-if="!loading && upcomingGoals.length === 0"
            title="还没有设置截止日期的活跃目标"
            description="从发展路线的能力节点进入目标拆解，再把叶子目标落实为任务。"
          />
          <ul v-else class="hairline-list">
            <li v-for="goal in upcomingGoals" :key="goal.id">
              <button class="milestone-row milestone-open" @click="openGoal(goal.id)">
                <span class="milestone-mark"><AppIcon name="target" :size="14" /></span>
                <span class="milestone-main">
                  <span class="task-title">{{ goal.title }}</span>
                  <span class="task-meta">
                    <span class="badge badge-accent">{{ goalStatusLabels[goal.status] }}</span>
                    <span>{{ progressModeText(goal) }}</span>
                    <span>{{ formatShortDate(goal.dueDate) }}</span>
                  </span>
                </span>
                <span class="milestone-when">{{ relativeDay(goal.dueDate) }}</span>
              </button>
            </li>
          </ul>
        </article>
      </div>

      <div class="dashboard-col">
        <article class="card card-pad rhythm-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="spark" :size="16" />
              {{ summaryRangeLabel }}节奏
            </h3>
            <button class="link-btn" @click="go('/review')">复盘与洞察</button>
          </div>
          <div class="range-tabs" role="tablist" aria-label="成长摘要时间范围">
            <button
              class="range-tab"
              :class="{ active: summaryRange === 'week' }"
              role="tab"
              :aria-selected="summaryRange === 'week'"
              @click="changeSummaryRange('week')"
            >
              周
            </button>
            <button
              class="range-tab"
              :class="{ active: summaryRange === 'month' }"
              role="tab"
              :aria-selected="summaryRange === 'month'"
              @click="changeSummaryRange('month')"
            >
              月
            </button>
            <button
              class="range-tab"
              :class="{ active: summaryRange === 'quarter' }"
              role="tab"
              :aria-selected="summaryRange === 'quarter'"
              @click="changeSummaryRange('quarter')"
            >
              季
            </button>
          </div>
          <div class="week-grid">
            <div class="week-metric">
              <strong>{{ summaryStats.completedTasks }}</strong>
              <span>完成任务</span>
            </div>
            <div class="week-metric">
              <strong>{{ summaryStats.habitExecutions }}</strong>
              <span>习惯执行</span>
            </div>
            <div class="week-metric">
              <strong>{{ formatDuration(summaryStats.learningMinutes) }}</strong>
              <span>学习时长</span>
            </div>
          </div>
          <div class="review-status" :class="{ urgent: needsReview }">
            <div>
              <strong>
                {{
                  needsReview
                    ? daysSinceReview >= 900
                      ? '还没有复盘记录'
                      : `距离上次复盘 ${daysSinceReview} 天`
                    : todayReviewDone
                      ? '今天已完成每日复盘'
                      : '复盘节奏正常'
                }}
              </strong>
              <span>
                {{ needsReview ? '检查计划是否需要调整，而不是只记录感受。' : '继续记录真实执行，下一次复盘会更有依据。' }}
              </span>
            </div>
            <button
              class="btn btn-sm"
              :class="needsReview ? 'btn-primary' : 'btn-secondary'"
              @click="go('/review')"
            >
              {{ needsReview ? '去复盘' : '查看复盘' }}
            </button>
          </div>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="repeat" :size="16" />
              习惯 Check-in
            </h3>
            <span class="section-note">{{ checkedHabitsToday }}/{{ activeHabits.length }}</span>
          </div>
          <EmptyState
            v-if="!loading && activeHabits.length === 0"
            title="还没有启用的习惯"
            description="从一个足够小的行为开始，例如“打开论文阅读一个自然段”。"
          >
            <button class="btn btn-sm btn-secondary" @click="go('/habits')">去创建</button>
          </EmptyState>
          <ul v-else class="habit-list">
            <li v-for="habit in activeHabits.slice(0, 4)" :key="habit.id" class="habit-item">
              <span class="habit-check" :class="{ done: isHabitChecked(habit.id) }">
                <AppIcon v-if="isHabitChecked(habit.id)" name="check" :size="11" />
              </span>
              <div class="habit-copy">
                <p class="habit-name">{{ habit.name }}</p>
                <p class="habit-tiny">{{ habit.tinyBehavior }}</p>
              </div>
              <span v-if="isHabitChecked(habit.id)" class="habit-state done">已完成</span>
              <button
                v-else
                class="habit-quick"
                :aria-label="`快速打卡：${habit.name}`"
                @click="quickCheckHabit(habit)"
              >
                打卡
              </button>
            </li>
          </ul>
          <button class="card-footer-link" @click="go('/habits')">
            打开习惯中心
            <AppIcon name="arrow-right" :size="13" />
          </button>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="refresh" :size="16" />
              复习提醒
              <span class="count-pill count-amber">{{ dueReviews.length }}</span>
            </h3>
            <button class="link-btn" @click="go('/learning')">学习系统</button>
          </div>
          <EmptyState
            v-if="!loading && dueReviews.length === 0"
            title="没有到期的复习"
            description="复习到期不代表已经遗忘，只代表建议进行一次主动回忆。"
          />
          <ul v-else class="review-list">
            <li v-for="item in dueReviews.slice(0, 4)" :key="item.id" class="review-item">
              <span class="review-dot" />
              <button class="review-copy review-open" @click="openReview(item.id)">
                <span class="task-title">{{ knowledgeTitle(item.knowledgeItemId) }}</span>
                <span class="review-meta">
                  {{ formatShortDate(item.scheduledAt) }} 到期
                  <span v-if="item.externalTool">· {{ item.externalTool }}</span>
                </span>
              </button>
              <button class="review-start" @click="openReview(item.id)">开始回忆</button>
            </li>
          </ul>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="spark" :size="16" />
              最近成果
            </h3>
          </div>
          <EmptyState
            v-if="!loading && recentEvidence.length === 0"
            title="还没有成果证据"
            description="成果不只是勾选完成，而是能证明能力的真实产出。"
          />
          <ul v-else class="hairline-list">
            <li v-for="item in recentEvidence" :key="item.id" class="evidence-item">
              <span class="evidence-type">{{ evidenceTypeLabels[item.evidenceType] }}</span>
              <div>
                <p class="task-title">{{ item.title }}</p>
                <p class="evidence-note">{{ item.qualityNote || item.description }}</p>
              </div>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <ModalDialog
      :open="scheduleModalOpen"
      title="调整时间盒"
      subtitle="安排今天的开始时间和预计时长，冲突时会提示你。"
      @close="scheduleModalOpen = false"
    >
      <form class="schedule-editor" @submit.prevent="submitScheduleEditor">
        <p v-if="scheduleTarget()" class="schedule-editor-task">{{ scheduleTarget()?.title }}</p>
        <div class="schedule-editor-grid">
          <label class="field">
            <span class="field-label">开始时间</span>
            <input v-model="scheduleForm.start" class="input" type="time" required />
          </label>
          <label class="field">
            <span class="field-label">时长（分钟）</span>
            <input
              v-model.number="scheduleForm.duration"
              class="input"
              type="number"
              min="5"
              max="720"
              step="5"
              required
            />
          </label>
        </div>
        <p v-if="scheduleError" class="form-error">{{ scheduleError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="scheduleModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn btn-primary" :disabled="scheduleSaving">
            {{ scheduleSaving ? '保存中…' : '保存时间盒' }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr);
  gap: 28px;
  padding: 34px 34px 32px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(110% 150% at 0% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 52%),
    linear-gradient(135deg, var(--surface) 0%, var(--surface-muted) 100%);
  box-shadow: var(--shadow-sm);
}

.hero-glow {
  position: absolute;
  right: -90px;
  top: -130px;
  width: 330px;
  height: 330px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(154, 101, 32, 0.1), transparent 65%);
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 1;
}

.hero-eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.hero-title {
  margin-top: 12px;
  font-family: var(--font-serif);
  font-size: 34px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
}

.hero-sub {
  margin-top: 12px;
  max-width: 560px;
  color: var(--ink-soft);
  font-size: 13.5px;
  line-height: 1.75;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 22px;
}

.hero-focus {
  position: relative;
  z-index: 1;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-xs);
}

.focus-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focus-label {
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.focus-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 180px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
}

.focus-switch select {
  min-width: 0;
  max-width: 150px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.focus-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.focus-title {
  font-family: var(--font-serif);
  font-size: 19px;
  line-height: 1.45;
  font-weight: 600;
  color: var(--ink);
}

.focus-title-empty {
  font-size: 17px;
}

.focus-desc {
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-faint);
}

.focus-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.focus-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}

.focus-start {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  margin-top: auto;
  padding: 6px 0 2px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.focus-start:hover {
  color: var(--accent-hover);
}

.focus-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
}

.hero-focus-empty {
  justify-content: center;
  border-style: dashed;
  background: color-mix(in srgb, var(--surface) 50%, transparent);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.stat-icon-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.stat-icon-violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.stat-icon-blue {
  background: var(--blue-soft);
  color: var(--blue);
}

.stat-note {
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--muted);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.dashboard-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
}

.count-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
}

.link-btn:hover {
  color: var(--accent);
}

.skeleton-row {
  height: 44px;
}

.task-time {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.task-due {
  color: var(--amber);
}

.task-arrow {
  color: var(--line-strong);
  margin-top: 2px;
  transition: color 0.16s ease;
}

.task-row:hover .task-arrow {
  color: var(--accent);
}

.milestone-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: 100%;
  padding: 11px 0;
  text-align: left;
}

.milestone-open {
  border-radius: var(--radius-sm);
  transition: background-color 0.16s ease;
}

.milestone-open:hover {
  background: var(--surface-muted);
}

.milestone-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--amber-soft);
  color: var(--amber);
}

.milestone-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.milestone-when {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}

.habit-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.habit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.habit-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  color: transparent;
}

.habit-check.done {
  background: var(--success);
  border-color: var(--success);
  color: var(--on-accent);
}

.habit-copy {
  flex: 1;
  min-width: 0;
}

.habit-name {
  font-size: 12.5px;
  font-weight: 550;
}

.habit-tiny {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.habit-state {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
}

.habit-state.done {
  color: var(--accent);
}

.card-footer-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line-faint);
  width: 100%;
  color: var(--ink-faint);
  font-size: 11px;
  font-weight: 550;
}

.card-footer-link:hover {
  color: var(--accent);
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 0;
}

.review-dot {
  width: 6px;
  height: 6px;
  flex: none;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--amber);
}

.review-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.review-open {
  padding: 0;
}

.review-open:hover .task-title {
  color: var(--accent);
}

.review-start {
  align-self: center;
  flex: none;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--accent);
  font-size: 9.5px;
  font-weight: 600;
}

.review-start:hover {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.review-meta {
  font-size: 10.5px;
  color: var(--muted);
}

.evidence-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 0;
}

.evidence-type {
  flex: none;
  margin-top: 1px;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-faint);
  font-size: 9.5px;
  white-space: nowrap;
}

.evidence-note {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.onboarding {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.8fr);
  gap: 30px;
  padding: 30px;
}

.onboarding-title {
  margin-top: 8px;
  font-family: var(--font-serif);
  font-size: 22px;
  line-height: 1.5;
  font-weight: 600;
}

.onboarding-sub {
  margin-top: 8px;
  max-width: 620px;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.75;
}

.onboarding-steps {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
}

.onboarding-steps li {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 13px 0;
  border-top: 1px solid var(--line-faint);
}

.step-index {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
  padding-top: 1px;
}

.onboarding-steps li div {
  flex: 1;
}

.onboarding-steps strong {
  font-size: 13px;
  font-weight: 600;
}

.onboarding-steps p {
  margin-top: 2px;
  color: var(--muted);
  font-size: 11.5px;
}

.onboarding-side {
  align-self: start;
  padding: 22px;
  border-radius: var(--radius-lg);
  background: var(--inverse-surface);
  color: var(--inverse-ink);
}

.side-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--inverse-ink) 12%, transparent);
  color: color-mix(in srgb, var(--inverse-ink) 78%, transparent);
}

.onboarding-side h4 {
  margin-top: 14px;
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
}

.onboarding-side p {
  margin-top: 7px;
  color: var(--inverse-muted);
  font-size: 11.5px;
  line-height: 1.7;
}

.onboarding-side .btn {
  margin-top: 16px;
  width: 100%;
  background: var(--inverse-ink);
  color: var(--inverse-surface);
}

.side-note {
  font-size: 10px !important;
  color: color-mix(in srgb, var(--inverse-muted) 78%, transparent) !important;
}

@media (max-width: 1180px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-focus {
    max-width: 520px;
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .dashboard-grid,
  .onboarding {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero {
    padding: 26px 22px;
  }

  .hero-title {
    font-size: 28px;
  }
}

@media (max-width: 560px) {
  .stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .onboarding {
    padding: 22px;
  }

  .onboarding-steps li {
    flex-wrap: wrap;
  }
}
.resume-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: var(--accent-faint);
}

.resume-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
}

.resume-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.resume-copy strong {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent-ink);
}

.resume-copy p {
  color: var(--ink-faint);
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-progress-list {
  display: flex;
  flex-direction: column;
}

.goal-progress-item {
  padding: 10px 0;
  border-top: 1px solid var(--line-faint);
}

.goal-progress-item:first-child {
  border-top: none;
  padding-top: 0;
}

.goal-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.goal-progress-name {
  font-size: 11.5px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-progress-pct {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
}

.goal-progress-item .progress-track {
  margin-top: 5px;
}

.goal-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
  color: var(--muted);
  font-size: 9px;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.range-tabs {
  display: inline-flex;
  gap: 2px;
  margin-bottom: 9px;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
}

.range-tab {
  min-width: 34px;
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.range-tab:hover {
  color: var(--ink-soft);
}

.range-tab.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-xs);
}

.week-metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.week-metric strong {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.2;
}

.week-metric span {
  color: var(--muted);
  font-size: 9px;
}

.review-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--line-faint);
}

.review-status > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.review-status strong {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-soft);
}

.review-status span {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.5;
}

.review-status.urgent strong {
  color: var(--amber);
}

@media (max-width: 620px) {
  .week-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .resume-card {
    flex-wrap: wrap;
  }
}
.schedule-list {
  display: flex;
  flex-direction: column;
}

.schedule-item {
  display: flex;
  align-items: stretch;
  gap: 9px;
  width: 100%;
  padding: 9px 6px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.schedule-item:hover {
  background: var(--surface-muted);
}

.schedule-item.completed {
  opacity: 0.68;
}

.schedule-item.dragging {
  opacity: 0.45;
  background: var(--accent-faint);
}

.schedule-item.draggable {
  cursor: grab;
}

.schedule-item.draggable:active {
  cursor: grabbing;
}

.schedule-time {
  width: 46px;
  flex: none;
  padding-top: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-soft);
  text-align: right;
}

.schedule-time.unscheduled {
  font-family: var(--font-sans);
  font-size: 9px;
  color: var(--muted);
}

.schedule-rail {
  position: relative;
  width: 12px;
  flex: none;
  display: flex;
  justify-content: center;
}

.schedule-rail::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--line);
  transform: translateX(-50%);
}

.schedule-item:first-child .schedule-rail::before {
  top: 8px;
}

.schedule-item:last-child .schedule-rail::before {
  bottom: calc(100% - 8px);
}

.schedule-dot {
  position: relative;
  z-index: 1;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
}

.schedule-dot.timeboxed {
  border-color: var(--accent);
  background: var(--accent);
}

.schedule-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.schedule-open {
  padding: 0;
}

.schedule-open:hover .schedule-title {
  color: var(--accent);
}

.schedule-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-left: auto;
}

.schedule-actions .icon-btn {
  width: 24px;
  height: 24px;
}

.icon-btn-play {
  color: var(--violet);
}

.icon-btn-check {
  color: var(--success);
}

.schedule-title {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: var(--muted);
  font-size: 9px;
}

.schedule-arrow {
  flex: none;
  margin-top: 4px;
  color: var(--line-strong);
}

.schedule-item:hover .schedule-arrow {
  color: var(--accent);
}

.habit-quick {
  flex: none;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--accent);
  font-size: 9px;
  font-weight: 600;
}

.habit-quick:hover {
  background: var(--accent-faint);
  border-color: var(--accent);
}

.schedule-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.schedule-editor-task {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
}

.schedule-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.form-error {
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

@media (max-width: 620px) {
  .schedule-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 62px;
  }

  .schedule-editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
