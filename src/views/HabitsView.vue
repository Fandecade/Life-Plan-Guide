<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import HabitsFocusMap from '@/components/HabitsFocusMap.vue'
import { useToast } from '@/composables/useToast'
import { useHabits, type HabitInput, type HabitLogInput } from '@/composables/useHabits'
import {
  AnchorType,
  HabitCategory,
  HabitStatus,
  PromptStatus,
  anchorTypeLabels,
  habitCategoryLabels,
  habitStatusLabels,
  promptStatusLabels,
  type Habit,
  type HabitLog,
} from '@/domain'
import { formatDateTime, formatShortDate } from '@/utils/date'

const { success, error: toastError } = useToast()

const {
  loading,
  error,
  includeArchived,
  activeHabits,
  visibleHabits,
  todayLogByHabit,
  stats,
  diagnostics,
  heatmapDays,
  weekCalendarDays,
  trendPoints,
  trendSummary,
  logsOnDay,
  streakFor,
  heatmapFor,
  historyFor,
  logForToday,
  refresh,
  saveHabit,
  setHabitStatus,
  setArchived,
  saveLog,
} = useHabits()

type HabitsView = 'today' | 'week' | 'trend' | 'focusmap' | 'library'
const activeView = ref<HabitsView>('today')

const categories = Object.values(HabitCategory)
const anchorTypes = Object.values(AnchorType)
const promptStatuses = Object.values(PromptStatus)
const formStatuses = [HabitStatus.DRAFT, HabitStatus.ACTIVE, HabitStatus.PAUSED]

const ratingOptions = [
  { value: 1, label: '1 · 很低' },
  { value: 2, label: '2 · 偏低' },
  { value: 3, label: '3 · 一般' },
  { value: 4, label: '4 · 较高' },
  { value: 5, label: '5 · 很高' },
]

const difficultyOptions = [
  { value: 1, label: '1 · 非常容易' },
  { value: 2, label: '2 · 容易' },
  { value: 3, label: '3 · 一般' },
  { value: 4, label: '4 · 困难' },
  { value: 5, label: '5 · 非常困难' },
]

interface HabitForm {
  name: string
  description: string
  category: HabitCategory
  anchorType: AnchorType
  anchorDescription: string
  tinyBehavior: string
  celebration: string
  motivationLevel: number
  abilityLevel: number
  promptStatus: PromptStatus
  frequency: string
  status: HabitStatus
}

function emptyHabitForm(): HabitForm {
  return {
    name: '',
    description: '',
    category: HabitCategory.STARTER,
    anchorType: AnchorType.EVENT,
    anchorDescription: '',
    tinyBehavior: '',
    celebration: '',
    motivationLevel: 3,
    abilityLevel: 4,
    promptStatus: PromptStatus.PARTIAL,
    frequency: '每天',
    status: HabitStatus.ACTIVE,
  }
}

const habitForm = reactive<HabitForm>(emptyHabitForm())
const habitEditingId = ref<string | null>(null)
const habitModalOpen = ref(false)
const formError = ref('')
const saving = ref(false)

const formulaPreview = computed(
  () =>
    `${habitForm.anchorDescription || '［某个已有行为之后］'}，我就 ${
      habitForm.tinyBehavior || '［一个足够小的行为］'
    }，然后 ${habitForm.celebration || '［给自己一个即时庆祝］'}。`,
)

function openHabitCreate(): void {
  habitEditingId.value = null
  Object.assign(habitForm, emptyHabitForm())
  formError.value = ''
  habitModalOpen.value = true
}

function openHabitEdit(habit: Habit): void {
  habitEditingId.value = habit.id
  Object.assign(habitForm, {
    name: habit.name,
    description: habit.description,
    category: habit.category,
    anchorType: habit.anchorType,
    anchorDescription: habit.anchorDescription,
    tinyBehavior: habit.tinyBehavior,
    celebration: habit.celebration,
    motivationLevel: habit.motivationLevel,
    abilityLevel: habit.abilityLevel,
    promptStatus: habit.promptStatus,
    frequency: habit.frequency,
    status: habit.status,
  })
  formError.value = ''
  habitModalOpen.value = true
}

async function submitHabit(): Promise<void> {
  formError.value = ''
  if (!habitForm.name.trim()) {
    formError.value = '习惯名称不能为空'
    return
  }
  if (!habitForm.anchorDescription.trim()) {
    formError.value = '请写清楚锚点：在什么已有行为之后开始'
    return
  }
  if (!habitForm.tinyBehavior.trim()) {
    formError.value = '请写清楚一个足够小的微行为'
    return
  }
  saving.value = true
  try {
    const payload: HabitInput = {
      name: habitForm.name.trim(),
      description: habitForm.description.trim(),
      category: habitForm.category,
      anchorType: habitForm.anchorType,
      anchorDescription: habitForm.anchorDescription.trim(),
      tinyBehavior: habitForm.tinyBehavior.trim(),
      celebration: habitForm.celebration.trim(),
      motivationLevel: Number(habitForm.motivationLevel),
      abilityLevel: Number(habitForm.abilityLevel),
      promptStatus: habitForm.promptStatus,
      frequency: habitForm.frequency.trim(),
      status: habitForm.status,
    }
    await saveHabit(payload, habitEditingId.value ?? undefined)
    habitModalOpen.value = false
    success(habitEditingId.value ? '习惯配方已更新' : '习惯配方已创建')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const logModalOpen = ref(false)
const logHabit = ref<Habit | null>(null)
const logEditingId = ref<string | null>(null)
const logForm = reactive({
  anchorTriggered: true,
  tinyCompleted: true,
  expandedCompleted: false,
  celebrationDone: true,
  difficulty: 2,
  obstacle: '',
  note: '',
})

function openLog(habit: Habit, mode: 'tiny' | 'expanded' = 'tiny'): void {
  logHabit.value = habit
  const existing = logForToday(habit.id)
  if (existing) {
    logEditingId.value = existing.id
    Object.assign(logForm, {
      anchorTriggered: existing.anchorTriggered,
      tinyCompleted: existing.tinyCompleted || mode === 'tiny',
      expandedCompleted: existing.expandedCompleted || mode === 'expanded',
      celebrationDone: existing.celebrationDone,
      difficulty: existing.difficulty,
      obstacle: existing.obstacle,
      note: existing.note,
    })
  } else {
    logEditingId.value = null
    Object.assign(logForm, {
      anchorTriggered: true,
      tinyCompleted: mode === 'tiny',
      expandedCompleted: mode === 'expanded',
      celebrationDone: true,
      difficulty: 2,
      obstacle: '',
      note: '',
    })
  }
  formError.value = ''
  logModalOpen.value = true
}

async function submitLog(): Promise<void> {
  const habit = logHabit.value
  if (!habit) return
  formError.value = ''
  saving.value = true
  try {
    const existing = logForToday(habit.id)
    const payload: HabitLogInput = {
      habitId: habit.id,
      occurredAt: existing?.occurredAt ?? new Date().toISOString(),
      anchorTriggered: logForm.anchorTriggered,
      tinyCompleted: logForm.tinyCompleted,
      expandedCompleted: logForm.expandedCompleted,
      celebrationDone: logForm.celebrationDone,
      difficulty: Number(logForm.difficulty),
      obstacle: logForm.obstacle.trim(),
      note: logForm.note.trim(),
    }
    await saveLog(payload, logEditingId.value ?? undefined)
    logModalOpen.value = false
    success(logForm.tinyCompleted ? '今日微习惯已完成' : '今日执行记录已保存')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const historyOpen = ref(false)
const historyHabit = ref<Habit | null>(null)

const historyLogs = computed(() =>
  historyHabit.value ? historyFor(historyHabit.value.id) : [],
)

function openHistory(habit: Habit): void {
  historyHabit.value = habit
  historyOpen.value = true
}

const heatmaps = computed<Record<string, Set<string>>>(() => {
  const map: Record<string, Set<string>> = {}
  for (const habit of activeHabits.value) {
    map[habit.id] = heatmapFor(habit.id)
  }
  return map
})

const bestStreakHabit = computed(() => {
  let best: { habit: Habit; streak: number } | null = null
  for (const habit of activeHabits.value) {
    const streak = streakFor(habit.id)
    if (!best || streak > best.streak) best = { habit, streak }
  }
  return best
})

const trendMax = computed(() =>
  Math.max(1, ...trendPoints.value.map((point) => point.tinyCompleted)),
)

const weekTotals = computed(() => {
  let recorded = 0
  let completed = 0
  for (const habit of activeHabits.value) {
    for (const day of weekCalendarDays.value) {
      const logs = logsOnDay(habit.id, day.key)
      recorded += logs.length
      completed += logs.filter((log) => log.tinyCompleted).length
    }
  }
  return { recorded, completed }
})

function dayLog(habitId: string, dayKey: string): HabitLog | undefined {
  return logsOnDay(habitId, dayKey).sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  )[0]
}

function openWeekCell(
  habit: Habit,
  day: { key: string; isToday: boolean; isFuture: boolean },
): void {
  if (day.isFuture) return
  if (day.isToday) openLog(habit, 'tiny')
  else openHistory(habit)
}

function percentage(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}


async function toggleStatus(habit: Habit): Promise<void> {
  try {
    const next =
      habit.status === HabitStatus.ACTIVE ? HabitStatus.PAUSED : HabitStatus.ACTIVE
    await setHabitStatus(habit.id, next)
    success(next === HabitStatus.ACTIVE ? '习惯已启用' : '习惯已暂停，历史记录仍保留')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{ id: string; label: string; archived: boolean } | null>(null)

const confirmTitle = computed(() =>
  confirmTarget.value?.archived ? '恢复习惯' : '归档习惯',
)

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在配方库与今日打卡中。`
  return `将归档「${target.label}」。历史执行记录会保留，归档后可以随时恢复。`
})

function askArchive(habit: Habit): void {
  confirmTarget.value = {
    id: habit.id,
    label: habit.name,
    archived: Boolean(habit.archivedAt),
  }
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    await setArchived(target.id, !target.archived)
    success(target.archived ? '已恢复' : '已归档，历史记录保留')
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

function logSummary(habitId: string): HabitLog | undefined {
  return todayLogByHabit.value[habitId]
}

function onHabitCreatedFromMap(): void {
  void refresh()
}

function statusClass(habit: Habit): string {
  return `habit-status-${habit.status.toLowerCase()}`
}

function ratingWidth(value: number): string {
  return `${(value / 5) * 100}%`
}

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  await refresh()
  if (String(route.query.create ?? '') === 'habit') {
    openHabitCreate()
    await router.replace('/habits')
  }
})
</script>

<template>
  <div class="page habits">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">执行与学习 · 行为与习惯</p>
        <h2 class="page-title">行为与习惯</h2>
        <p class="page-subtitle">
          用福格行为模型降低行动阻力：找到锚点，把行为缩小，完成后立即庆祝。习惯不是任务，微习惯完成不等于任务完成。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" @click="openHabitCreate">
          <AppIcon name="plus" :size="15" />
          新建习惯
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="habit-stats">
      <div class="habit-stat">
        <span class="stat-icon"><AppIcon name="repeat" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.active }}</span>
          <span class="stat-caption">启用习惯</span>
        </div>
      </div>
      <div class="habit-stat">
        <span class="stat-icon icon-accent"><AppIcon name="check" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.todayDone }} / {{ stats.active }}</span>
          <span class="stat-caption">今日微行为完成</span>
        </div>
      </div>
      <div class="habit-stat">
        <span class="stat-icon icon-amber"><AppIcon name="calendar" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.weekExecutions }}</span>
          <span class="stat-caption">近 7 天执行</span>
        </div>
      </div>
      <div class="habit-stat">
        <span class="stat-icon icon-violet"><AppIcon name="spark" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.bestStreak }} 天</span>
          <span class="stat-caption">
            {{ bestStreakHabit?.habit.name ?? '还没有连续记录' }}
          </span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar">
      <div class="view-tabs" role="tablist" aria-label="习惯视图">
        <button
          class="view-tab"
          :class="{ active: activeView === 'today' }"
          role="tab"
          :aria-selected="activeView === 'today'"
          @click="activeView = 'today'"
        >
          <AppIcon name="check" :size="15" />
          今日打卡
          <span class="tab-count">{{ activeHabits.length }}</span>
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'focusmap' }"
          role="tab"
          :aria-selected="activeView === 'focusmap'"
          @click="activeView = 'focusmap'"
        >
          <AppIcon name="map" :size="15" />
          焦点地图
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'week' }"
          role="tab"
          :aria-selected="activeView === 'week'"
          @click="activeView = 'week'"
        >
          <AppIcon name="calendar" :size="15" />
          周历
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'trend' }"
          role="tab"
          :aria-selected="activeView === 'trend'"
          @click="activeView = 'trend'"
        >
          <AppIcon name="dashboard" :size="15" />
          趋势与诊断
          <span class="tab-count">{{ diagnostics.length }}</span>
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'library' }"
          role="tab"
          :aria-selected="activeView === 'library'"
          @click="activeView = 'library'"
        >
          <AppIcon name="layers" :size="15" />
          配方库
          <span class="tab-count">{{ visibleHabits.length }}</span>
        </button>
      </div>

      <div class="toolbar-actions">
        <button
          class="btn btn-ghost"
          :class="{ 'is-on': includeArchived }"
          :aria-pressed="includeArchived"
          @click="includeArchived = !includeArchived"
        >
          <AppIcon name="archive" :size="14" />
          {{ includeArchived ? '隐藏已归档' : '显示已归档' }}
        </button>
      </div>
    </section>

    <div v-if="loading" class="skeleton habits-loading" />

    <template v-else>
      <section v-if="activeView === 'focusmap'" class="focusmap-view">
        <HabitsFocusMap @habit-created="onHabitCreatedFromMap" />
      </section>

      <section v-else-if="activeView === 'today'" class="today-view">
        <div class="today-note">
          <span class="note-mark"><AppIcon name="spark" :size="15" /></span>
          <div>
            <strong>微习惯也算完成。</strong>
            <span>先完成“打开论文阅读一个自然段”，不需要一次完成整篇论文。扩展行为与任务完成分开记录。</span>
          </div>
        </div>

        <EmptyState
          v-if="activeHabits.length === 0"
          title="还没有启用的习惯"
          description="从一个足够小的行为开始，例如“坐到书桌后打开论文阅读一个自然段”。"
        >
          <button class="btn btn-sm btn-secondary" @click="openHabitCreate">创建第一个习惯</button>
        </EmptyState>

        <div v-else class="habit-grid">
          <article
            v-for="habit in activeHabits"
            :key="habit.id"
            class="habit-card card"
            :class="{ done: logSummary(habit.id)?.tinyCompleted }"
          >
            <div class="habit-card-top">
              <span class="badge badge-accent">{{ habitCategoryLabels[habit.category] }}</span>
              <span class="badge">{{ habit.frequency }}</span>
              <span class="habit-streak" :title="`连续 ${streakFor(habit.id)} 天`">
                <AppIcon name="spark" :size="11" />
                {{ streakFor(habit.id) }} 天
              </span>
            </div>

            <h4 class="habit-name">{{ habit.name }}</h4>
            <p v-if="habit.description" class="habit-desc">{{ habit.description }}</p>

            <div class="habit-formula">
              <div class="formula-part">
                <span class="formula-label">Prompt</span>
                <span class="formula-text">{{ habit.anchorDescription }}</span>
              </div>
              <AppIcon name="arrow-right" :size="12" class="formula-arrow" />
              <div class="formula-part">
                <span class="formula-label">Tiny</span>
                <span class="formula-text">{{ habit.tinyBehavior }}</span>
              </div>
              <AppIcon name="arrow-right" :size="12" class="formula-arrow" />
              <div class="formula-part">
                <span class="formula-label">Celebrate</span>
                <span class="formula-text">{{ habit.celebration || '给自己一个即时反馈' }}</span>
              </div>
            </div>

            <div class="habit-check-row">
              <button class="micro-check" @click="openLog(habit, 'tiny')">
                <span class="micro-circle" :class="{ checked: logSummary(habit.id)?.tinyCompleted }">
                  <AppIcon v-if="logSummary(habit.id)?.tinyCompleted" name="check" :size="13" />
                </span>
                <span class="micro-copy">
                  <strong>{{ logSummary(habit.id)?.tinyCompleted ? '今日微行为已完成' : '完成微行为' }}</strong>
                  <small>{{ habit.tinyBehavior }}</small>
                </span>
              </button>
              <button class="expanded-btn" @click="openLog(habit, 'expanded')">
                <AppIcon name="plus" :size="12" />
                记录扩展行为
              </button>
            </div>

            <div v-if="logSummary(habit.id)" class="log-summary">
              <span class="log-badge" :class="{ done: logSummary(habit.id)?.anchorTriggered }">
                锚点 {{ logSummary(habit.id)?.anchorTriggered ? '✓' : '—' }}
              </span>
              <span class="log-badge" :class="{ done: logSummary(habit.id)?.tinyCompleted }">
                微行为 {{ logSummary(habit.id)?.tinyCompleted ? '✓' : '—' }}
              </span>
              <span class="log-badge" :class="{ done: logSummary(habit.id)?.expandedCompleted }">
                扩展 {{ logSummary(habit.id)?.expandedCompleted ? '✓' : '—' }}
              </span>
              <span class="log-badge" :class="{ done: logSummary(habit.id)?.celebrationDone }">
                庆祝 {{ logSummary(habit.id)?.celebrationDone ? '✓' : '—' }}
              </span>
              <span class="log-difficulty">难度 {{ logSummary(habit.id)?.difficulty }}/5</span>
            </div>

            <div class="habit-capabilities">
              <span>M <i :style="{ width: ratingWidth(habit.motivationLevel) }" /></span>
              <span>A <i :style="{ width: ratingWidth(habit.abilityLevel) }" /></span>
              <span>P <i :style="{ width: ratingWidth(habit.promptStatus === 'CLEAR' ? 5 : habit.promptStatus === 'PARTIAL' ? 3 : 1) }" /></span>
            </div>

            <div class="habit-foot">
              <button class="link-btn" @click="openHistory(habit)">
                历史记录
                <AppIcon name="arrow-right" :size="12" />
              </button>
              <button class="link-btn" @click="openHabitEdit(habit)">
                编辑配方
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'week'" class="week-view">
        <div class="week-summary card">
          <div>
            <p class="page-eyebrow">This Week · Tracker</p>
            <h3 class="section-title">
              <AppIcon name="calendar" :size="16" />
              本周习惯周历
            </h3>
            <p class="section-note">
              每格展示一次可追溯的执行记录。点击今天可打卡，点击过去日期可查看当天历史。
            </p>
          </div>
          <div class="week-summary-stats">
            <div><strong>{{ weekTotals.completed }}</strong><span>完成记录</span></div>
            <div><strong>{{ weekTotals.recorded }}</strong><span>总记录</span></div>
            <div><strong>{{ activeHabits.length }}</strong><span>启用习惯</span></div>
          </div>
        </div>

        <EmptyState
          v-if="activeHabits.length === 0"
          title="没有启用中的习惯"
          description="启用习惯后，周历会按天展示每个微行为的执行状态。"
        />

        <div v-else class="habit-week-board card">
          <div class="habit-week-head">
            <span class="habit-week-corner">习惯</span>
            <button
              v-for="day in weekCalendarDays"
              :key="day.key"
              class="habit-week-day"
              :class="{ today: day.isToday, future: day.isFuture }"
              @click="activeView = 'today'"
            >
              <span>周{{ day.weekday }}</span>
              <strong>{{ day.label }}</strong>
              <small>{{ day.isToday ? '今天' : day.isFuture ? '待开始' : day.dateLabel }}</small>
            </button>
          </div>
          <div v-for="habit in activeHabits" :key="habit.id" class="habit-week-row">
            <div class="habit-week-name">
              <strong>{{ habit.name }}</strong>
              <span>{{ habit.frequency }}</span>
            </div>
            <button
              v-for="day in weekCalendarDays"
              :key="day.key"
              class="habit-week-cell"
              :class="{
                today: day.isToday,
                future: day.isFuture,
                done: dayLog(habit.id, day.key)?.tinyCompleted,
                missed:
                  !day.isFuture && !dayLog(habit.id, day.key)?.tinyCompleted && !day.isToday,
                recorded: Boolean(dayLog(habit.id, day.key)),
              }"
              :disabled="day.isFuture"
              :title="`${habit.name} · ${day.label} · ${
                dayLog(habit.id, day.key)?.tinyCompleted
                  ? '微行为完成'
                  : dayLog(habit.id, day.key)
                    ? '已记录但未完成'
                    : day.isFuture
                      ? '尚未开始'
                      : '未记录'
              }`"
              @click="openWeekCell(habit, day)"
            >
              <AppIcon
                v-if="dayLog(habit.id, day.key)?.tinyCompleted"
                name="check"
                :size="13"
              />
              <span v-else-if="dayLog(habit.id, day.key)" class="week-cell-state">—</span>
              <span v-else class="week-cell-dot" />
            </button>
          </div>
          <footer class="habit-week-legend">
            <span><i class="legend-dot done" />微行为完成</span>
            <span><i class="legend-dot recorded" />已记录未完成</span>
            <span><i class="legend-dot missed" />过去未记录</span>
            <span><i class="legend-dot future" />未来</span>
          </footer>
        </div>
      </section>

      <section v-else-if="activeView === 'library'" class="library-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="layers" :size="16" />
              习惯配方库
            </h3>
            <p class="section-note">草拟、启用、暂停与归档分开；暂停不会清空历史。</p>
          </div>
          <button class="btn btn-sm btn-secondary" @click="openHabitCreate">
            <AppIcon name="plus" :size="14" />
            新建配方
          </button>
        </div>

        <EmptyState
          v-if="visibleHabits.length === 0"
          title="配方库还是空的"
          description="用 Prompt → Tiny Behavior → Celebration 创建第一个行为配方。"
        >
          <button class="btn btn-sm btn-secondary" @click="openHabitCreate">创建配方</button>
        </EmptyState>

        <div v-else class="library-grid">
          <article
            v-for="habit in visibleHabits"
            :key="habit.id"
            class="library-card card"
            :class="{ archived: habit.archivedAt }"
          >
            <div class="library-top">
              <div class="library-title">
                <span class="library-mark"><AppIcon name="repeat" :size="15" /></span>
                <div>
                  <h4>{{ habit.name }}</h4>
                  <span class="library-sub">
                    {{ habitCategoryLabels[habit.category] }} ·
                    {{ anchorTypeLabels[habit.anchorType] }}
                  </span>
                </div>
              </div>
              <span class="badge" :class="statusClass(habit)">{{ habitStatusLabels[habit.status] }}</span>
            </div>

            <p class="library-formula">
              <span>{{ habit.anchorDescription }}</span>
              <AppIcon name="arrow-right" :size="11" />
              <span>{{ habit.tinyBehavior }}</span>
              <AppIcon name="arrow-right" :size="11" />
              <span>{{ habit.celebration }}</span>
            </p>

            <div class="library-metrics">
              <span>动机 {{ habit.motivationLevel }}/5</span>
              <span>容易度 {{ habit.abilityLevel }}/5</span>
              <span>提示 {{ promptStatusLabels[habit.promptStatus] }}</span>
            </div>

            <div class="library-foot">
              <span class="library-frequency">{{ habit.frequency }}</span>
              <div class="row-actions">
                <button
                  v-if="!habit.archivedAt && habit.status !== 'PAUSED'"
                  class="icon-btn"
                  title="暂停习惯"
                  aria-label="暂停习惯"
                  @click="toggleStatus(habit)"
                >
                  <AppIcon name="clock" :size="14" />
                </button>
                <button
                  v-else-if="!habit.archivedAt"
                  class="icon-btn"
                  title="启用习惯"
                  aria-label="启用习惯"
                  @click="toggleStatus(habit)"
                >
                  <AppIcon name="play" :size="14" />
                </button>
                <button
                  v-if="!habit.archivedAt"
                  class="icon-btn"
                  title="编辑配方"
                  aria-label="编辑配方"
                  @click="openHabitEdit(habit)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="habit.archivedAt ? '恢复习惯' : '归档习惯'"
                  :aria-label="habit.archivedAt ? '恢复习惯' : '归档习惯'"
                  @click="askArchive(habit)"
                >
                  <AppIcon :name="habit.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="trend-view">
        <article class="trend-metrics">
          <div class="trend-metric card">
            <span class="metric-label">微行为完成率</span>
            <strong>{{ percentage(trendSummary.tinyRate) }}</strong>
            <span>近 7 天有记录中的完成比例</span>
            <i :style="{ width: trendSummary.tinyRate === null ? '0%' : `${trendSummary.tinyRate * 100}%` }" />
          </div>
          <div class="trend-metric card">
            <span class="metric-label">扩展行为完成率</span>
            <strong>{{ percentage(trendSummary.expandedRate) }}</strong>
            <span>在微行为完成后继续扩展的比例</span>
            <i :style="{ width: trendSummary.expandedRate === null ? '0%' : `${trendSummary.expandedRate * 100}%` }" />
          </div>
          <div class="trend-metric card">
            <span class="metric-label">锚点触发率</span>
            <strong>{{ percentage(trendSummary.anchorRate) }}</strong>
            <span>记录时锚点实际出现的比例</span>
            <i :style="{ width: trendSummary.anchorRate === null ? '0%' : `${trendSummary.anchorRate * 100}%` }" />
          </div>
          <div class="trend-metric card">
            <span class="metric-label">最常见阻碍</span>
            <strong class="metric-obstacle">{{ trendSummary.topObstacle }}</strong>
            <span>{{ trendSummary.topObstacleCount }} 条相关记录</span>
          </div>
        </article>

        <article class="card card-pad trend-chart-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="dashboard" :size="16" />
                最近 14 天趋势
              </h3>
              <p class="section-note">
                样本 {{ trendSummary.sampleCount }} 条。柱状图只展示微行为完成数量，不代表能力增长。
              </p>
            </div>
          </div>
          <div v-if="trendSummary.sampleCount === 0" class="data-pending">
            <AppIcon name="clock" :size="15" />
            数据积累中：完成几次打卡后，这里会显示可比较的趋势。
          </div>
          <div v-else class="trend-bars">
            <div v-for="point in trendPoints" :key="point.key" class="trend-column">
              <span class="trend-value">{{ point.tinyCompleted }}</span>
              <div class="trend-track">
                <i :style="{ height: `${Math.max(4, (point.tinyCompleted / trendMax) * 100)}%` }" />
              </div>
              <span class="trend-date" :class="{ today: point.isToday }">{{ point.label }}</span>
            </div>
          </div>
        </article>

        <article class="card card-pad map-distribution-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="bulb" :size="16" />
                M / A / P 线索分布
              </h3>
              <p class="section-note">
                根据锚点、难度、阻碍和备注做规则推断，仅用于提示观察方向，不是心理测量。
              </p>
            </div>
            <span class="badge">样本 {{ trendSummary.mapSamples }} 条</span>
          </div>
          <div class="map-distribution">
            <div class="map-dist-item map-m">
              <strong>M</strong>
              <span>动机线索</span>
              <b>{{ trendSummary.mapCounts.M }}</b>
            </div>
            <div class="map-dist-item map-a">
              <strong>A</strong>
              <span>能力 / 难度线索</span>
              <b>{{ trendSummary.mapCounts.A }}</b>
            </div>
            <div class="map-dist-item map-p">
              <strong>P</strong>
              <span>提示未出现</span>
              <b>{{ trendSummary.mapCounts.P }}</b>
            </div>
          </div>
          <p class="map-rule-note">
            规则：P = 锚点未触发；A = 难度 ≥ 4；M = 阻碍或备注含动机相关描述，或低难度但未完成。同一条记录可能同时命中多个线索。
          </p>
        </article>

        <article class="card card-pad heatmap-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="dashboard" :size="16" />
                最近 14 天执行
              </h3>
              <p class="section-note">只显示启用的习惯；每格代表微行为是否完成。</p>
            </div>
            <span class="section-note">
              近 7 天平均难度 {{ stats.avgDifficulty ? stats.avgDifficulty.toFixed(1) : '—' }}
            </span>
          </div>

          <EmptyState
            v-if="activeHabits.length === 0"
            title="没有启用中的习惯"
            description="启用一个习惯后，这里会显示执行热力图。"
          />

          <div v-else class="heatmap">
            <div class="heatmap-head">
              <span class="heatmap-label" />
              <span
                v-for="day in heatmapDays"
                :key="day.key"
                class="heatmap-day"
                :class="{ today: day.isToday }"
              >
                {{ day.weekday }}
              </span>
            </div>
            <div v-for="habit in activeHabits" :key="habit.id" class="heatmap-row">
              <span class="heatmap-label" :title="habit.name">{{ habit.name }}</span>
              <span
                v-for="day in heatmapDays"
                :key="day.key"
                class="heatmap-cell"
                :class="{
                  filled: heatmaps[habit.id]?.has(day.key),
                  today: day.isToday,
                }"
                :title="`${day.label} ${heatmaps[habit.id]?.has(day.key) ? '已完成' : '未记录'}`"
              />
            </div>
            <div class="heatmap-legend">
              <span class="legend-cell" /> 未记录
              <span class="legend-cell filled" /> 微行为完成
              <span class="legend-today" /> 今天
            </div>
          </div>
        </article>

        <article class="card card-pad diagnosis-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="bulb" :size="16" />
                M / A / P 行为诊断
              </h3>
              <p class="section-note">系统只给建议。是否调整配方，由你确认后执行。</p>
            </div>
            <span class="badge">{{ diagnostics.length }} 个待观察</span>
          </div>

          <div class="diagnosis-note">
            <AppIcon name="warning" :size="14" />
            不要只根据打卡数据判断动机。未执行也可能来自知识不足、任务依赖或现实时间冲突。
          </div>

          <EmptyState
            v-if="diagnostics.length === 0"
            title="最近执行比较稳定"
            description="继续积累记录；如果连续中断，再回来检查提示、能力和动机。"
          />

          <div v-else class="diagnosis-list">
            <article v-for="item in diagnostics" :key="item.habit.id" class="diagnosis-item">
              <div class="diagnosis-head">
                <span class="diagnosis-habit">{{ item.habit.name }}</span>
                <button class="btn btn-sm btn-secondary" @click="openHabitEdit(item.habit)">
                  调整配方
                </button>
              </div>
              <div class="diagnosis-suggestions">
                <div
                  v-for="suggestion in item.suggestions"
                  :key="suggestion.type"
                  class="suggestion"
                  :class="`suggestion-${suggestion.type.toLowerCase()}`"
                >
                  <span class="suggestion-type">{{ suggestion.type }}</span>
                  <div>
                    <p class="suggestion-title">{{ suggestion.title }}</p>
                    <p class="suggestion-reason">{{ suggestion.reason }}</p>
                    <p class="suggestion-action">{{ suggestion.action }}</p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </article>

        <div class="insight-note">
          <AppIcon name="check" :size="14" />
          习惯完成不会自动完成任务，也不会自动提升能力等级。任务、习惯与能力证据始终分开记录。
        </div>
      </section>
    </template>

    <ModalDialog
      :open="habitModalOpen"
      :title="habitEditingId ? '编辑习惯配方' : '创建习惯配方'"
      subtitle="B = MAP：行为发生在动机、能力与提示同时足够的时候。"
      size="lg"
      @close="habitModalOpen = false"
    >
      <form class="form" @submit.prevent="submitHabit">
        <div class="field">
          <label class="field-label" for="habit-name">习惯名称</label>
          <input id="habit-name" v-model="habitForm.name" class="input" placeholder="例如：打开论文阅读一个自然段" />
        </div>
        <div class="field">
          <label class="field-label" for="habit-desc">说明（可选）</label>
          <textarea id="habit-desc" v-model="habitForm.description" class="textarea" />
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="habit-category">习惯类型</label>
            <select id="habit-category" v-model="habitForm.category" class="select">
              <option v-for="category in categories" :key="category" :value="category">
                {{ habitCategoryLabels[category] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="habit-frequency">重复频率</label>
            <input id="habit-frequency" v-model="habitForm.frequency" class="input" />
          </div>
          <div class="field">
            <label class="field-label" for="habit-status">状态</label>
            <select id="habit-status" v-model="habitForm.status" class="select">
              <option v-for="status in formStatuses" :key="status" :value="status">
                {{ habitStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <div class="formula-section">
          <div class="formula-section-head">
            <span class="formula-step">1</span>
            <div>
              <h4>Prompt · 找到锚点</h4>
              <p>在什么已有行为之后开始？锚点越具体，越容易被触发。</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="habit-anchor-type">锚点类型</label>
              <select id="habit-anchor-type" v-model="habitForm.anchorType" class="select">
                <option v-for="type in anchorTypes" :key="type" :value="type">
                  {{ anchorTypeLabels[type] }}
                </option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="habit-anchor">锚点描述</label>
              <input id="habit-anchor" v-model="habitForm.anchorDescription" class="input" placeholder="每天早上坐到书桌前" />
            </div>
          </div>
        </div>

        <div class="formula-section">
          <div class="formula-section-head">
            <span class="formula-step">2</span>
            <div>
              <h4>Behavior · 缩小行为</h4>
              <p>小到即使状态不好也能完成。微行为和扩展行为分开记录。</p>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="habit-tiny">微行为</label>
            <input id="habit-tiny" v-model="habitForm.tinyBehavior" class="input" placeholder="打开论文并阅读一个自然段" />
          </div>
        </div>

        <div class="formula-section">
          <div class="formula-section-head">
            <span class="formula-step">3</span>
            <div>
              <h4>Celebration · 即时庆祝</h4>
              <p>完成后立刻给自己一个积极反馈，让行为更容易重复。</p>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="habit-celebration">庆祝方式</label>
            <input id="habit-celebration" v-model="habitForm.celebration" class="input" placeholder="对自己说：很好，我已经开始了。" />
          </div>
        </div>

        <div class="formula-preview">
          <span class="preview-label">行为配方</span>
          <p>{{ formulaPreview }}</p>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="habit-motivation">动机自评</label>
            <select id="habit-motivation" v-model.number="habitForm.motivationLevel" class="select">
              <option v-for="option in ratingOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="habit-ability">容易程度</label>
            <select id="habit-ability" v-model.number="habitForm.abilityLevel" class="select">
              <option v-for="option in ratingOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="habit-prompt-status">提示是否明确</label>
            <select id="habit-prompt-status" v-model="habitForm.promptStatus" class="select">
              <option v-for="status in promptStatuses" :key="status" :value="status">
                {{ promptStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="habitModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : habitEditingId ? '保存修改' : '创建习惯' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="logModalOpen"
      :title="logEditingId ? '编辑今日记录' : '记录今日执行'"
      :subtitle="logHabit?.name"
      @close="logModalOpen = false"
    >
      <form v-if="logHabit" class="form" @submit.prevent="submitLog">
        <div class="log-formula">
          {{ logHabit.anchorDescription }} → {{ logHabit.tinyBehavior }} → {{ logHabit.celebration }}
        </div>
        <div class="check-grid">
          <label class="check-card">
            <input v-model="logForm.anchorTriggered" type="checkbox" />
            <span>
              <strong>锚点触发</strong>
              <small>在计划的情境中开始了</small>
            </span>
          </label>
          <label class="check-card">
            <input v-model="logForm.tinyCompleted" type="checkbox" />
            <span>
              <strong>微行为完成</strong>
              <small>{{ logHabit.tinyBehavior }}</small>
            </span>
          </label>
          <label class="check-card">
            <input v-model="logForm.expandedCompleted" type="checkbox" />
            <span>
              <strong>扩展行为完成</strong>
              <small>做超过了最小要求，单独记录</small>
            </span>
          </label>
          <label class="check-card">
            <input v-model="logForm.celebrationDone" type="checkbox" />
            <span>
              <strong>完成即时庆祝</strong>
              <small>{{ logHabit.celebration || '给自己一个积极反馈' }}</small>
            </span>
          </label>
        </div>
        <div class="field">
          <label class="field-label" for="log-difficulty">本次难度</label>
          <select id="log-difficulty" v-model.number="logForm.difficulty" class="select">
            <option v-for="option in difficultyOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="log-obstacle">当时的阻碍（可选）</label>
          <input id="log-obstacle" v-model="logForm.obstacle" class="input" placeholder="例如：手机干扰、太累、忘记锚点" />
        </div>
        <div class="field">
          <label class="field-label" for="log-note">备注（可选）</label>
          <textarea id="log-note" v-model="logForm.note" class="textarea" placeholder="今天实际发生了什么？" />
        </div>
        <p class="field-hint">微行为完成不会自动把关联任务标记为完成。</p>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="logModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : '保存记录' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="historyOpen"
      :title="historyHabit ? `${historyHabit.name} · 历史记录` : '历史记录'"
      :subtitle="historyHabit ? `${historyLogs.length} 条记录 · 当前连续 ${streakFor(historyHabit.id)} 天` : ''"
      size="lg"
      @close="historyOpen = false"
    >
      <div v-if="historyHabit" class="history-body">
        <div class="history-formula">
          {{ historyHabit.anchorDescription }} → {{ historyHabit.tinyBehavior }} → {{ historyHabit.celebration }}
        </div>
        <EmptyState
          v-if="historyLogs.length === 0"
          title="还没有执行记录"
          description="今天先完成一次微行为，记录会出现在这里。"
        />
        <ul v-else class="history-list">
          <li v-for="log in historyLogs.slice(0, 12)" :key="log.id" class="history-row">
            <div class="history-date">
              <span>{{ formatShortDate(log.occurredAt) }}</span>
              <small>{{ formatDateTime(log.occurredAt).split(' ')[1] }}</small>
            </div>
            <div class="history-main">
              <div class="history-badges">
                <span class="history-badge" :class="{ done: log.anchorTriggered }">锚点</span>
                <span class="history-badge" :class="{ done: log.tinyCompleted }">微行为</span>
                <span class="history-badge" :class="{ done: log.expandedCompleted }">扩展</span>
                <span class="history-badge" :class="{ done: log.celebrationDone }">庆祝</span>
                <span class="history-difficulty">难度 {{ log.difficulty }}/5</span>
              </div>
              <p v-if="log.obstacle" class="history-text">阻碍：{{ log.obstacle }}</p>
              <p v-if="log.note" class="history-text">{{ log.note }}</p>
            </div>
          </li>
        </ul>
      </div>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div v-if="confirmTarget && !confirmTarget.archived" class="alert alert-warning confirm-note">
        <AppIcon name="warning" :size="15" />
        <span>归档习惯不会删除历史执行记录，也不会影响任何任务状态。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="confirmBusy" @click="runConfirm">
          {{ confirmBusy ? '处理中…' : confirmTarget?.archived ? '确认恢复' : '确认归档' }}
        </button>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.habit-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.habit-stat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
  color: var(--accent);
}

.icon-accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.icon-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.icon-violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.habit-stat > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-number {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-caption {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px;
  flex-wrap: wrap;
}

.view-tabs {
  display: flex;
  gap: 2px;
}

.view-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 550;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.view-tab:hover {
  background: var(--surface-muted);
  color: var(--ink);
}

.view-tab.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-ghost.is-on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.habits-loading {
  height: 360px;
}

.today-view,
.library-view,
.insights-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.today-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--accent-faint);
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.65;
}

.note-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
}

.today-note strong {
  margin-right: 5px;
  color: var(--accent-ink);
}

.habit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.habit-card {
  display: flex;
  flex-direction: column;
  padding: 17px;
}

.habit-card.done {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background:
    radial-gradient(100% 130% at 100% 0%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 50%),
    var(--surface);
}

.habit-card-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.habit-streak {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  background: var(--amber-soft);
  color: var(--amber);
  font-family: var(--font-mono);
  font-size: 9px;
}

.habit-name {
  margin-top: 8px;
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
}

.habit-desc {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.6;
}

.habit-formula {
  display: flex;
  align-items: stretch;
  gap: 6px;
  margin-top: 11px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.formula-part {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.formula-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.05em;
  color: var(--accent);
}

.formula-text {
  color: var(--ink-soft);
  font-size: 10.5px;
  line-height: 1.5;
}

.formula-arrow {
  align-self: center;
  color: var(--line-strong);
  flex: none;
}

.habit-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 11px;
}

.micro-check {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.micro-check:hover {
  border-color: var(--accent);
}

.micro-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  color: transparent;
}

.micro-circle.checked {
  background: var(--success);
  border-color: var(--success);
  color: var(--on-accent);
}

.micro-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.micro-copy strong {
  font-size: 11.5px;
  font-weight: 600;
}

.micro-copy small {
  color: var(--muted);
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expanded-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 9px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 9.5px;
}

.expanded-btn:hover {
  border-color: var(--line-strong);
  color: var(--ink-soft);
}

.log-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
}

.log-badge {
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8.5px;
}

.log-badge.done {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.log-difficulty {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--muted);
}

.habit-capabilities {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.habit-capabilities span {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--muted);
}

.habit-capabilities i {
  display: block;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  opacity: 0.7;
}

.habit-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--line-faint);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 9.5px;
  font-weight: 550;
}

.link-btn:hover {
  color: var(--accent);
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.library-card {
  padding: 16px;
}

.library-card.archived {
  opacity: 0.65;
}

.library-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.library-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.library-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
}

.library-title h4 {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.library-sub {
  font-size: 9.5px;
  color: var(--muted);
}

.habit-status-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.habit-status-paused {
  background: var(--amber-soft);
  color: var(--amber);
}

.library-formula {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 9.5px;
  line-height: 1.6;
}

.library-formula .icon {
  color: var(--line-strong);
}

.library-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 9px;
}

.library-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid var(--line-faint);
}

.library-frequency {
  color: var(--muted);
  font-size: 9.5px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
}

.row-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.heatmap-card {
  overflow: hidden;
}

.heatmap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-x: auto;
}

.heatmap-head,
.heatmap-row {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 520px;
}

.heatmap-label {
  width: 150px;
  flex: none;
  font-size: 9.5px;
  color: var(--ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.heatmap-head .heatmap-label {
  color: var(--muted);
}

.heatmap-day {
  flex: 1;
  text-align: center;
  font-size: 8px;
  color: var(--muted);
}

.heatmap-day.today {
  color: var(--accent);
  font-weight: 600;
}

.heatmap-cell {
  flex: 1;
  height: 20px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  border: 1px solid var(--line-faint);
}

.heatmap-cell.filled {
  background: color-mix(in srgb, var(--accent) 62%, var(--surface));
  border-color: transparent;
}

.heatmap-cell.today {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  padding-left: 153px;
  color: var(--muted);
  font-size: 8.5px;
}

.legend-cell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  border: 1px solid var(--line-faint);
  background: var(--surface-muted);
}

.legend-cell.filled {
  margin-left: 6px;
  background: color-mix(in srgb, var(--accent) 62%, var(--surface));
  border-color: transparent;
}

.legend-today {
  width: 11px;
  height: 11px;
  margin-left: 6px;
  border: 1px solid var(--accent);
  border-radius: 3px;
}

.diagnosis-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 10px;
  line-height: 1.6;
}

.diagnosis-note .icon {
  flex: none;
  margin-top: 1px;
}

.diagnosis-list {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.diagnosis-item {
  padding: 11px 0;
  border-top: 1px solid var(--line-faint);
}

.diagnosis-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.diagnosis-habit {
  font-size: 12px;
  font-weight: 600;
}

.diagnosis-suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 7px;
}

.suggestion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.suggestion-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
}

.suggestion-a .suggestion-type {
  background: var(--amber-soft);
  color: var(--amber);
}

.suggestion-m .suggestion-type {
  background: var(--violet-soft);
  color: var(--violet);
}

.suggestion-title {
  font-size: 10.5px;
  font-weight: 600;
}

.suggestion-reason {
  margin-top: 1px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.suggestion-action {
  margin-top: 2px;
  color: var(--accent-ink);
  font-size: 9.5px;
  line-height: 1.6;
}

.insight-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 10px;
}

.insight-note .icon {
  color: var(--accent);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-error {
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.formula-section {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.formula-section-head {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 9px;
}

.formula-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono);
  font-size: 9px;
}

.formula-section-head h4 {
  font-size: 11.5px;
  font-weight: 600;
}

.formula-section-head p {
  margin-top: 1px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.formula-preview {
  padding: 12px 14px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
}

.preview-label {
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

.formula-preview p {
  margin-top: 3px;
  font-family: var(--font-serif);
  font-size: 13px;
  line-height: 1.7;
}

.log-formula {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.65;
}

.check-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.check-card {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
}

.check-card input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.check-card span {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.check-card strong {
  font-size: 10.5px;
  font-weight: 600;
}

.check-card small {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.5;
}

.history-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-formula {
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 10.5px;
  line-height: 1.65;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line-faint);
}

.history-date {
  width: 66px;
  flex: none;
  display: flex;
  flex-direction: column;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-soft);
}

.history-date small {
  color: var(--muted);
  font-size: 8.5px;
}

.history-main {
  flex: 1;
  min-width: 0;
}

.history-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.history-badge {
  padding: 1px 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8.5px;
}

.history-badge.done {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.history-difficulty {
  margin-left: auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.history-text {
  margin-top: 2px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-note {
  margin-top: 14px;
}

.week-view,
.trend-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.week-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 18px;
}

.week-summary-stats {
  display: flex;
  gap: 22px;
}

.week-summary-stats div {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.week-summary-stats strong {
  font-family: var(--font-mono);
  font-size: 20px;
  color: var(--accent-ink);
}

.week-summary-stats span {
  color: var(--muted);
  font-size: 9px;
}

.habit-week-board {
  overflow-x: auto;
  padding: 14px;
}

.habit-week-head,
.habit-week-row {
  display: grid;
  grid-template-columns: 170px repeat(7, minmax(78px, 1fr));
  gap: 5px;
  min-width: 760px;
  align-items: stretch;
}

.habit-week-head {
  margin-bottom: 6px;
}

.habit-week-corner {
  align-self: end;
  padding-bottom: 8px;
  color: var(--muted);
  font-size: 9px;
}

.habit-week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 4px;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 8.5px;
}

.habit-week-day strong {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 11px;
}

.habit-week-day.today {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.habit-week-day.future {
  opacity: 0.55;
}

.habit-week-day small {
  font-size: 7.5px;
}

.habit-week-row {
  padding: 5px 0;
  border-top: 1px solid var(--line-faint);
}

.habit-week-name {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 6px 8px;
  min-width: 0;
}

.habit-week-name strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.habit-week-name span {
  color: var(--muted);
  font-size: 8px;
}

.habit-week-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
}

.habit-week-cell.done {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.habit-week-cell.recorded:not(.done) {
  background: var(--amber-soft);
  color: var(--amber-ink);
}

.habit-week-cell.missed {
  background: repeating-linear-gradient(
    -45deg,
    var(--surface-muted),
    var(--surface-muted) 4px,
    var(--surface) 4px,
    var(--surface) 8px
  );
}

.habit-week-cell.today {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
}

.habit-week-cell.future {
  opacity: 0.38;
}

.habit-week-cell:disabled {
  cursor: default;
}

.week-cell-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--line-strong);
}

.habit-week-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-faint);
  color: var(--muted);
  font-size: 8.5px;
}

.habit-week-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--line-faint);
  background: var(--surface-muted);
}

.legend-dot.done {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.legend-dot.recorded {
  background: var(--amber-soft);
  border-color: var(--amber);
}

.legend-dot.missed {
  background: repeating-linear-gradient(
    -45deg,
    var(--surface-muted),
    var(--surface-muted) 2px,
    var(--surface) 2px,
    var(--surface) 4px
  );
}

.legend-dot.future {
  opacity: 0.4;
}

.trend-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.trend-metric {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 112px;
  padding: 14px;
  overflow: hidden;
}

.trend-metric .metric-label {
  color: var(--muted);
  font-size: 9px;
}

.trend-metric strong {
  font-family: var(--font-mono);
  font-size: 23px;
  line-height: 1.2;
  color: var(--ink);
}

.trend-metric strong.metric-obstacle {
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-metric span:not(.metric-label) {
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.trend-metric i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent);
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 170px;
  margin-top: 12px;
  padding-top: 20px;
}

.trend-column {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
  min-width: 0;
}

.trend-value {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.trend-track {
  width: 100%;
  height: 110px;
  display: flex;
  align-items: flex-end;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
}

.trend-track i {
  width: 100%;
  min-height: 4px;
  border-radius: var(--radius-xs) var(--radius-xs) 0 0;
  background: color-mix(in srgb, var(--accent) 58%, var(--surface));
}

.trend-date {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 7.5px;
}

.trend-date.today {
  color: var(--accent);
  font-weight: 600;
}

.data-pending {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 28px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 10px;
}

.map-distribution {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.map-dist-item {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 5px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.map-dist-item strong {
  font-family: var(--font-serif);
  font-size: 19px;
}

.map-dist-item span {
  color: var(--muted);
  font-size: 9.5px;
}

.map-dist-item b {
  font-family: var(--font-mono);
  font-size: 17px;
}

.map-m strong,
.map-m b {
  color: var(--amber);
}

.map-a strong,
.map-a b {
  color: var(--danger);
}

.map-p strong,
.map-p b {
  color: var(--accent);
}

.map-rule-note {
  margin-top: 10px;
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.6;
}

@media (max-width: 1000px) {
  .habit-grid,
  .library-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .habit-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .habit-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid,
  .form-grid-3,
  .check-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .habit-formula {
    flex-direction: column;
  }

  .formula-arrow {
    transform: rotate(90deg);
  }

  .habit-check-row {
    flex-wrap: wrap;
  }

  .expanded-btn {
    width: 100%;
    justify-content: center;
  }

  .heatmap-legend {
    padding-left: 0;
  }
}
</style>