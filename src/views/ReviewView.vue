<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useToast } from '@/composables/useToast'
import {
  ADJUSTMENT_FIELDS,
  useReviews,
  type AdjustmentFieldMeta,
  type FindingInput,
  type ReviewContext,
  type ReviewInput,
} from '@/composables/useReviews'
import {
  AdjustmentStatus,
  AdjustmentTargetType,
  DirectionStatus,
  FindingType,
  GoalStatus,
  HabitStatus,
  MilestoneStatus,
  ReviewStatus,
  ReviewType,
  TaskStatus,
  adjustmentStatusLabels,
  adjustmentTargetTypeLabels,
  directionStatusLabels,
  evidenceTypeLabels,
  findingTypeLabels,
  goalStatusLabels,
  habitStatusLabels,
  learningRecordTypeLabels,
  milestoneStatusLabels,
  reviewStatusLabels,
  reviewTypeLabels,
  taskStatusLabels,
  type Adjustment,
  type Review,
} from '@/domain'
import {
  formatDate,
  formatDuration,
  formatShortDate,
  fromDateInput,
  nowIso,
  toDateInput,
} from '@/utils/date'

const { success, error: toastError } = useToast()

const {
  loading,
  error,
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
  taskById,
  goalById,
  habitById,
  milestoneById,
  directionById,
  includeArchived,
  refresh,
  saveReview,
  saveAdjustment,
  setAdjustmentStatus,
  applyAdjustment,
  setArchived,
  targetLabel,
  oldValueFor,
} = useReviews()

type MainView = 'reviews' | 'insights'
const activeView = ref<MainView>('reviews')
const filterType = ref<'all' | ReviewType>('all')

const reviewTypes = Object.values(ReviewType)
const findingTypes = Object.values(FindingType)

const SECTION_TITLES: Record<ReviewType, string[]> = {
  [ReviewType.DAILY]: [
    '今日主要成果',
    '主要阻碍',
    '学习反思',
    '习惯执行情况',
    '明日重点',
  ],
  [ReviewType.WEEKLY]: [
    'P · 计划回顾',
    'D · 执行检查',
    'C · 效果评价',
    'A · 下周调整',
  ],
  [ReviewType.MONTHLY]: [
    'P · 月度计划',
    'D · 执行情况',
    'C · 结果评估',
    'A · 下月调整',
  ],
  [ReviewType.MILESTONE]: [
    '原定目标与验收条件',
    '实际结果',
    '偏差与原因',
    '下一步调整',
  ],
  [ReviewType.SESSION]: [
    '原定学习目标',
    '实际学习内容与输出',
    '独立完成程度与盲区',
    '失败原因与下一步',
  ],
}

const energyOptions = [
  { value: 1, label: '1 · 很低' },
  { value: 2, label: '2 · 偏低' },
  { value: 3, label: '3 · 一般' },
  { value: 4, label: '4 · 良好' },
  { value: 5, label: '5 · 充沛' },
]

const filteredReviews = computed(() =>
  filterType.value === 'all'
    ? visibleReviews.value
    : visibleReviews.value.filter((review) => review.reviewType === filterType.value),
)

const typeCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const review of visibleReviews.value) {
    counts[review.reviewType] = (counts[review.reviewType] ?? 0) + 1
  }
  return counts
})

function localDate(offset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return toDateInput(date.toISOString())
}

function weeklyRange(): { start: string; end: string } {
  const today = new Date()
  const day = today.getDay() === 0 ? 7 : today.getDay()
  const monday = new Date(today)
  monday.setDate(monday.getDate() - (day - 1))
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return {
    start: toDateInput(monday.toISOString()),
    end: toDateInput(sunday.toISOString()),
  }
}

function monthlyRange(): { start: string; end: string } {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return {
    start: toDateInput(first.toISOString()),
    end: toDateInput(last.toISOString()),
  }
}

interface FindingForm {
  id?: string
  findingType: FindingType
  description: string
  rootCause: string
  proposedAction: string
}

const reviewForm = reactive({
  reviewType: ReviewType.DAILY as ReviewType,
  status: ReviewStatus.COMPLETED as ReviewStatus,
  targetDate: localDate(),
  startDate: localDate(),
  endDate: localDate(),
  energyLevel: 3,
  sections: [] as string[],
  findings: [] as FindingForm[],
  linkedSessionId: '',
  linkedMilestoneId: '',
  incompleteReasons: {} as Record<string, string>,
  selectedEvidenceIds: [] as string[],
  includeAutoSummary: true,
})

const reviewModalOpen = ref(false)
const reviewEditingId = ref<string | null>(null)
const detailReviewId = ref<string | null>(null)
const formError = ref('')
const saving = ref(false)

const reviewTitles = computed(() => SECTION_TITLES[reviewForm.reviewType])

const formContext = computed<ReviewContext>(() =>
  reviewContextFor(
    reviewForm.reviewType,
    fromDateInput(reviewForm.targetDate) ?? nowIso(),
    fromDateInput(reviewForm.startDate),
    fromDateInput(reviewForm.endDate),
  ),
)

const formIncompleteTasks = computed(() => formContext.value.incompleteTasks)

const formCompletionRate = computed(() => {
  const total = formContext.value.tasks.length
  return total ? Math.round((formContext.value.completedTasks.length / total) * 100) : 0
})

const formContextHasData = computed(
  () =>
    formContext.value.tasks.length > 0 ||
    formContext.value.sessions.length > 0 ||
    formContext.value.learningRecords.length > 0 ||
    formContext.value.habitLogs.length > 0 ||
    formContext.value.evidences.length > 0 ||
    formContext.value.timeboxes.length > 0,
)

const tomorrowFocusCandidates = computed(() => {
  const rank: Record<string, number> = {
    CRITICAL: 4,
    IMPORTANT: 3,
    NORMAL: 2,
    LOW: 1,
  }
  return [...formIncompleteTasks.value]
    .sort((left, right) => {
      const dueDiff = (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999')
      if (dueDiff !== 0) return dueDiff
      return (rank[right.importance] ?? 0) - (rank[left.importance] ?? 0)
    })
    .slice(0, 3)
})

const incompleteReasonOptions = [
  '时间预估不足',
  '优先级发生变化',
  '任务范围过大',
  '依赖未完成',
  '精力不足',
  '外部打断',
  '其他原因',
]

const directionInsightTotal = computed(() =>
  directionTime.value.reduce(
    (sum, row) => sum + row.focusMinutes + row.learningMinutes,
    0,
  ),
)

const maxDirectionMinutes = computed(() =>
  Math.max(
    1,
    ...directionTime.value.map((row) => row.focusMinutes + row.learningMinutes),
  ),
)

const planActualMaxTasks = computed(() =>
  Math.max(
    1,
    ...planActual.value.flatMap((point) => [point.plannedTasks, point.completedTasks]),
  ),
)

const planActualMaxMinutes = computed(() =>
  Math.max(
    1,
    ...planActual.value.flatMap((point) => [point.plannedMinutes, point.recordedMinutes]),
  ),
)

const learningMixTotal = computed(() =>
  learningMix.value.reduce((sum, row) => sum + row.count, 0),
)

const habitMapTotal = computed(() =>
  habitDiagnostics.value.map.reduce((sum, row) => sum + row.count, 0),
)

const detailReview = computed(
  () => visibleReviews.value.find((review) => review.id === detailReviewId.value) ?? null,
)

const detailFindings = computed(() =>
  detailReview.value ? findingsByReview.value[detailReview.value.id] ?? [] : [],
)

const detailAdjustments = computed(() =>
  detailReview.value ? adjustmentsByReview.value[detailReview.value.id] ?? [] : [],
)

function incompleteTaskLine(taskId: string, title: string): string {
  const reason = reviewForm.incompleteReasons[taskId]?.trim()
  return reason ? `${title}（${reason}）` : title
}

function learningSummary(context: ReviewContext): string {
  const recordCount = context.learningRecords.length
  return `学习：${context.sessions.length} 次会话，${formatDuration(context.learningMinutes)}，${recordCount} 条学习记录`
}

function habitSummary(context: ReviewContext): string {
  const tinyCount = context.habitLogs.filter((log) => log.tinyCompleted).length
  return `习惯：${context.habitLogs.length} 次记录，${tinyCount} 次完成微行为`
}

function evidenceSummary(context: ReviewContext): string {
  const selected = context.evidences.filter((evidence) =>
    reviewForm.selectedEvidenceIds.includes(evidence.id),
  )
  const rows = selected.length > 0 ? selected : context.evidences
  return `成果证据：${rows.length} 条${rows.length ? ` · ${rows.map((row) => row.title).join('、')}` : ''}`
}

function autoSummaryText(context = formContext.value): string {
  const taskDone = context.completedTasks.length
  const taskTotal = context.tasks.length
  const incomplete = context.incompleteTasks.map((task) =>
    incompleteTaskLine(task.id, task.title),
  )
  const lines = [
    `任务：${taskDone} / ${taskTotal} 项完成${taskTotal ? `（${Math.round((taskDone / taskTotal) * 100)}%）` : ''}`,
  ]
  if (incomplete.length) lines.push(`未完成：${incomplete.join('；')}`)
  lines.push(learningSummary(context))
  lines.push(habitSummary(context))
  lines.push(evidenceSummary(context))
  if (context.timeboxes.length) {
    lines.push(
      `时间盒：计划 ${formatDuration(context.plannedMinutes)}，实际 ${formatDuration(context.recordedMinutes)}`,
    )
  }
  return lines.join('\n')
}

function autoPlanText(context = formContext.value): string {
  const taskTitles = context.tasks.slice(0, 8).map((task) => task.title)
  return [
    `计划任务：${context.tasks.length} 项${taskTitles.length ? ` · ${taskTitles.join('、')}` : ''}`,
    `计划时间盒：${context.timeboxes.length} 个，共 ${formatDuration(context.plannedMinutes)}`,
  ].join('\n')
}

function autoDoText(context = formContext.value): string {
  const completed = context.completedTasks.map((task) => task.title)
  const unfinished = context.incompleteTasks.map((task) =>
    incompleteTaskLine(task.id, task.title),
  )
  return [
    `已完成任务：${completed.length ? completed.join('、') : '无记录'}`,
    `未完成任务：${unfinished.length ? unfinished.join('；') : '无记录'}`,
    learningSummary(context),
    habitSummary(context),
    evidenceSummary(context),
    context.timeboxes.length
      ? `时间盒：计划 ${formatDuration(context.plannedMinutes)}，实际 ${formatDuration(context.recordedMinutes)}`
      : '时间盒：本周期没有记录',
  ].join('\n')
}

function autoCheckText(context = formContext.value): string {
  const rate = context.tasks.length
    ? Math.round((context.completedTasks.length / context.tasks.length) * 100)
    : 0
  const minuteDelta = context.recordedMinutes - context.plannedMinutes
  const lines = [
    `任务完成率：${rate}%（${context.completedTasks.length} / ${context.tasks.length}）`,
    context.timeboxes.length
      ? `时间盒偏差：${minuteDelta >= 0 ? '+' : ''}${minuteDelta} 分钟`
      : '时间盒偏差：本周期没有可比较记录',
  ]
  if (context.incompleteTasks.length) {
    lines.push(`主要未完成项：${context.incompleteTasks.slice(0, 3).map((task) => task.title).join('、')}`)
  }
  const tinyRate = context.habitLogs.length
    ? Math.round(
        (context.habitLogs.filter((log) => log.tinyCompleted).length /
          context.habitLogs.length) *
          100,
      )
    : 0
  if (context.habitLogs.length) lines.push(`习惯微行为完成率：${tinyRate}%`)
  return lines.join('\n')
}

function autoActText(context = formContext.value): string {
  const suggestions: string[] = []
  if (context.incompleteTasks.length) {
    const first = tomorrowFocusCandidates.value[0] ?? context.incompleteTasks[0]
    suggestions.push(`优先处理「${first.title}」，先缩小到可在 25–45 分钟内启动的步骤`)
  }
  const minuteDelta = context.recordedMinutes - context.plannedMinutes
  if (context.timeboxes.length && minuteDelta < 0) {
    suggestions.push(`实际时间比计划少 ${Math.abs(minuteDelta)} 分钟，下周减少并行安排或降低单盒时长`)
  }
  if (context.habitLogs.length && context.habitLogs.some((log) => !log.tinyCompleted)) {
    suggestions.push('检查未完成习惯的锚点与提示，不要只增加执行要求')
  }
  if (!suggestions.length) suggestions.push('记录下一步需要验证的一个假设，并安排对应任务')
  return suggestions.map((line) => `- ${line}`).join('\n')
}

function appendSection(index: number, text: string): void {
  const current = (reviewForm.sections[index] ?? '').trim()
  if (!text.trim() || current.includes(text.trim())) return
  reviewForm.sections[index] = current ? `${current}\n${text}` : text
}

function fillDailyOutcome(): void {
  const selected = formContext.value.evidences.filter((evidence) =>
    reviewForm.selectedEvidenceIds.includes(evidence.id),
  )
  const titles = (
    selected.length
      ? selected.map((evidence) => evidence.title)
      : formContext.value.completedTasks.map((task) => task.title)
  ).slice(0, 5)
  appendSection(0, titles.length ? titles.map((title) => `- ${title}`).join('\n') : '本周期没有已完成任务或成果记录。')
}

function fillDailyBlockers(): void {
  const lines = formIncompleteTasks.value.map(
    (task) => `- ${incompleteTaskLine(task.id, task.title)}`,
  )
  appendSection(1, lines.length ? lines.join('\n') : '本周期没有未完成任务。')
}

function fillDailyLearningHabits(): void {
  appendSection(2, learningSummary(formContext.value))
  appendSection(3, habitSummary(formContext.value))
}

function fillTomorrowFocus(): void {
  const lines = tomorrowFocusCandidates.value.map(
    (task) => `- ${incompleteTaskLine(task.id, task.title)}`,
  )
  appendSection(4, lines.length ? `明日优先：\n${lines.join('\n')}` : '明日重点：先选择一件能推进当前方向的最小行动。')
}

function fillWeeklyAutoSection(index: number): void {
  if (index === 0) appendSection(index, autoPlanText())
  else if (index === 1) appendSection(index, autoDoText())
  else if (index === 2) appendSection(index, autoCheckText())
  else if (index === 3) appendSection(index, autoActText())
}

function applyTypeDefaults(type: ReviewType): void {
  const titles = SECTION_TITLES[type]
  reviewForm.sections = titles.map((_, index) => reviewForm.sections[index] ?? '')
  reviewForm.linkedSessionId = ''
  reviewForm.linkedMilestoneId = ''
  if (type === ReviewType.WEEKLY) {
    const range = weeklyRange()
    reviewForm.startDate = range.start
    reviewForm.endDate = range.end
    reviewForm.targetDate = localDate()
  } else if (type === ReviewType.MONTHLY) {
    const range = monthlyRange()
    reviewForm.startDate = range.start
    reviewForm.endDate = range.end
    reviewForm.targetDate = localDate()
  } else {
    reviewForm.startDate = localDate()
    reviewForm.endDate = localDate()
    reviewForm.targetDate = localDate()
  }
}

function onReviewTypeChange(): void {
  applyTypeDefaults(reviewForm.reviewType)
}

function onSessionContextChange(): void {
  const session = completedSessions.value.find(
    (item) => item.id === reviewForm.linkedSessionId,
  )
  if (!session) return
  const date = toDateInput(session.startedAt)
  reviewForm.targetDate = date
  reviewForm.startDate = date
  reviewForm.endDate = date
}

function onMilestoneContextChange(): void {
  const milestone = activeMilestones.value.find(
    (item) => item.id === reviewForm.linkedMilestoneId,
  )
  if (!milestone) return
  if (milestone.startDate) reviewForm.startDate = toDateInput(milestone.startDate)
  if (milestone.dueDate) {
    reviewForm.endDate = toDateInput(milestone.dueDate)
    reviewForm.targetDate = toDateInput(milestone.dueDate)
  }
}

function openReviewCreate(type: ReviewType = ReviewType.DAILY): void {
  reviewEditingId.value = null
  reviewForm.reviewType = type
  reviewForm.status = ReviewStatus.COMPLETED
  reviewForm.energyLevel = 3
  reviewForm.sections = SECTION_TITLES[type].map(() => '')
  reviewForm.findings = []
  reviewForm.linkedSessionId = ''
  reviewForm.linkedMilestoneId = ''
  reviewForm.incompleteReasons = {}
  reviewForm.selectedEvidenceIds = []
  reviewForm.includeAutoSummary = true
  applyTypeDefaults(type)
  formError.value = ''
  reviewModalOpen.value = true
}

function parseSections(content: string, titles: string[]): string[] {
  const result = titles.map((title) => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = content.match(
      new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`),
    )
    return match ? match[1].trim() : ''
  })
  if (result.every((value) => !value) && content.trim()) {
    result[0] = content.trim()
  }
  return result
}

function openReviewEdit(review: Review): void {
  detailReviewId.value = null
  reviewEditingId.value = review.id
  reviewForm.reviewType = review.reviewType
  reviewForm.status = review.status
  reviewForm.targetDate = toDateInput(review.targetDate)
  reviewForm.startDate = toDateInput(review.startDate)
  reviewForm.endDate = toDateInput(review.endDate)
  reviewForm.energyLevel = review.energyLevel
  reviewForm.sections = parseSections(review.content, SECTION_TITLES[review.reviewType])
  reviewForm.findings = (findingsByReview.value[review.id] ?? []).map((finding) => ({
    id: finding.id,
    findingType: finding.findingType,
    description: finding.description,
    rootCause: finding.rootCause,
    proposedAction: finding.proposedAction,
  }))
  reviewForm.linkedSessionId = ''
  reviewForm.linkedMilestoneId = ''
  reviewForm.incompleteReasons = {}
  reviewForm.selectedEvidenceIds = []
  reviewForm.includeAutoSummary = true
  formError.value = ''
  reviewModalOpen.value = true
}

function buildContent(): string {
  const sections = reviewTitles.value
    .map((title, index) => {
      const body = (reviewForm.sections[index] ?? '').trim()
      return body ? `## ${title}\n${body}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
  if (!reviewForm.includeAutoSummary || !formContextHasData.value) return sections
  const summary = `## 自动汇总\n${autoSummaryText()}`
  return sections ? `${sections}\n\n${summary}` : summary
}

function addFinding(): void {
  reviewForm.findings.push({
    findingType: FindingType.PROBLEM,
    description: '',
    rootCause: '',
    proposedAction: '',
  })
}

function removeFinding(index: number): void {
  reviewForm.findings.splice(index, 1)
}

async function submitReview(): Promise<void> {
  formError.value = ''
  const content = buildContent()
  if (!content && reviewForm.findings.length === 0) {
    formError.value = '至少写一个复盘部分，或记录一条发现'
    return
  }
  if (
    reviewForm.findings.some(
      (finding) => !finding.description.trim() && !finding.rootCause.trim(),
    )
  ) {
    formError.value = '每条发现至少需要问题描述或根因'
    return
  }
  saving.value = true
  try {
    const input: ReviewInput = {
      reviewType: reviewForm.reviewType,
      targetDate: fromDateInput(reviewForm.targetDate) ?? nowIso(),
      startDate: fromDateInput(reviewForm.startDate),
      endDate: fromDateInput(reviewForm.endDate),
      content,
      energyLevel: Number(reviewForm.energyLevel),
      status: reviewForm.status,
    }
    const findingInputs: FindingInput[] = reviewForm.findings.map((finding) => ({
      id: finding.id,
      findingType: finding.findingType,
      description: finding.description,
      rootCause: finding.rootCause,
      proposedAction: finding.proposedAction,
    }))
    const entity = await saveReview(input, findingInputs, reviewEditingId.value ?? undefined)
    reviewModalOpen.value = false
    detailReviewId.value = entity.id
    success(reviewEditingId.value ? '复盘已更新' : '复盘已保存')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const whyOpen = ref(false)
const whyIndex = ref<number | null>(null)
const whyInputs = ref<string[]>(['', '', '', '', ''])

const whyQuestions = [
  '为什么会出现这个问题？',
  '为什么会出现上一层的这个原因？',
  '为什么这个原因会存在？',
  '为什么它没有被更早发现或解决？',
  '最深层、最值得改变的原因是什么？',
]

const whyFinding = computed(() =>
  whyIndex.value !== null ? reviewForm.findings[whyIndex.value] ?? null : null,
)

function openWhy(index: number): void {
  whyIndex.value = index
  whyInputs.value = ['', '', '', '', '']
  whyOpen.value = true
}

function saveWhy(): void {
  const finding = whyFinding.value
  if (!finding) return
  const chain = whyInputs.value
    .map((value, index) => (value.trim() ? `${index + 1}. ${value.trim()}` : ''))
    .filter(Boolean)
  if (chain.length === 0) {
    whyOpen.value = false
    return
  }
  finding.rootCause = `5Why 分析：\n${chain.join('\n')}`
  whyOpen.value = false
}

function openDetail(review: Review): void {
  detailReviewId.value = review.id
}

function closeDetail(): void {
  detailReviewId.value = null
}

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{ id: string; label: string; archived: boolean } | null>(null)

const confirmTitle = computed(() =>
  confirmTarget.value?.archived ? '恢复复盘' : '归档复盘',
)

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在复盘列表。`
  return `将归档「${target.label}」。复盘内容、发现与调整记录都会保留。`
})

function askArchive(review: Review): void {
  confirmTarget.value = {
    id: review.id,
    label: `${reviewTypeLabels[review.reviewType]} · ${formatShortDate(review.targetDate)}`,
    archived: Boolean(review.archivedAt),
  }
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    await setArchived(target.id, !target.archived)
    success(target.archived ? '已恢复' : '已归档，历史内容保留')
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

const adjustmentModalOpen = ref(false)
const adjustmentForm = reactive({
  targetType: AdjustmentTargetType.TASK as AdjustmentTargetType,
  targetId: '',
  field: '',
  newValue: '',
  reason: '',
})

const targetTypes = [
  AdjustmentTargetType.TASK,
  AdjustmentTargetType.GOAL,
  AdjustmentTargetType.HABIT,
  AdjustmentTargetType.MILESTONE,
  AdjustmentTargetType.DIRECTION,
]

const adjustmentTargetOptions = computed(() => {
  if (adjustmentForm.targetType === AdjustmentTargetType.TASK) {
    return Object.values(taskById.value)
      .filter((task) => !task.archivedAt)
      .map((task) => ({ id: task.id, label: task.title }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.GOAL) {
    return Object.values(goalById.value)
      .filter((goal) => !goal.archivedAt)
      .map((goal) => ({ id: goal.id, label: goal.title }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.HABIT) {
    return Object.values(habitById.value)
      .filter((habit) => !habit.archivedAt)
      .map((habit) => ({ id: habit.id, label: habit.name }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.MILESTONE) {
    return Object.values(milestoneById.value)
      .filter((milestone) => !milestone.archivedAt)
      .map((milestone) => ({ id: milestone.id, label: milestone.name }))
  }
  return Object.values(directionById.value)
    .filter((direction) => !direction.archivedAt)
    .map((direction) => ({ id: direction.id, label: direction.name }))
})

const adjustmentFieldOptions = computed<AdjustmentFieldMeta[]>(
  () => ADJUSTMENT_FIELDS[adjustmentForm.targetType] ?? [],
)

const adjustmentFieldMeta = computed(() =>
  adjustmentFieldOptions.value.find((item) => item.key === adjustmentForm.field),
)

const adjustmentOldValue = computed(() => {
  if (!adjustmentForm.targetId || !adjustmentForm.field) return '—'
  return oldValueFor(
    adjustmentForm.targetType,
    adjustmentForm.targetId,
    adjustmentForm.field,
  )
})

const statusOptions = computed(() => {
  if (adjustmentForm.targetType === AdjustmentTargetType.TASK) {
    return Object.values(TaskStatus).map((status) => ({
      value: status,
      label: taskStatusLabels[status],
    }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.GOAL) {
    return Object.values(GoalStatus).map((status) => ({
      value: status,
      label: goalStatusLabels[status],
    }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.HABIT) {
    return Object.values(HabitStatus).map((status) => ({
      value: status,
      label: habitStatusLabels[status],
    }))
  }
  if (adjustmentForm.targetType === AdjustmentTargetType.MILESTONE) {
    return Object.values(MilestoneStatus).map((status) => ({
      value: status,
      label: milestoneStatusLabels[status],
    }))
  }
  return Object.values(DirectionStatus).map((status) => ({
    value: status,
    label: directionStatusLabels[status],
  }))
})

function openAdjustmentCreate(): void {
  adjustmentForm.targetType = AdjustmentTargetType.TASK
  adjustmentForm.targetId = ''
  adjustmentForm.field = ''
  adjustmentForm.newValue = ''
  adjustmentForm.reason = ''
  formError.value = ''
  adjustmentModalOpen.value = true
}

function onAdjustmentTypeChange(): void {
  adjustmentForm.targetId = ''
  adjustmentForm.field = ''
  adjustmentForm.newValue = ''
}

function onAdjustmentTargetChange(event: Event): void {
  adjustmentForm.targetId = (event.target as HTMLSelectElement).value
  adjustmentForm.newValue = ''
}

function onAdjustmentFieldChange(): void {
  adjustmentForm.newValue = ''
}

async function submitAdjustment(): Promise<void> {
  formError.value = ''
  const review = detailReview.value
  if (!review) return
  if (!adjustmentForm.targetId) {
    formError.value = '请选择调整对象'
    return
  }
  if (!adjustmentForm.field) {
    formError.value = '请选择要修改的字段'
    return
  }
  const rawValue = String(adjustmentForm.newValue ?? '').trim()
  if (!rawValue) {
    formError.value = '请填写新的值'
    return
  }
  if (!adjustmentForm.reason.trim()) {
    formError.value = '请写清楚调整原因，方便以后回看'
    return
  }
  const meta = adjustmentFieldMeta.value
  if (!meta) return
  let normalized = rawValue
  if (meta.type === 'date') {
    normalized = fromDateInput(rawValue) ?? ''
  } else if (meta.type === 'number') {
    normalized = String(Number(rawValue))
  }
  saving.value = true
  try {
    await saveAdjustment({
      reviewId: review.id,
      targetType: adjustmentForm.targetType,
      targetId: adjustmentForm.targetId,
      field: adjustmentForm.field,
      oldValue: adjustmentOldValue.value,
      newValue: normalized,
      reason: adjustmentForm.reason.trim(),
      status: AdjustmentStatus.PROPOSED,
    })
    adjustmentModalOpen.value = false
    success('调整已生成，确认预览后才能应用')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const applyTarget = ref<Adjustment | null>(null)

const applyNewDisplay = computed(() => {
  const adjustment = applyTarget.value
  if (!adjustment) return ''
  const meta = ADJUSTMENT_FIELDS[adjustment.targetType]?.find(
    (item) => item.key === adjustment.field,
  )
  if (meta?.type === 'date') return formatDate(adjustment.newValue)
  return adjustment.newValue
})

function openApply(adjustment: Adjustment): void {
  applyTarget.value = adjustment
}

async function confirmApply(): Promise<void> {
  const adjustment = applyTarget.value
  if (!adjustment) return
  saving.value = true
  try {
    await applyAdjustment(adjustment)
    success('调整已应用，计划已更新')
    applyTarget.value = null
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    saving.value = false
  }
}

async function rejectAdjustment(adjustment: Adjustment): Promise<void> {
  try {
    await setAdjustmentStatus(adjustment.id, AdjustmentStatus.REJECTED)
    success('调整已拒绝，不会修改原计划')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

function adjustmentFieldLabel(adjustment: Adjustment): string {
  return (
    ADJUSTMENT_FIELDS[adjustment.targetType]?.find(
      (item) => item.key === adjustment.field,
    )?.label ?? adjustment.field ?? '未指定字段'
  )
}

function adjustmentNewDisplay(adjustment: Adjustment): string {
  const meta = ADJUSTMENT_FIELDS[adjustment.targetType]?.find(
    (item) => item.key === adjustment.field,
  )
  if (meta?.type === 'date') return formatDate(adjustment.newValue)
  return adjustment.newValue
}

function previewContent(content: string): string {
  return content
    .replace(/^##.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
}

function reviewDateRange(review: Review): string {
  if (!review.startDate && !review.endDate) return formatDate(review.targetDate)
  return `${formatShortDate(review.startDate)} — ${formatShortDate(review.endDate)}`
}

const maxTasks = computed(() =>
  Math.max(1, ...trend.value.map((point) => point.taskCount)),
)
const maxHabits = computed(() =>
  Math.max(1, ...trend.value.map((point) => point.habitCount)),
)
const maxMinutes = computed(() =>
  Math.max(1, ...trend.value.map((point) => point.learningMinutes)),
)

const trendHasData = computed(() =>
  trend.value.some(
    (point) => point.taskCount > 0 || point.habitCount > 0 || point.learningMinutes > 0,
  ),
)

function barWidth(value: number, max: number): string {
  if (value <= 0) return '0%'
  return `${Math.max(5, (value / max) * 100)}%`
}

function openCreateForType(type: ReviewType): void {
  openReviewCreate(type)
}

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  await refresh()
  const create = String(route.query.create ?? '')
  const typeMap: Record<string, ReviewType> = {
    daily: ReviewType.DAILY,
    weekly: ReviewType.WEEKLY,
    monthly: ReviewType.MONTHLY,
    milestone: ReviewType.MILESTONE,
    session: ReviewType.SESSION,
  }
  const type = typeMap[create]
  if (type) {
    activeView.value = 'reviews'
    openReviewCreate(type)
    await router.replace('/review')
  }
})
</script>

<template>
  <div class="page review-page">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">成长闭环 · 复盘与洞察</p>
        <h2 class="page-title">复盘与洞察</h2>
        <p class="page-subtitle">
          复盘不是日记。检查哪些有效、问题在哪里，再把发现转化为有预览、可拒绝的计划调整。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" @click="openReviewCreate(ReviewType.DAILY)">
          <AppIcon name="refresh" :size="15" />
          开始复盘
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="review-stats">
      <div class="review-stat">
        <span class="stat-icon"><AppIcon name="refresh" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.reviewsWeek }}</span>
          <span class="stat-caption">近 7 天复盘</span>
        </div>
      </div>
      <div class="review-stat">
        <span class="stat-icon icon-blue"><AppIcon name="check" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.completedTasksWeek }}</span>
          <span class="stat-caption">近 7 天完成任务</span>
        </div>
      </div>
      <div class="review-stat">
        <span class="stat-icon icon-amber"><AppIcon name="repeat" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.habitWeek }}</span>
          <span class="stat-caption">近 7 天习惯执行</span>
        </div>
      </div>
      <div class="review-stat">
        <span class="stat-icon icon-violet"><AppIcon name="clock" :size="16" /></span>
        <div>
          <span class="stat-number stat-small">{{ formatDuration(stats.learningMinutesWeek) }}</span>
          <span class="stat-caption">近 7 天学习时长</span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar">
      <div class="view-tabs" role="tablist" aria-label="复盘视图">
        <button
          class="view-tab"
          :class="{ active: activeView === 'reviews' }"
          role="tab"
          :aria-selected="activeView === 'reviews'"
          @click="activeView = 'reviews'"
        >
          <AppIcon name="inbox" :size="15" />
          复盘记录
          <span class="tab-count">{{ visibleReviews.length }}</span>
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'insights' }"
          role="tab"
          :aria-selected="activeView === 'insights'"
          @click="activeView = 'insights'"
        >
          <AppIcon name="dashboard" :size="15" />
          成长洞察
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

    <div v-if="loading" class="skeleton review-loading" />

    <template v-else>
      <section v-if="activeView === 'reviews'" class="reviews-view">
        <article class="start-strip card">
          <div class="start-strip-copy">
            <p class="page-eyebrow">Check → Act</p>
            <h3>从哪个尺度开始复盘？</h3>
            <p>不同尺度检查不同问题。学习看输出，每日看行动，每周看计划与调整。</p>
          </div>
          <div class="start-actions">
            <button
              v-for="type in reviewTypes"
              :key="type"
              class="start-chip"
              @click="openCreateForType(type)"
            >
              <span class="start-chip-icon">
                <AppIcon
                  :name="
                    type === 'SESSION'
                      ? 'book'
                      : type === 'DAILY'
                        ? 'check'
                        : type === 'WEEKLY'
                          ? 'refresh'
                          : type === 'MONTHLY'
                            ? 'calendar'
                            : 'flag'
                  "
                  :size="14"
                />
              </span>
              {{ reviewTypeLabels[type] }}
            </button>
          </div>
        </article>

        <div class="review-filter">
          <button
            class="filter-chip"
            :class="{ active: filterType === 'all' }"
            @click="filterType = 'all'"
          >
            全部
            <span>{{ visibleReviews.length }}</span>
          </button>
          <button
            v-for="type in reviewTypes"
            :key="type"
            class="filter-chip"
            :class="{ active: filterType === type }"
            @click="filterType = type"
          >
            {{ reviewTypeLabels[type] }}
            <span>{{ typeCounts[type] ?? 0 }}</span>
          </button>
        </div>

        <EmptyState
          v-if="filteredReviews.length === 0"
          title="这个尺度还没有复盘"
          description="完成一次复盘，把发现转成具体调整；只写感受而不改变计划的复盘很难产生长期价值。"
        >
          <button class="btn btn-sm btn-secondary" @click="openReviewCreate(ReviewType.DAILY)">
            开始每日复盘
          </button>
        </EmptyState>

        <div v-else class="review-list">
          <article
            v-for="review in filteredReviews"
            :key="review.id"
            class="review-card card"
            :class="{ archived: review.archivedAt }"
          >
            <div class="review-card-top">
              <span class="review-type">{{ reviewTypeLabels[review.reviewType] }}</span>
              <span class="badge">{{ reviewStatusLabels[review.status] }}</span>
              <span v-if="review.archivedAt" class="badge badge-amber">已归档</span>
              <span class="review-energy">
                <AppIcon name="spark" :size="11" />
                精力 {{ review.energyLevel }}/5
              </span>
            </div>
            <h4 class="review-card-title">
              {{ formatDate(review.targetDate) }}
              <span>{{ reviewDateRange(review) }}</span>
            </h4>
            <p class="review-preview">{{ previewContent(review.content) || '这次复盘没有正文。' }}</p>
            <div class="review-card-meta">
              <span><AppIcon name="bulb" :size="11" /> {{ reviewCounts[review.id]?.findings ?? 0 }} 条发现</span>
              <span><AppIcon name="sliders" :size="11" /> {{ reviewCounts[review.id]?.adjustments ?? 0 }} 条调整</span>
            </div>
            <div class="review-card-foot">
              <button class="link-btn" @click="openDetail(review)">
                查看复盘
                <AppIcon name="arrow-right" :size="12" />
              </button>
              <div class="row-actions">
                <button
                  v-if="!review.archivedAt"
                  class="icon-btn"
                  title="编辑复盘"
                  aria-label="编辑复盘"
                  @click="openReviewEdit(review)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="review.archivedAt ? '恢复复盘' : '归档复盘'"
                  :aria-label="review.archivedAt ? '恢复复盘' : '归档复盘'"
                  @click="askArchive(review)"
                >
                  <AppIcon :name="review.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="insights-view">
        <article class="card card-pad trend-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="dashboard" :size="16" />
                最近 4 周趋势
              </h3>
              <p class="section-note">任务、习惯与学习分别统计，不混成一个“生产力分数”。</p>
            </div>
          </div>
          <div class="trend-legend">
            <span><span class="legend-dot task-dot" /> 完成任务</span>
            <span><span class="legend-dot habit-dot" /> 习惯执行</span>
            <span><span class="legend-dot learning-dot" /> 学习时长</span>
          </div>
          <div v-if="trendHasData" class="trend-table">
            <div class="trend-row trend-head">
              <span>周起始</span>
              <span>任务</span>
              <span>习惯</span>
              <span>学习</span>
            </div>
            <div v-for="point in trend" :key="point.key" class="trend-row">
              <span class="trend-week">{{ point.label }}</span>
              <span class="trend-cell">
                <span class="trend-bar task-bar" :style="{ width: barWidth(point.taskCount, maxTasks) }" />
                <strong>{{ point.taskCount }}</strong>
              </span>
              <span class="trend-cell">
                <span class="trend-bar habit-bar" :style="{ width: barWidth(point.habitCount, maxHabits) }" />
                <strong>{{ point.habitCount }}</strong>
              </span>
              <span class="trend-cell">
                <span class="trend-bar learning-bar" :style="{ width: barWidth(point.learningMinutes, maxMinutes) }" />
                <strong>{{ point.learningMinutes }} 分</strong>
              </span>
            </div>
          </div>
          <p v-else class="data-pending">
            数据积累中：近 4 周还没有任务完成、习惯执行或学习时长记录。先持续记录一周，再查看趋势。
          </p>
        </article>

        <div class="insight-data-grid">
          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="target" :size="16" />
                  方向时间投入
                </h3>
                <p class="section-note">近 28 天，由任务关联的目标方向汇总时间盒与学习会话。</p>
              </div>
              <span class="data-chip">28 天</span>
            </div>
            <div v-if="directionInsightTotal > 0" class="direction-list">
              <div v-for="row in directionTime" :key="row.id" class="direction-row">
                <div class="direction-row-head">
                  <span class="direction-name">
                    <span class="direction-dot" :style="{ background: row.color }" />
                    {{ row.name }}
                  </span>
                  <strong>{{ formatDuration(row.focusMinutes + row.learningMinutes) }}</strong>
                </div>
                <div class="stacked-track">
                  <span
                    class="stacked-focus"
                    :style="{ width: barWidth(row.focusMinutes, maxDirectionMinutes) }"
                  />
                  <span
                    class="stacked-learning"
                    :style="{ width: barWidth(row.learningMinutes, maxDirectionMinutes) }"
                  />
                </div>
                <div class="direction-row-meta">
                  <span>执行 {{ formatDuration(row.focusMinutes) }}</span>
                  <span>学习 {{ formatDuration(row.learningMinutes) }}</span>
                  <span>周预算 {{ formatDuration(row.weeklyBudget) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="data-pending">
              数据积累中：还没有通过目标关联到发展方向的时间盒或学习会话。
            </p>
          </article>

          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="sliders" :size="16" />
                  计划与实际
                </h3>
                <p class="section-note">按周比较计划任务/时长与完成/实际记录，不用单一分数替代差异。</p>
              </div>
            </div>
            <div
              v-if="planActual.some((point) => point.plannedTasks || point.completedTasks || point.plannedMinutes || point.recordedMinutes)"
              class="compare-list"
            >
              <div v-for="point in planActual" :key="point.key" class="compare-week">
                <div class="compare-week-head">
                  <strong>周 {{ point.label }}</strong>
                  <span>{{ point.completedTasks }} / {{ point.plannedTasks }} 任务</span>
                </div>
                <div class="compare-line">
                  <span>任务</span>
                  <div class="compare-bars">
                    <i class="compare-plan" :style="{ width: barWidth(point.plannedTasks, planActualMaxTasks) }" />
                    <i class="compare-actual" :style="{ width: barWidth(point.completedTasks, planActualMaxTasks) }" />
                  </div>
                </div>
                <div class="compare-line">
                  <span>时长</span>
                  <div class="compare-bars">
                    <i class="compare-plan" :style="{ width: barWidth(point.plannedMinutes, planActualMaxMinutes) }" />
                    <i class="compare-actual" :style="{ width: barWidth(point.recordedMinutes, planActualMaxMinutes) }" />
                  </div>
                </div>
                <div class="compare-values">
                  <span>计划 {{ formatDuration(point.plannedMinutes) }}</span>
                  <span>实际 {{ formatDuration(point.recordedMinutes) }}</span>
                </div>
              </div>
              <div class="compare-legend">
                <span><i class="plan-dot" /> 计划</span>
                <span><i class="actual-dot" /> 实际</span>
              </div>
            </div>
            <p v-else class="data-pending">
              数据积累中：还没有可比较的任务计划或时间盒实际记录。
            </p>
          </article>

          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="flag" :size="16" />
                  目标与任务进度
                </h3>
                <p class="section-note">进度来自任务完成情况；人工进度模式会明确标注为人工值。</p>
              </div>
            </div>
            <div v-if="goalProgress.length" class="goal-progress-list">
              <div v-for="goal in goalProgress" :key="goal.id" class="goal-progress-row">
                <div class="goal-progress-head">
                  <span :title="goal.title">{{ goal.title }}</span>
                  <strong>{{ goal.progress }}%</strong>
                </div>
                <div class="progress-track compact-track">
                  <span class="progress-bar" :style="{ width: `${goal.progress}%` }" />
                </div>
                <small>
                  任务 {{ goal.taskDone }}/{{ goal.taskTotal }}
                </small>
              </div>
            </div>
            <p v-else class="data-pending">数据积累中：还没有进行中的目标。</p>
          </article>

          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="spark" :size="16" />
                  能力证据
                </h3>
                <p class="section-note">仅显示存在 CompetencyEvidence 的能力；学习时长不会自动推导等级。</p>
              </div>
            </div>
            <div v-if="competencyEvidence.length" class="competency-evidence-list">
              <div v-for="row in competencyEvidence" :key="row.id" class="competency-evidence-row">
                <div>
                  <strong>{{ row.name }}</strong>
                  <small>{{ row.evidenceCount }} 条评价证据</small>
                </div>
                <div class="level-change">
                  <span>{{ row.currentLevel }}</span>
                  <AppIcon name="arrow-right" :size="11" />
                  <strong>{{ row.latestLevel }}</strong>
                  <em v-if="row.change !== 0" :class="{ negative: row.change < 0 }">
                    {{ row.change > 0 ? '+' : '' }}{{ row.change }}
                  </em>
                </div>
              </div>
            </div>
            <p v-else class="data-pending">
              数据积累中：还没有带评价等级的能力证据。先在学习成果中记录 Evidence，再完成能力评价。
            </p>
          </article>

          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="inbox" :size="16" />
                  学习记录类型
                </h3>
                <p class="section-note">统计真实 LearningRecord，不把会话数量当作知识掌握程度。</p>
              </div>
            </div>
            <div v-if="learningMixTotal > 0" class="mix-bars">
              <div v-for="row in learningMix" :key="row.type" class="mix-row">
                <span>{{ learningRecordTypeLabels[row.type] }}</span>
                <div class="mix-track">
                  <i :style="{ width: barWidth(row.count, learningMixTotal) }" />
                </div>
                <strong>{{ row.count }}</strong>
              </div>
            </div>
            <p v-else class="data-pending">数据积累中：还没有学习记录。</p>
          </article>

          <article class="card card-pad insight-data-card">
            <div class="section-head">
              <div>
                <h3 class="section-title">
                  <AppIcon name="repeat" :size="16" />
                  习惯执行与障碍
                </h3>
                <p class="section-note">近 28 天 HabitLog 的微行为、锚点与 M/A/P 线索分布。</p>
              </div>
            </div>
            <template v-if="habitDiagnostics.logCount > 0">
              <div class="habit-metrics">
                <div><strong>{{ habitDiagnostics.tinyRate }}%</strong><span>微行为完成率</span></div>
                <div><strong>{{ habitDiagnostics.anchorRate }}%</strong><span>锚点触发率</span></div>
                <div><strong>{{ habitDiagnostics.expandedRate }}%</strong><span>扩展完成率</span></div>
              </div>
              <div class="habit-map-bars">
                <div v-for="row in habitDiagnostics.map" :key="row.code" class="mix-row">
                  <span>{{ row.code }} · {{ row.label }}</span>
                  <div class="mix-track habit-mix-track">
                    <i :style="{ width: barWidth(row.count, Math.max(1, habitMapTotal)) }" />
                  </div>
                  <strong>{{ row.count }}</strong>
                </div>
              </div>
              <div v-if="habitDiagnostics.obstacles.length" class="obstacle-list">
                <span v-for="row in habitDiagnostics.obstacles" :key="row.label" class="obstacle-chip">
                  {{ row.label }} · {{ row.count }}
                </span>
              </div>
              <p v-else class="inline-note">没有记录具体障碍，下一步可在 HabitLog 中补充触发情境。</p>
            </template>
            <p v-else class="data-pending">数据积累中：近 28 天还没有习惯记录。</p>
          </article>
        </div>

        <article class="card card-pad insight-card">
          <div class="section-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="bulb" :size="16" />
                系统观察
              </h3>
              <p class="section-note">由当前数据生成，只作为复盘线索，不替代你的判断。</p>
            </div>
          </div>
          <ul class="insight-list">
            <li v-for="(insight, index) in insights" :key="index" class="insight-item">
              <span class="insight-index">{{ index + 1 }}</span>
              <p>{{ insight }}</p>
            </li>
          </ul>
        </article>

        <article class="card card-pad coverage-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="layers" :size="16" />
              复盘覆盖
            </h3>
          </div>
          <div class="coverage-grid">
            <div v-for="type in reviewTypes" :key="type" class="coverage-item">
              <span class="coverage-value">{{ typeCounts[type] ?? 0 }}</span>
              <span class="coverage-label">{{ reviewTypeLabels[type] }}</span>
            </div>
          </div>
          <p class="coverage-note">
            建议至少保持每日复盘与每周复盘。月度复盘和阶段复盘可以按节奏安排。
          </p>
        </article>
      </section>
    </template>

    <ModalDialog
      :open="reviewModalOpen"
      :title="reviewEditingId ? '编辑复盘' : '开始复盘'"
      subtitle="先记录事实与发现，再决定是否调整计划。"
      size="lg"
      @close="reviewModalOpen = false"
    >
      <form class="form" @submit.prevent="submitReview">
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="review-type">复盘类型</label>
            <select
              id="review-type"
              v-model="reviewForm.reviewType"
              class="select"
              @change="onReviewTypeChange"
            >
              <option v-for="type in reviewTypes" :key="type" :value="type">
                {{ reviewTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="review-status">状态</label>
            <select id="review-status" v-model="reviewForm.status" class="select">
              <option :value="ReviewStatus.DRAFT">草拟</option>
              <option :value="ReviewStatus.COMPLETED">已完成</option>
            </select>
          </div>
        </div>

        <div v-if="reviewForm.reviewType === ReviewType.SESSION" class="field">
          <label class="field-label" for="review-session">关联学习会话</label>
          <select
            id="review-session"
            v-model="reviewForm.linkedSessionId"
            class="select"
            @change="onSessionContextChange"
          >
            <option value="">不关联，手动填写日期</option>
            <option v-for="session in completedSessions" :key="session.id" :value="session.id">
              {{ session.learningIntention || '学习会话' }} ·
              {{ formatShortDate(session.startedAt) }}
            </option>
          </select>
        </div>

        <div v-if="reviewForm.reviewType === ReviewType.MILESTONE" class="field">
          <label class="field-label" for="review-milestone">关联里程碑</label>
          <select
            id="review-milestone"
            v-model="reviewForm.linkedMilestoneId"
            class="select"
            @change="onMilestoneContextChange"
          >
            <option value="">不关联，手动填写日期</option>
            <option v-for="milestone in activeMilestones" :key="milestone.id" :value="milestone.id">
              {{ milestone.name }}
            </option>
          </select>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="review-target">复盘目标日期</label>
            <input id="review-target" v-model="reviewForm.targetDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="review-start">周期开始</label>
            <input id="review-start" v-model="reviewForm.startDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="review-end">周期结束</label>
            <input id="review-end" v-model="reviewForm.endDate" class="input" type="date" />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="review-energy">精力自评</label>
          <select id="review-energy" v-model.number="reviewForm.energyLevel" class="select">
            <option v-for="option in energyOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <section class="auto-review-panel">
          <div class="section-head">
            <div>
              <h4 class="editor-title">
                <AppIcon name="layers" :size="14" />
                系统自动汇总
              </h4>
              <p class="section-note">
                只读取本周期已有任务、学习、习惯、成果与时间盒记录，不推断缺失数据。
              </p>
            </div>
            <label class="auto-toggle">
              <input v-model="reviewForm.includeAutoSummary" type="checkbox" />
              保存时附上汇总
            </label>
          </div>

          <div v-if="formContextHasData" class="auto-metrics">
            <div class="auto-metric">
              <strong>{{ formContext.completedTasks.length }} / {{ formContext.tasks.length }}</strong>
              <span>任务完成 · {{ formCompletionRate }}%</span>
            </div>
            <div class="auto-metric">
              <strong>{{ formatDuration(formContext.learningMinutes) }}</strong>
              <span>{{ formContext.sessions.length }} 次学习会话</span>
            </div>
            <div class="auto-metric">
              <strong>{{ formContext.habitLogs.length }}</strong>
              <span>习惯记录</span>
            </div>
            <div class="auto-metric">
              <strong>{{ formContext.evidences.length }}</strong>
              <span>成果证据</span>
            </div>
            <div class="auto-metric">
              <strong>{{ formatDuration(formContext.plannedMinutes) }}</strong>
              <span>计划时间盒</span>
            </div>
          </div>
          <p v-else class="auto-empty">
            数据积累中：本周期还没有任务、学习、习惯、成果或时间盒记录。先保存一条真实记录，图表与汇总才会出现。
          </p>

          <div v-if="reviewForm.reviewType === ReviewType.DAILY" class="auto-actions">
            <button type="button" class="btn btn-sm btn-secondary" @click="fillDailyOutcome">带入主要成果</button>
            <button type="button" class="btn btn-sm btn-secondary" @click="fillDailyBlockers">带入阻碍</button>
            <button type="button" class="btn btn-sm btn-secondary" @click="fillDailyLearningHabits">带入学习与习惯</button>
            <button type="button" class="btn btn-sm btn-secondary" @click="fillTomorrowFocus">生成明日重点</button>
          </div>

          <div
            v-else-if="reviewForm.reviewType === ReviewType.WEEKLY || reviewForm.reviewType === ReviewType.MONTHLY"
            class="pdca-auto"
          >
            <div v-for="(title, index) in reviewTitles" :key="title" class="pdca-auto-item">
              <span class="pdca-code">{{ title.charAt(0) }}</span>
              <span>{{ title.slice(4) }}</span>
              <button type="button" class="link-btn" @click="fillWeeklyAutoSection(index)">
                写入真实汇总
              </button>
            </div>
          </div>

          <div v-if="formIncompleteTasks.length" class="incomplete-reasons">
            <div class="auto-subhead">
              <h5>未完成任务原因</h5>
              <span>原因会随复盘正文一起保存</span>
            </div>
            <label
              v-for="task in formIncompleteTasks"
              :key="task.id"
              class="incomplete-reason-row"
            >
              <span class="incomplete-title" :title="task.title">{{ task.title }}</span>
              <select v-model="reviewForm.incompleteReasons[task.id]" class="select compact-select">
                <option value="">未选择原因</option>
                <option v-for="reason in incompleteReasonOptions" :key="reason" :value="reason">
                  {{ reason }}
                </option>
              </select>
            </label>
          </div>

          <div v-if="formContext.evidences.length" class="evidence-picker">
            <div class="auto-subhead">
              <h5>选择本次主要成果证据</h5>
              <span>仅选择真实 Evidence，不按学习时长推断能力提升</span>
            </div>
            <label v-for="evidence in formContext.evidences" :key="evidence.id" class="evidence-option">
              <input v-model="reviewForm.selectedEvidenceIds" type="checkbox" :value="evidence.id" />
              <span>
                <strong>{{ evidence.title }}</strong>
                <small>{{ evidenceTypeLabels[evidence.evidenceType] }}</small>
              </span>
            </label>
          </div>
        </section>

        <div class="sections">
          <div v-for="(title, index) in reviewTitles" :key="title" class="field">
            <label class="field-label" :for="`review-section-${index}`">{{ title }}</label>
            <textarea
              :id="`review-section-${index}`"
              v-model="reviewForm.sections[index]"
              class="textarea"
              :placeholder="
                reviewForm.reviewType === ReviewType.WEEKLY && index === 2
                  ? '哪些知识已经能独立输出？哪些任务未完成？为什么？'
                  : '写下事实、判断与下一步，不需要写成完整文章。'
              "
            />
          </div>
        </div>

        <div class="findings-editor">
          <div class="section-head">
            <div>
              <h4 class="editor-title">
                <AppIcon name="bulb" :size="14" />
                复盘发现
              </h4>
              <p class="section-note">发现记录问题；调整在复盘保存后单独生成。</p>
            </div>
            <button type="button" class="btn btn-sm btn-secondary" @click="addFinding">
              <AppIcon name="plus" :size="13" />
              添加发现
            </button>
          </div>
          <div v-if="reviewForm.findings.length === 0" class="editor-empty">
            还没有发现。可以先写一条“问题 / 有效做法 / 盲区 / 洞察”。
          </div>
          <div
            v-for="(finding, index) in reviewForm.findings"
            :key="finding.id ?? index"
            class="finding-editor"
          >
            <div class="finding-editor-head">
              <select v-model="finding.findingType" class="select finding-type">
                <option v-for="type in findingTypes" :key="type" :value="type">
                  {{ findingTypeLabels[type] }}
                </option>
              </select>
              <span class="finding-index">发现 {{ index + 1 }}</span>
              <button
                type="button"
                class="icon-btn finding-remove"
                title="移除发现"
                aria-label="移除发现"
                @click="removeFinding(index)"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
            <div class="field">
              <span class="field-label">问题或发现</span>
              <textarea v-model="finding.description" class="textarea" placeholder="具体发生了什么？" />
            </div>
            <div class="field">
              <div class="rootcause-head">
                <span class="field-label">根因</span>
                <button type="button" class="why-btn" @click="openWhy(index)">
                  用 5Why 找根因
                </button>
              </div>
              <textarea
                v-model="finding.rootCause"
                class="textarea"
                placeholder="不要停在“时间不够”，继续问为什么。"
              />
            </div>
            <div class="field">
              <span class="field-label">建议动作</span>
              <input
                v-model="finding.proposedAction"
                class="input"
                placeholder="例如：把任务拆成两个 30 分钟步骤"
              />
            </div>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="reviewModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : reviewEditingId ? '保存修改' : '保存复盘' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="whyOpen"
      title="5Why 根因分析"
      :subtitle="whyFinding?.description || '连续追问五次，直到找到可以改变的原因。'"
      @close="whyOpen = false"
    >
      <div class="form">
        <div v-for="(question, index) in whyQuestions" :key="index" class="why-row">
          <span class="why-index">{{ index + 1 }}</span>
          <div class="field">
            <label class="field-label" :for="`why-${index}`">{{ question }}</label>
            <input
              :id="`why-${index}`"
              v-model="whyInputs[index]"
              class="input"
              :placeholder="index === 0 ? '例如：论文阅读任务没有完成' : '继续追问上一层原因'"
            />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="whyOpen = false">取消</button>
          <button class="btn btn-primary" @click="saveWhy">写入根因</button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog
      :open="detailReview !== null"
      :title="detailReview ? `${reviewTypeLabels[detailReview.reviewType]} · ${formatDate(detailReview.targetDate)}` : '复盘详情'"
      :subtitle="detailReview ? reviewDateRange(detailReview) : ''"
      size="lg"
      @close="closeDetail"
    >
      <div v-if="detailReview" class="review-detail">
        <div class="detail-meta">
          <span class="badge">{{ reviewStatusLabels[detailReview.status] }}</span>
          <span class="badge badge-accent">精力 {{ detailReview.energyLevel }}/5</span>
          <span>{{ formatDate(detailReview.startDate) }} — {{ formatDate(detailReview.endDate) }}</span>
        </div>

        <div class="detail-content">{{ detailReview.content || '这次复盘没有正文。' }}</div>

        <div class="detail-section">
          <h4 class="detail-title">
            <AppIcon name="bulb" :size="14" />
            发现（{{ detailFindings.length }}）
          </h4>
          <EmptyState
            v-if="detailFindings.length === 0"
            title="没有记录发现"
            description="没有发现也可以调整，但先写清楚问题通常更容易做出好调整。"
          />
          <div v-else class="detail-findings">
            <article
              v-for="finding in detailFindings"
              :key="finding.id"
              class="detail-finding"
            >
              <span class="finding-type-badge">{{ findingTypeLabels[finding.findingType] }}</span>
              <p class="detail-finding-desc">{{ finding.description || '未填写描述' }}</p>
              <div v-if="finding.rootCause" class="detail-block">
                <span class="detail-block-label">根因</span>
                <p>{{ finding.rootCause }}</p>
              </div>
              <div v-if="finding.proposedAction" class="detail-block">
                <span class="detail-block-label">建议动作</span>
                <p>{{ finding.proposedAction }}</p>
              </div>
            </article>
          </div>
        </div>

        <div class="detail-section">
          <div class="section-head">
            <h4 class="detail-title">
              <AppIcon name="sliders" :size="14" />
              计划调整（{{ detailAdjustments.length }}）
            </h4>
            <button class="btn btn-sm btn-secondary" @click="openAdjustmentCreate">
              <AppIcon name="plus" :size="13" />
              新增调整
            </button>
          </div>

          <div class="adjustment-note">
            <AppIcon name="warning" :size="14" />
            调整先生成提案，确认预览后才写入目标对象，避免一次复盘自动大改长期规划。
          </div>

          <EmptyState
            v-if="detailAdjustments.length === 0"
            title="还没有计划调整"
            description="把发现转成对任务、目标、习惯或方向的具体修改。"
          />
          <div v-else class="adjustment-list">
            <article
              v-for="adjustment in detailAdjustments"
              :key="adjustment.id"
              class="adjustment-item"
              :class="`adj-${adjustment.status.toLowerCase()}`"
            >
              <div class="adjustment-head">
                <span class="adjustment-target-type">{{ adjustmentTargetTypeLabels[adjustment.targetType] }}</span>
                <span class="adjustment-target">{{ targetLabel(adjustment.targetType, adjustment.targetId) }}</span>
                <span class="badge" :class="{ 'badge-accent': adjustment.status === 'APPLIED', 'badge-danger': adjustment.status === 'REJECTED' }">
                  {{ adjustmentStatusLabels[adjustment.status] }}
                </span>
              </div>
              <p class="adjustment-field">{{ adjustmentFieldLabel(adjustment) }}</p>
              <div class="adjustment-change">
                <span class="old-value">{{ adjustment.oldValue }}</span>
                <AppIcon name="arrow-right" :size="12" />
                <span class="new-value">{{ adjustmentNewDisplay(adjustment) }}</span>
              </div>
              <p class="adjustment-reason">{{ adjustment.reason }}</p>
              <div v-if="adjustment.status === 'PROPOSED'" class="adjustment-actions">
                <button class="btn btn-sm btn-ghost" @click="rejectAdjustment(adjustment)">拒绝</button>
                <button class="btn btn-sm btn-primary" @click="openApply(adjustment)">预览并应用</button>
              </div>
            </article>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="openReviewEdit(detailReview)">编辑复盘</button>
          <button class="btn btn-primary" @click="closeDetail">关闭</button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog
      :open="adjustmentModalOpen"
      title="新增计划调整"
      subtitle="选择目标与字段，写清楚旧值、新值和原因。"
      @close="adjustmentModalOpen = false"
    >
      <form class="form" @submit.prevent="submitAdjustment">
        <div class="field">
          <label class="field-label" for="adjustment-type">调整对象类型</label>
          <select
            id="adjustment-type"
            v-model="adjustmentForm.targetType"
            class="select"
            @change="onAdjustmentTypeChange"
          >
            <option v-for="type in targetTypes" :key="type" :value="type">
              {{ adjustmentTargetTypeLabels[type] }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="adjustment-target">具体对象</label>
          <select id="adjustment-target" :value="adjustmentForm.targetId" class="select" @change="onAdjustmentTargetChange">
            <option value="" disabled>请选择对象</option>
            <option v-for="option in adjustmentTargetOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="adjustment-field">修改字段</label>
            <select
              id="adjustment-field"
              v-model="adjustmentForm.field"
              class="select"
              @change="onAdjustmentFieldChange"
            >
              <option value="" disabled>请选择字段</option>
              <option v-for="field in adjustmentFieldOptions" :key="field.key" :value="field.key">
                {{ field.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <span class="field-label">当前值</span>
            <div class="old-value-box">{{ adjustmentOldValue }}</div>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="adjustment-new">新的值</label>
          <select
            v-if="adjustmentFieldMeta?.type === 'select'"
            id="adjustment-new"
            v-model="adjustmentForm.newValue"
            class="select"
          >
            <option value="" disabled>请选择新值</option>
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <input
            v-else-if="adjustmentFieldMeta?.type === 'date'"
            id="adjustment-new"
            v-model="adjustmentForm.newValue"
            class="input"
            type="date"
          />
          <input
            v-else-if="adjustmentFieldMeta?.type === 'number'"
            id="adjustment-new"
            v-model="adjustmentForm.newValue"
            class="input"
            type="number"
          />
          <input
            v-else
            id="adjustment-new"
            v-model="adjustmentForm.newValue"
            class="input"
            placeholder="新的值"
          />
        </div>
        <div class="field">
          <label class="field-label" for="adjustment-reason">调整原因</label>
          <textarea
            id="adjustment-reason"
            v-model="adjustmentForm.reason"
            class="textarea"
            placeholder="为什么需要修改？这个调整如何解决复盘发现的问题？"
          />
        </div>
        <div class="adjustment-preview">
          预览：<strong>{{ adjustmentOldValue }}</strong>
          <AppIcon name="arrow-right" :size="12" />
          <strong>{{ adjustmentForm.newValue || '未填写' }}</strong>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="adjustmentModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : '生成调整提案' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="applyTarget !== null"
      title="预览并应用调整"
      subtitle="确认后会立即修改真实计划，并保留这次调整记录。"
      @close="applyTarget = null"
    >
      <div v-if="applyTarget" class="apply-preview">
        <div class="apply-row">
          <span>调整对象</span>
          <strong>{{ targetLabel(applyTarget.targetType, applyTarget.targetId) }}</strong>
        </div>
        <div class="apply-row">
          <span>修改字段</span>
          <strong>{{ adjustmentFieldLabel(applyTarget) }}</strong>
        </div>
        <div class="apply-change">
          <span class="apply-old">{{ applyTarget.oldValue }}</span>
          <AppIcon name="arrow-right" :size="14" />
          <span class="apply-new">{{ applyNewDisplay }}</span>
        </div>
        <div class="apply-reason">
          <span class="field-label">原因</span>
          <p>{{ applyTarget.reason }}</p>
        </div>
        <div class="alert alert-warning">
          <AppIcon name="warning" :size="15" />
          <span>请确认新值正确。应用后旧值会被覆盖，但调整记录仍然保留。</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="applyTarget = null">返回修改</button>
          <button class="btn btn-primary" :disabled="saving" @click="confirmApply">
            {{ saving ? '应用中…' : '确认应用调整' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
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

.review-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.review-stat {
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

.icon-blue {
  background: var(--blue-soft);
  color: var(--blue);
}

.icon-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.icon-violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.review-stat > div {
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.stat-small {
  font-size: 16px;
}

.stat-caption {
  font-size: 10.5px;
  color: var(--muted);
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

.review-loading {
  height: 360px;
}

.reviews-view,
.insights-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.start-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 22px;
  background:
    radial-gradient(100% 140% at 0% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 55%),
    var(--surface);
}

.start-strip-copy h3 {
  margin-top: 5px;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
}

.start-strip-copy p:last-child {
  margin-top: 4px;
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.65;
  max-width: 460px;
}

.start-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.start-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 10.5px;
  white-space: nowrap;
}

.start-chip:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
  background: var(--accent-faint);
}

.start-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--accent);
}

.review-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: 10px;
}

.filter-chip span {
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.filter-chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.review-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.review-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.review-card.archived {
  opacity: 0.65;
}

.review-card-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.review-type {
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 9px;
  font-weight: 600;
}

.review-energy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  color: var(--muted);
  font-size: 9px;
}

.review-card-title {
  margin-top: 9px;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
}

.review-card-title span {
  margin-left: 6px;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 9.5px;
  font-weight: 400;
}

.review-preview {
  margin-top: 5px;
  min-height: 34px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.review-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 9px;
  color: var(--muted);
  font-size: 9.5px;
}

.review-card-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.review-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--line-faint);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent);
  font-size: 10px;
  font-weight: 550;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 1px;
}

.row-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.trend-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 9.5px;
}

.trend-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: var(--accent);
}

.habit-dot {
  background: var(--amber);
}

.learning-dot {
  background: var(--blue);
}

.trend-table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.trend-row {
  display: grid;
  grid-template-columns: 70px repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-top: 1px solid var(--line-faint);
  font-size: 10px;
}

.trend-row:first-child {
  border-top: none;
}

.trend-head {
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 9px;
  font-weight: 600;
}

.trend-week {
  font-family: var(--font-mono);
  color: var(--ink-faint);
}

.trend-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.trend-cell strong {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  color: var(--ink-soft);
  white-space: nowrap;
}

.trend-bar {
  height: 5px;
  min-width: 0;
  max-width: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  opacity: 0.75;
}

.task-bar {
  background: var(--accent);
}

.habit-bar {
  background: var(--amber);
}

.learning-bar {
  background: var(--blue);
}

.trend-cell {
  position: relative;
}

.trend-bar {
  flex: 0 0 auto;
}

.insight-list {
  display: flex;
  flex-direction: column;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 0;
  border-top: 1px solid var(--line-faint);
}

.insight-item:first-child {
  border-top: none;
}

.insight-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.insight-item p {
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.coverage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 11px 5px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.coverage-value {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
}

.coverage-label {
  color: var(--muted);
  font-size: 9px;
  text-align: center;
}

.coverage-note {
  margin-top: 10px;
  color: var(--muted);
  font-size: 10px;
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

.sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.findings-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
}

.editor-empty {
  padding: 13px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 11px;
}

.finding-editor {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.finding-editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.finding-type {
  width: auto;
  min-width: 120px;
  height: 30px;
  padding-top: 0;
  padding-bottom: 0;
}

.finding-index {
  color: var(--muted);
  font-size: 9.5px;
}

.finding-remove {
  margin-left: auto;
  width: 26px;
  height: 26px;
}

.rootcause-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.why-btn {
  color: var(--accent);
  font-size: 9.5px;
  font-weight: 550;
}

.why-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.why-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  flex: none;
  margin-top: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}

.detail-content {
  padding: 13px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-line;
}

.detail-section {
  margin-top: 16px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
}

.detail-findings,
.adjustment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.detail-finding {
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.finding-type-badge {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--amber-soft);
  color: var(--amber);
  font-size: 8.5px;
  font-weight: 600;
}

.detail-finding-desc {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.65;
}

.detail-block {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--line-faint);
}

.detail-block-label {
  font-size: 8.5px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-block p {
  margin-top: 2px;
  color: var(--ink-soft);
  font-size: 10.5px;
  line-height: 1.7;
  white-space: pre-line;
}

.adjustment-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 9.5px;
  line-height: 1.6;
}

.adjustment-note .icon {
  flex: none;
  margin-top: 1px;
}

.adjustment-item {
  padding: 11px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--amber);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.adjustment-item.adj-applied {
  border-left-color: var(--accent);
}

.adjustment-item.adj-rejected {
  border-left-color: var(--line-strong);
  opacity: 0.68;
}

.adjustment-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.adjustment-target-type {
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8.5px;
}

.adjustment-target {
  font-size: 11px;
  font-weight: 600;
}

.adjustment-head .badge {
  margin-left: auto;
}

.adjustment-field {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.adjustment-change {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
}

.old-value {
  color: var(--muted);
  text-decoration: line-through;
}

.new-value {
  color: var(--accent-ink);
  font-weight: 600;
}

.adjustment-reason {
  margin-top: 4px;
  color: var(--ink-faint);
  font-size: 9.5px;
  line-height: 1.6;
}

.adjustment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid var(--line-faint);
}

.old-value-box {
  padding: 9px 11px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-faint);
  font-size: 12px;
}

.adjustment-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 10.5px;
}

.apply-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.apply-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
}

.apply-row span {
  color: var(--muted);
}

.apply-change {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.apply-old {
  color: var(--muted);
  text-decoration: line-through;
  font-size: 13px;
}

.apply-new {
  color: var(--accent-ink);
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}

.apply-reason p {
  margin-top: 3px;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.65;
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

/* ---------- 数据洞察 ---------- */
.insight-data-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.insight-data-card {
  min-width: 0;
}

.data-chip {
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 7px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  white-space: nowrap;
}

.data-pending {
  margin-top: 13px;
  padding: 18px 14px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.7;
}

.direction-list,
.goal-progress-list,
.competency-evidence-list,
.mix-bars,
.habit-map-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.direction-row,
.goal-progress-row,
.competency-evidence-row {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.direction-row-head,
.goal-progress-head,
.competency-evidence-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.direction-name,
.goal-progress-head span {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-row-head strong,
.goal-progress-head strong {
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
  white-space: nowrap;
}

.direction-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
}

.stacked-track {
  position: relative;
  display: flex;
  height: 7px;
  margin-top: 7px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--line-faint);
}

.stacked-track span {
  height: 100%;
  flex: none;
}

.stacked-focus {
  background: var(--accent);
}

.stacked-learning {
  background: var(--blue);
}

.direction-row-meta,
.compare-values {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin-top: 5px;
  color: var(--muted);
  font-size: 8.5px;
}

.compare-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.compare-week {
  padding: 9px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.compare-week-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 9.5px;
}

.compare-week-head span {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.compare-line {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 8.5px;
}

.compare-bars {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.compare-bars i {
  display: block;
  height: 3px;
  border-radius: var(--radius-pill);
}

.compare-plan {
  background: var(--line-strong);
}

.compare-actual {
  background: var(--accent);
}

.compare-legend {
  display: flex;
  gap: 12px;
  color: var(--muted);
  font-size: 8.5px;
}

.compare-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.plan-dot,
.actual-dot {
  width: 7px;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--line-strong);
}

.actual-dot {
  background: var(--accent);
}

.goal-progress-row small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font-size: 8.5px;
}

.compact-track {
  height: 4px;
  margin-top: 6px;
}

.competency-evidence-row > div:first-child {
  min-width: 0;
}

.competency-evidence-row strong,
.competency-evidence-row small {
  display: block;
}

.competency-evidence-row strong {
  overflow: hidden;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.competency-evidence-row small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 8.5px;
}

.level-change {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-family: var(--font-mono);
  font-size: 9px;
}

.level-change span {
  color: var(--muted);
}

.level-change strong {
  color: var(--accent-ink);
}

.level-change em {
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 8px;
  font-style: normal;
}

.level-change em.negative {
  background: var(--danger-soft);
  color: var(--danger);
}

.mix-row {
  display: grid;
  grid-template-columns: minmax(100px, 0.9fr) minmax(70px, 1.4fr) 24px;
  align-items: center;
  gap: 8px;
  color: var(--ink-soft);
  font-size: 9.5px;
}

.mix-row > strong {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
  text-align: right;
}

.mix-track {
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--line-faint);
}

.mix-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--blue);
}

.habit-mix-track i {
  background: var(--amber);
}

.habit-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.habit-metrics div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 7px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  text-align: center;
}

.habit-metrics strong {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
}

.habit-metrics span {
  color: var(--muted);
  font-size: 8px;
}

.obstacle-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 11px;
}

.obstacle-chip {
  padding: 3px 6px;
  border-radius: var(--radius-pill);
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 8.5px;
}

.inline-note {
  margin-top: 10px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.6;
}

/* ---------- 复盘自动汇总 ---------- */
.auto-review-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--accent-faint);
  border-radius: var(--radius-md);
  background: var(--accent-faint);
}

.auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  color: var(--accent-ink);
  font-size: 9.5px;
  font-weight: 550;
}

.auto-toggle input,
.evidence-option input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
}

.auto-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.auto-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 7px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.auto-metric strong {
  overflow: hidden;
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-metric span {
  overflow: hidden;
  color: var(--muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-empty {
  padding: 13px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 10px;
  line-height: 1.65;
}

.auto-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pdca-auto {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.pdca-auto-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 9.5px;
}

.pdca-auto-item .link-btn {
  margin-left: auto;
  white-space: nowrap;
}

.pdca-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
}

.auto-subhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
}

.auto-subhead h5 {
  font-size: 10px;
  font-weight: 600;
}

.auto-subhead span {
  color: var(--muted);
  font-size: 8.5px;
}

.incomplete-reasons,
.evidence-picker {
  padding-top: 11px;
  border-top: 1px solid var(--line);
}

.incomplete-reason-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  align-items: center;
  gap: 9px;
  margin-top: 6px;
}

.incomplete-title {
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-select {
  height: 29px;
  font-size: 9.5px;
}

.evidence-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.evidence-picker .auto-subhead {
  grid-column: 1 / -1;
}

.evidence-option {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
}

.evidence-option input {
  margin-top: 1px;
  flex: none;
}

.evidence-option span {
  min-width: 0;
}

.evidence-option strong,
.evidence-option small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-option strong {
  font-size: 9.5px;
  font-weight: 550;
}

.evidence-option small {
  margin-top: 1px;
  color: var(--muted);
  font-size: 8px;
}

@media (max-width: 1000px) {
  .review-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .start-strip {
    flex-direction: column;
    align-items: flex-start;
  }

  .start-actions {
    justify-content: flex-start;
  }

  .insight-data-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .review-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .auto-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .review-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid,
  .form-grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .coverage-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .trend-row {
    grid-template-columns: 52px repeat(3, minmax(0, 1fr));
    gap: 5px;
    font-size: 9px;
  }

  .trend-cell strong {
    font-size: 8px;
  }

  .why-row {
    flex-direction: column;
  }

  .why-index {
    margin-top: 0;
  }

  .auto-review-panel .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .auto-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pdca-auto,
  .evidence-picker {
    grid-template-columns: minmax(0, 1fr);
  }

  .incomplete-reason-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  .auto-subhead {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
