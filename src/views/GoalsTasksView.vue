<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import DetailDrawer from '@/components/DetailDrawer.vue'
import TaskTreeNode from '@/components/TaskTreeNode.vue'
import { useToast } from '@/composables/useToast'
import {
  useGoalsTasks,
  type GoalInput,
  type GoalsTasksKind,
  type TaskInput,
  type TimeboxInput,
} from '@/composables/useGoalsTasks'
import {
  GoalStatus,
  GoalType,
  Importance,
  Priority,
  ProgressMode,
  ReviewScheduleStatus,
  TaskStatus,
  TaskType,
  Urgency,
  goalStatusLabels,
  goalTypeLabels,
  priorityLabels,
  progressModeLabels,
  taskStatusLabels,
  taskTypeLabels,
  timeboxStatusLabels,
  type Competency,
  type Goal,
  type Task,
  type Timebox,
} from '@/domain'
import {
  formatDate,
  formatDuration,
  formatShortDate,
  formatTime,
  fromDateInput,
  fromDateTimeInput,
  nowIso,
  relativeDay,
  toDateInput,
  toDateTimeInput,
  todayKey,
} from '@/utils/date'

const { success, error: toastError } = useToast()
const route = useRoute()
const router = useRouter()

const {
  loading,
  error,
  goals,
  tasks,
  timeboxes,
  reviewSchedules,
  competencies,
  activeGoals,
  visibleGoals,
  visibleTasks,
  taskGoalIds,
  goalMilestoneIds,
  goalDirectionIds,
  milestones,
  directions,
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
  tasksForGoal,
  tasksForGoalTree,
  refresh,
  saveGoal,
  saveGoalRelations,
  saveTask,
  setTaskStatus,
  setGoalParent,
  moveTimeboxToDate,
  saveDependencies,
  saveTimebox,
  resizeTimebox,
  deleteTimebox,
  setArchived,
} = useGoalsTasks()

type MainView = 'goals' | 'tasks' | 'timeboxes'

const activeView = ref<MainView>('goals')
const goalFilter = ref('all')
const competencyFilter = ref('all')
const showCompleted = ref(true)
const goalDisplayMode = ref<'tree' | 'cards'>('tree')
const taskDisplayMode = ref<'wbs' | 'kanban'>('wbs')
type TimeboxDisplayMode = 'day' | 'week' | 'month' | 'list'
const timeboxDisplayMode = ref<TimeboxDisplayMode>('list')
const collapsedGoalIds = ref<Set<string>>(new Set())
const expandedGoalTaskIds = ref<Set<string>>(new Set())
const detailGoalId = ref<string | null>(null)
const detailTaskId = ref<string | null>(null)
const goalDragId = ref<string | null>(null)
const goalDropTargetId = ref<string | null>(null)

const goalTypes = Object.values(GoalType)
const goalStatuses = [
  GoalStatus.DRAFT,
  GoalStatus.ACTIVE,
  GoalStatus.PAUSED,
  GoalStatus.COMPLETED,
  GoalStatus.CANCELLED,
]
const progressModes = [ProgressMode.TASK_BASED, ProgressMode.MANUAL]
const priorities = [Priority.URGENT, Priority.HIGH, Priority.MEDIUM, Priority.LOW]
const taskTypes = Object.values(TaskType)
const taskStatuses = Object.values(TaskStatus)

const competencyOptions = computed(() =>
  competencies.value
    .filter((competency) => !competency.archivedAt)
    .sort((left, right) =>
      competencyPath(left.id).localeCompare(competencyPath(right.id), 'zh-CN'),
    ),
)

const competencyMap = computed<Record<string, Competency>>(() => {
  const map: Record<string, Competency> = {}
  for (const competency of competencies.value) {
    map[competency.id] = competency
  }
  return map
})

function competencyPath(id: string | null): string {
  if (!id) return ''
  const names: string[] = []
  const visited = new Set<string>()
  let current: Competency | undefined = competencyMap.value[id]
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    names.unshift(current.name)
    current = current.parentId ? competencyMap.value[current.parentId] : undefined
  }
  return names.join(' / ')
}

function competencyIsWithin(competencyId: string | null, ancestorId: string): boolean {
  const visited = new Set<string>()
  let currentId = competencyId
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) return true
    visited.add(currentId)
    currentId = competencyMap.value[currentId]?.parentId ?? null
  }
  return false
}

const displayedGoals = computed<Goal[]>(() => {
  if (competencyFilter.value === 'all') return visibleGoals.value

  const selected = new Set<string>()
  for (const goal of visibleGoals.value) {
    if (!competencyIsWithin(goal.competencyId, competencyFilter.value)) continue
    selected.add(goal.id)
    const visited = new Set<string>()
    let parentId = goal.parentGoalId
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      selected.add(parentId)
      parentId = goalMap.value[parentId]?.parentGoalId ?? null
    }
  }
  return visibleGoals.value.filter((goal) => selected.has(goal.id))
})

const goalMap = computed<Record<string, Goal>>(() => {
  const map: Record<string, Goal> = {}
  for (const goal of goals.value) map[goal.id] = goal
  return map
})

const taskMap = computed(() => new Map(tasks.value.map((task) => [task.id, task])))

function taskFor(timebox: Timebox): Task | undefined {
  return taskMap.value.get(timebox.taskId)
}

const goalTitlesByTask = computed<Record<string, string[]>>(() => {
  const result: Record<string, string[]> = {}
  for (const [taskId, ids] of Object.entries(taskGoalIds.value)) {
    result[taskId] = ids
      .map((id) => goalMap.value[id]?.title)
      .filter((title): title is string => Boolean(title))
  }
  return result
})

const predecessorTitlesByTask = computed<Record<string, string[]>>(() => {
  const result: Record<string, string[]> = {}
  for (const [taskId, ids] of Object.entries(predecessorIds.value)) {
    result[taskId] = ids
      .map((id) => taskNameById.value[id])
      .filter((title): title is string => Boolean(title))
  }
  return result
})

const timeboxCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const timebox of timeboxes.value) {
    counts[timebox.taskId] = (counts[timebox.taskId] ?? 0) + 1
  }
  return counts
})

const taskTree = computed(() => buildTaskTree(goalFilter.value, showCompleted.value))

const reviewAtByTask = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  const rows = reviewSchedules.value
    .filter(
      (row) =>
        row.taskId &&
        (row.status === ReviewScheduleStatus.PENDING ||
          row.status === ReviewScheduleStatus.DUE),
    )
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
  for (const row of rows) {
    if (row.taskId && !map[row.taskId]) {
      map[row.taskId] = row.scheduledAt
    }
  }
  return map
})
interface TimeboxGroup {
  key: string
  label: string
  items: Timebox[]
}

const timeboxGroups = computed<TimeboxGroup[]>(() => {
  const groups = new Map<string, TimeboxGroup>()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  for (const timebox of [...timeboxes.value].sort((left, right) =>
    left.plannedStart.localeCompare(right.plannedStart),
  )) {
    const key = toDateInput(timebox.plannedStart)
    let label = formatDate(timebox.plannedStart)
    if (key === todayKey()) label = '今天'
    else if (key === todayKey(tomorrow)) label = '明天'
    if (!groups.has(key)) groups.set(key, { key, label, items: [] })
    groups.get(key)?.items.push(timebox)
  }
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key))
})

const detailGoal = computed(
  () => goals.value.find((goal) => goal.id === detailGoalId.value) ?? null,
)

const detailGoalTasks = computed(() =>
  detailGoal.value ? tasksForGoal(detailGoal.value.id) : [],
)

const detailGoalChildren = computed(() =>
  detailGoal.value
    ? visibleGoals.value.filter((goal) => goal.parentGoalId === detailGoal.value?.id)
    : [],
)

const goalChildCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const goal of visibleGoals.value) {
    if (goal.parentGoalId) counts[goal.parentGoalId] = (counts[goal.parentGoalId] ?? 0) + 1
  }
  return counts
})

function openGoalDetail(goal: Goal): void {
  detailGoalId.value = goal.id
}

function closeGoalDetail(): void {
  detailGoalId.value = null
}

function editGoalFromDetail(): void {
  const goal = detailGoal.value
  closeGoalDetail()
  if (goal) openGoalEdit(goal)
}

function archiveGoalFromDetail(): void {
  const goal = detailGoal.value
  closeGoalDetail()
  if (goal) askArchive('goal', goal.id, goal.title, goal.archivedAt)
}

function openTaskFromGoal(task: Task): void {
  closeGoalDetail()
  openTaskDetail(task)
}

function addTaskForDetailGoal(): void {
  const goal = detailGoal.value
  if (goal) openTaskForGoal(goal)
}

function addChildGoalForDetail(): void {
  const goal = detailGoal.value
  if (goal) openGoalCreate(goal, goal.competencyId ?? undefined)
}

function timeboxForDetailGoal(): void {
  const goal = detailGoal.value
  if (!goal) return
  const firstTask = tasksForGoal(goal.id).find((task) => task.status !== TaskStatus.CANCELLED)
  closeGoalDetail()
  if (!firstTask) {
    openTaskForGoal(goal)
    formError.value = '先为这个目标添加一个可执行任务，再安排时间盒。'
    return
  }
  openTimeboxCreate(firstTask)
}

function filterByCompetency(competencyId: string | null): void {
  competencyFilter.value = competencyId ?? 'all'
  activeView.value = 'goals'
}

function archiveTaskFromDetail(): void {
  const task = detailTask.value
  closeTaskDetail()
  if (task) askArchive('task', task.id, task.title, task.archivedAt)
}

interface GoalTreeRow {
  goal: Goal
  depth: number
  hasChildren: boolean
}

const goalTreeRows = computed<GoalTreeRow[]>(() => {
  const visibleIds = new Set(displayedGoals.value.map((goal) => goal.id))
  const roots = displayedGoals.value.filter(
    (goal) => !goal.parentGoalId || !visibleIds.has(goal.parentGoalId),
  )
  const rows: GoalTreeRow[] = []
  const walk = (goal: Goal, depth: number): void => {
    const children = displayedGoals.value.filter((item) => item.parentGoalId === goal.id)
    rows.push({ goal, depth, hasChildren: children.length > 0 })
    if (!collapsedGoalIds.value.has(goal.id)) {
      for (const child of children) walk(child, depth + 1)
    }
  }
  for (const root of roots) walk(root, 0)
  return rows
})

function toggleGoalCollapse(goalId: string): void {
  const next = new Set(collapsedGoalIds.value)
  if (next.has(goalId)) next.delete(goalId)
  else next.add(goalId)
  collapsedGoalIds.value = next
}

function toggleGoalTasks(goalId: string): void {
  const next = new Set(expandedGoalTaskIds.value)
  if (next.has(goalId)) next.delete(goalId)
  else next.add(goalId)
  expandedGoalTaskIds.value = next
}

function startGoalDrag(goal: Goal, event: DragEvent): void {
  if (goal.archivedAt) return
  goalDragId.value = goal.id
  event.dataTransfer?.setData('text/plain', goal.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

async function dropGoalOn(target: Goal): Promise<void> {
  const sourceId = goalDragId.value
  goalDragId.value = null
  goalDropTargetId.value = null
  if (!sourceId || sourceId === target.id) return
  try {
    await setGoalParent(sourceId, target.id)
    success('目标层级已调整')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function dropGoalToRoot(): Promise<void> {
  const sourceId = goalDragId.value
  goalDragId.value = null
  goalDropTargetId.value = null
  if (!sourceId) return
  try {
    await setGoalParent(sourceId, null)
    success('目标已移动为顶层目标')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

function markGoalDropTarget(goal: Goal): void {
  if (goal.archivedAt) return
  goalDropTargetId.value = goal.id
}

function clearGoalDropTarget(goal: Goal): void {
  if (goalDropTargetId.value === goal.id) goalDropTargetId.value = null
}

function endGoalDrag(): void {
  goalDragId.value = null
  goalDropTargetId.value = null
}

const kanbanSource = computed(() =>
  visibleTasks.value.filter(
    (task) =>
      task.status !== TaskStatus.CANCELLED &&
      (goalFilter.value === 'all' ||
        (taskGoalIds.value[task.id] ?? []).includes(goalFilter.value)),
  ),
)

interface KanbanColumnDef {
  key: string
  title: string
  statuses: TaskStatus[]
  status: TaskStatus
}

interface KanbanColumn extends KanbanColumnDef {
  tasks: Task[]
}

const kanbanColumns = computed<KanbanColumn[]>(() => {
  const columns: KanbanColumnDef[] = [
    {
      key: 'todo',
      title: '待办',
      statuses: [TaskStatus.BACKLOG, TaskStatus.TODO],
      status: TaskStatus.TODO,
    },
    {
      key: 'doing',
      title: '进行中',
      statuses: [TaskStatus.IN_PROGRESS, TaskStatus.PAUSED, TaskStatus.BLOCKED],
      status: TaskStatus.IN_PROGRESS,
    },
    {
      key: 'done',
      title: '完成',
      statuses: [TaskStatus.COMPLETED],
      status: TaskStatus.COMPLETED,
    },
  ]
  return columns.map((column) => ({
    ...column,
    tasks: kanbanSource.value
      .filter((task) => column.statuses.includes(task.status))
      .sort((left, right) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999')),
  }))
})

const kanbanDragId = ref<string | null>(null)

function startKanbanDrag(task: Task, event: DragEvent): void {
  kanbanDragId.value = task.id
  event.dataTransfer?.setData('text/plain', task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

async function dropTaskToKanban(column: { key: string; title: string; status: TaskStatus }): Promise<void> {
  const taskId = kanbanDragId.value
  kanbanDragId.value = null
  if (!taskId) return
  const task = tasks.value.find((item) => item.id === taskId)
  if (!task) return
  if (column.status === TaskStatus.COMPLETED && incompleteChildren(task.id).length > 0) {
    forceTask.value = task
    forceOpen.value = true
    return
  }
  try {
    await setTaskStatus(task.id, column.status)
    success(`任务已移动到「${column.title ?? ''}」`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const detailTask = computed(
  () => tasks.value.find((task) => task.id === detailTaskId.value) ?? null,
)

const detailTaskGoalNames = computed(() => {
  if (!detailTask.value) return []
  return (taskGoalIds.value[detailTask.value.id] ?? [])
    .map((id) => goalMap.value[id]?.title)
    .filter((title): title is string => Boolean(title))
})

const detailTaskPredecessorNames = computed(() => {
  if (!detailTask.value) return []
  return (predecessorIds.value[detailTask.value.id] ?? [])
    .map((id) => taskNameById.value[id])
    .filter((title): title is string => Boolean(title))
})

const detailTaskTimeboxes = computed(() =>
  detailTask.value
    ? timeboxes.value.filter((timebox) => timebox.taskId === detailTask.value?.id)
    : [],
)

const detailTaskChildren = computed(() =>
  detailTask.value
    ? tasks.value.filter((task) => task.parentTaskId === detailTask.value?.id)
    : [],
)

function openTaskDetail(task: Task): void {
  detailTaskId.value = task.id
}

function closeTaskDetail(): void {
  detailTaskId.value = null
}

function editTaskFromDetail(): void {
  const task = detailTask.value
  closeTaskDetail()
  if (task) openTaskEdit(task)
}

function timeboxFromDetail(): void {
  const task = detailTask.value
  closeTaskDetail()
  if (task) openTimeboxCreate(task)
}

function dependenciesFromDetail(): void {
  const task = detailTask.value
  closeTaskDetail()
  if (task) openDependencies(task)
}

function learnTaskFromDetail(): void {
  const task = detailTask.value
  closeTaskDetail()
  if (task) {
    void router.push({ path: '/learning', query: { task: task.id } })
  }
}


function mondayOf(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay() === 0 ? 7 : result.getDay()
  result.setDate(result.getDate() - (day - 1))
  result.setHours(0, 0, 0, 0)
  return result
}

const weekAnchor = ref(new Date(mondayOf(new Date())))
const dayAnchor = ref(new Date())
const monthAnchor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const weekDayNames = ['一', '二', '三', '四', '五', '六', '日']
const timeboxDragId = ref<string | null>(null)

const timeboxWeekDays = computed(() => {
  return weekDayNames.map((weekday, index) => {
    const date = new Date(weekAnchor.value)
    date.setDate(date.getDate() + index)
    const key = toDateInput(date.toISOString())
    const items = timeboxes.value
      .filter((timebox) => toDateInput(timebox.plannedStart) === key)
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart))
    return {
      key,
      date,
      weekday,
      label: key === todayKey() ? '今天' : `周${weekday}`,
      isToday: key === todayKey(),
      items,
    }
  })
})

function shiftWeek(delta: number): void {
  const next = new Date(weekAnchor.value)
  next.setDate(next.getDate() + delta * 7)
  weekAnchor.value = next
}

function resetWeek(): void {
  weekAnchor.value = new Date(mondayOf(new Date()))
}

const timeboxDayView = computed(() => {
  const key = todayKey(dayAnchor.value)
  return {
    key,
    label: formatDate(dayAnchor.value.toISOString()),
    isToday: key === todayKey(),
    items: timeboxes.value
      .filter((timebox) => toDateInput(timebox.plannedStart) === key)
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart)),
  }
})

function shiftDay(delta: number): void {
  const next = new Date(dayAnchor.value)
  next.setDate(next.getDate() + delta)
  dayAnchor.value = next
}

function resetDay(): void {
  dayAnchor.value = new Date()
}

function dailyAnchorFor(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
}

const timeboxMonthDays = computed(() => {
  const first = new Date(monthAnchor.value.getFullYear(), monthAnchor.value.getMonth(), 1)
  const gridStart = mondayOf(first)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(date.getDate() + index)
    const key = todayKey(date)
    return {
      key,
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === monthAnchor.value.getMonth(),
      isToday: key === todayKey(),
      items: timeboxes.value
        .filter((timebox) => toDateInput(timebox.plannedStart) === key)
        .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart)),
    }
  })
})

const timeboxMonthLabel = computed(
  () => `${monthAnchor.value.getFullYear()} 年 ${monthAnchor.value.getMonth() + 1} 月`,
)

function shiftMonth(delta: number): void {
  monthAnchor.value = new Date(
    monthAnchor.value.getFullYear(),
    monthAnchor.value.getMonth() + delta,
    1,
  )
}

function resetMonth(): void {
  const now = new Date()
  monthAnchor.value = new Date(now.getFullYear(), now.getMonth(), 1)
}

async function adjustTimebox(timebox: Timebox, deltaMinutes: number): Promise<void> {
  try {
    await resizeTimebox(timebox.id, deltaMinutes)
    success(deltaMinutes > 0 ? '时间盒已延长 15 分钟' : '时间盒已缩短 15 分钟')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

function startTimeboxDrag(timebox: Timebox, event: DragEvent): void {
  timeboxDragId.value = timebox.id
  event.dataTransfer?.setData('text/plain', timebox.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

async function dropTimeboxToDay(dayKey: string): Promise<void> {
  const id = timeboxDragId.value
  timeboxDragId.value = null
  if (!id) return
  try {
    await moveTimeboxToDate(id, dayKey)
    success('时间盒日期已调整')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

interface GoalFormState {
  title: string
  description: string
  goalType: GoalType
  parentGoalId: string
  startDate: string
  dueDate: string
  priority: Priority
  successCriteria: string
  status: GoalStatus
  progressMode: ProgressMode
  manualProgress: number
  reviewFrequency: string
  competencyId: string
  milestoneIds: string[]
  directionIds: string[]
}

function emptyGoalForm(): GoalFormState {
  return {
    title: '',
    description: '',
    goalType: GoalType.OUTCOME,
    parentGoalId: '',
    startDate: '',
    dueDate: '',
    priority: Priority.MEDIUM,
    successCriteria: '',
    status: GoalStatus.ACTIVE,
    progressMode: ProgressMode.TASK_BASED,
    manualProgress: 0,
    reviewFrequency: '每周',
    competencyId: '',
    milestoneIds: [],
    directionIds: [],
  }
}

interface TaskFormState {
  title: string
  description: string
  taskType: TaskType
  parentTaskId: string
  startDate: string
  dueDate: string
  scheduledDate: string
  estimatedDuration: number
  priority: Priority
  importance: Importance
  urgency: Urgency
  status: TaskStatus
  completionCriteria: string
  goalIds: string[]
  competencyIds: string[]
}

function emptyTaskForm(): TaskFormState {
  return {
    title: '',
    description: '',
    taskType: TaskType.LEARNING,
    parentTaskId: '',
    startDate: '',
    dueDate: '',
    scheduledDate: '',
    estimatedDuration: 30,
    priority: Priority.MEDIUM,
    importance: Importance.IMPORTANT,
    urgency: Urgency.MEDIUM,
    status: TaskStatus.TODO,
    completionCriteria: '',
    goalIds: [],
    competencyIds: [],
  }
}

interface TimeboxFormState {
  goalId: string
  taskId: string
  plannedStart: string
  plannedEnd: string
  status: string
  note: string
}

function emptyTimeboxForm(): TimeboxFormState {
  return {
    goalId: '',
    taskId: '',
    plannedStart: '',
    plannedEnd: '',
    status: 'PLANNED',
    note: '',
  }
}

const goalForm = reactive<GoalFormState>(emptyGoalForm())
const taskForm = reactive<TaskFormState>(emptyTaskForm())
const timeboxForm = reactive<TimeboxFormState>(emptyTimeboxForm())

const modalKind = ref<'goal' | 'task' | 'timebox' | 'dependencies' | null>(null)
const goalEditingId = ref<string | null>(null)
const taskEditingId = ref<string | null>(null)
const timeboxEditingId = ref<string | null>(null)
const formError = ref('')
const saving = ref(false)

const modalTitle = computed(() => {
  if (modalKind.value === 'goal') return goalEditingId.value ? '编辑目标' : '创建目标'
  if (modalKind.value === 'task') return taskEditingId.value ? '编辑任务' : '创建任务'
  if (modalKind.value === 'timebox') return timeboxEditingId.value ? '编辑时间盒' : '安排时间盒'
  if (modalKind.value === 'dependencies') return '任务依赖'
  return ''
})

const modalSubtitle = computed(() => {
  if (modalKind.value === 'goal') {
    return '目标承接一个能力锚点，可以继续拆成子目标；能够直接行动时再添加任务。'
  }
  if (modalKind.value === 'task') {
    return '任务是一次性行动，可以和多个目标、能力关联，也可以独立存在。'
  }
  if (modalKind.value === 'timebox') {
    return '时间盒只负责安排现实时间，不替代任务本身。'
  }
  if (modalKind.value === 'dependencies') {
    return '前置任务完成后，当前任务才具备开始条件。系统会阻止依赖环路。'
  }
  return ''
})

function goalDescendantsLocal(goalId: string): string[] {
  const children = goals.value.filter((goal) => goal.parentGoalId === goalId)
  const ids: string[] = []
  for (const child of children) ids.push(child.id, ...goalDescendantsLocal(child.id))
  return ids
}

const blockedGoalParentIds = computed(() => {
  const ids = new Set<string>()
  if (goalEditingId.value) {
    ids.add(goalEditingId.value)
    for (const id of goalDescendantsLocal(goalEditingId.value)) ids.add(id)
  }
  return ids
})

const goalParentOptions = computed(() =>
  goals.value.filter(
    (goal) => !goal.archivedAt && !blockedGoalParentIds.value.has(goal.id),
  ),
)

const blockedTaskParentIds = computed(() => {
  const ids = new Set<string>()
  if (taskEditingId.value) {
    ids.add(taskEditingId.value)
    for (const id of taskDescendants(taskEditingId.value)) ids.add(id)
  }
  return ids
})

const taskParentOptions = computed(() =>
  tasks.value.filter(
    (task) => !task.archivedAt && !blockedTaskParentIds.value.has(task.id),
  ),
)

const openTaskOptions = computed(() =>
  visibleTasks.value
    .filter((task) => task.status !== TaskStatus.CANCELLED)
    .sort((left, right) => {
      const leftDone = left.status === TaskStatus.COMPLETED ? 1 : 0
      const rightDone = right.status === TaskStatus.COMPLETED ? 1 : 0
      return leftDone - rightDone
    }),
)

const timeboxGoalOptions = computed(() =>
  activeGoals.value
    .filter((goal) => goal.status !== GoalStatus.CANCELLED)
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
)

const timeboxTaskOptions = computed(() => {
  const goalId = timeboxForm.goalId
  if (!goalId) return openTaskOptions.value
  return tasksForGoalTree(goalId)
    .filter((task) => task.status !== TaskStatus.CANCELLED)
    .sort((left, right) => {
      const leftDone = left.status === TaskStatus.COMPLETED ? 1 : 0
      const rightDone = right.status === TaskStatus.COMPLETED ? 1 : 0
      return leftDone - rightDone
    })
})

function onTimeboxGoalChange(): void {
  if (!timeboxForm.taskId) return
  if (!timeboxTaskOptions.value.some((task) => task.id === timeboxForm.taskId)) {
    timeboxForm.taskId = ''
  }
}

function resetModal(): void {
  modalKind.value = null
  goalEditingId.value = null
  taskEditingId.value = null
  timeboxEditingId.value = null
  formError.value = ''
}

function openGoalCreate(parent?: Goal, competencyId?: string): void {
  goalEditingId.value = null
  Object.assign(goalForm, emptyGoalForm())
  if (parent) {
    goalForm.parentGoalId = parent.id
    goalForm.competencyId = parent.competencyId ?? ''
  }
  if (!goalForm.competencyId && competencyId && competencyMap.value[competencyId]) {
    goalForm.competencyId = competencyId
  }
  if (!goalForm.competencyId && competencyFilter.value !== 'all') {
    goalForm.competencyId = competencyFilter.value
  }
  formError.value = ''
  modalKind.value = 'goal'
}

function openGoalEdit(goal: Goal): void {
  goalEditingId.value = goal.id
  Object.assign(goalForm, {
    title: goal.title,
    description: goal.description,
    goalType: goal.goalType,
    parentGoalId: goal.parentGoalId ?? '',
    startDate: toDateInput(goal.startDate),
    dueDate: toDateInput(goal.dueDate),
    priority: goal.priority,
    successCriteria: goal.successCriteria,
    status: goal.status,
    progressMode: goal.progressMode,
    manualProgress: goal.manualProgress,
    reviewFrequency: goal.reviewFrequency,
    competencyId: goal.competencyId ?? '',
    milestoneIds: [...(goalMilestoneIds.value[goal.id] ?? [])],
    directionIds: [...(goalDirectionIds.value[goal.id] ?? [])],
  })
  formError.value = ''
  modalKind.value = 'goal'
}

function effectiveProgressMode(goal: Goal): ProgressMode {
  return goal.progressMode
}

async function submitGoal(): Promise<void> {
  formError.value = ''
  if (!goalForm.title.trim()) {
    formError.value = '目标名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: GoalInput = {
      title: goalForm.title.trim(),
      description: goalForm.description.trim(),
      goalType: goalForm.goalType,
      parentGoalId: goalForm.parentGoalId || null,
      competencyId: goalForm.competencyId || null,
      startDate: fromDateInput(goalForm.startDate),
      dueDate: fromDateInput(goalForm.dueDate),
      priority: goalForm.priority,
      successCriteria: goalForm.successCriteria.trim(),
      status: goalForm.status,
      progressMode: goalForm.progressMode,
      manualProgress: Math.max(0, Math.min(100, Number(goalForm.manualProgress) || 0)),
      reviewFrequency: goalForm.reviewFrequency.trim(),
    }
    const entity = await saveGoal(payload, goalEditingId.value ?? undefined)
    await saveGoalRelations(entity.id, [...goalForm.milestoneIds], [...goalForm.directionIds])
    const created = !goalEditingId.value
    resetModal()
    success(created ? '目标已创建' : '目标已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

function openTaskCreate(parent?: Task): void {
  taskEditingId.value = null
  Object.assign(taskForm, emptyTaskForm())
  if (parent) {
    taskForm.parentTaskId = parent.id
    const inherited = keywordsForTask(parent.id)
    taskForm.goalIds = [...inherited.goalIds]
    taskForm.competencyIds = [...inherited.competencyIds]
  }
  if (goalFilter.value !== 'all') taskForm.goalIds = [goalFilter.value]
  if (!taskForm.competencyIds.length && goalFilter.value !== 'all') {
    const competencyId = goalMap.value[goalFilter.value]?.competencyId
    if (competencyId) taskForm.competencyIds = [competencyId]
  }
  formError.value = ''
  modalKind.value = 'task'
}

function openTaskForGoal(goal: Goal): void {
  openTaskCreate()
  taskForm.goalIds = [goal.id]
  taskForm.competencyIds = goal.competencyId ? [goal.competencyId] : []
}

function openTaskEdit(task: Task): void {
  taskEditingId.value = task.id
  const keywords = keywordsForTask(task.id)
  Object.assign(taskForm, {
    title: task.title,
    description: task.description,
    taskType: task.taskType,
    parentTaskId: task.parentTaskId ?? '',
    startDate: toDateInput(task.startDate),
    dueDate: toDateInput(task.dueDate),
    scheduledDate: toDateInput(task.scheduledDate),
    estimatedDuration: task.estimatedDuration,
    priority: task.priority,
    importance: task.importance,
    urgency: task.urgency,
    status: task.status,
    completionCriteria: task.completionCriteria,
    goalIds: [...keywords.goalIds],
    competencyIds: [...keywords.competencyIds],
  })
  formError.value = ''
  modalKind.value = 'task'
}

async function submitTask(): Promise<void> {
  formError.value = ''
  if (!taskForm.title.trim()) {
    formError.value = '任务名称不能为空'
    return
  }
  const startDate = fromDateInput(taskForm.startDate)
  const dueDate = fromDateInput(taskForm.dueDate)
  if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
    formError.value = '截止日期不能早于开始日期'
    return
  }
  saving.value = true
  try {
    const existing = taskEditingId.value
      ? tasks.value.find((task) => task.id === taskEditingId.value)
      : null
    const payload: TaskInput = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      taskType: taskForm.taskType,
      parentTaskId: taskForm.parentTaskId || null,
      startDate,
      dueDate,
      scheduledDate: fromDateInput(taskForm.scheduledDate),
      estimatedDuration: Math.max(0, Number(taskForm.estimatedDuration) || 0),
      actualDuration: existing?.actualDuration ?? 0,
      priority: taskForm.priority,
      importance: taskForm.importance,
      urgency: taskForm.urgency,
      status: taskForm.status,
      completionCriteria: taskForm.completionCriteria.trim(),
      learningTemplateId: existing?.learningTemplateId ?? null,
      completedAt:
        taskForm.status === TaskStatus.COMPLETED
          ? existing?.completedAt ?? nowIso()
          : null,
    }
    const previousStatus = existing?.status
    const entity = await saveTask(
      payload,
      [...taskForm.goalIds],
      [...taskForm.competencyIds],
      taskEditingId.value ?? undefined,
    )
    if (previousStatus !== undefined && previousStatus !== taskForm.status) {
      await setTaskStatus(entity.id, taskForm.status)
    }
    const created = !taskEditingId.value
    resetModal()
    success(created ? '任务已创建' : '任务已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const forceOpen = ref(false)
const forceTask = ref<Task | null>(null)
const forceBusy = ref(false)

async function requestToggleStatus(task: Task): Promise<void> {
  try {
    if (task.status === TaskStatus.COMPLETED) {
      await setTaskStatus(task.id, TaskStatus.TODO)
      success('已标记为未完成')
      return
    }
    if (incompleteChildren(task.id).length > 0) {
      forceTask.value = task
      forceOpen.value = true
      return
    }
    await setTaskStatus(task.id, TaskStatus.COMPLETED)
    success('任务已完成')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function confirmForceComplete(): Promise<void> {
  const task = forceTask.value
  if (!task) return
  forceBusy.value = true
  try {
    await setTaskStatus(task.id, TaskStatus.COMPLETED)
    success('父任务已强制完成，未完成子任务保持原状态')
    forceOpen.value = false
    forceTask.value = null
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    forceBusy.value = false
  }
}

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{
  kind: GoalsTasksKind | 'timebox'
  id: string
  label: string
  archived: boolean
} | null>(null)

const confirmTitle = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'timebox') return '删除时间盒'
  return target.archived ? '恢复内容' : '归档内容'
})

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'timebox') {
    return `将删除时间盒「${target.label}」。不会删除任务本身，但计划时间与已完成记录会移除。`
  }
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在默认列表中。`
  return `将归档「${target.label}」。不会删除关联任务、目标或历史记录，归档后可以随时恢复。`
})

const confirmActionLabel = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'timebox') return '确认删除'
  return target.archived ? '确认恢复' : '确认归档'
})

function askArchive(kind: GoalsTasksKind, id: string, label: string, archivedAt: string | null): void {
  confirmTarget.value = { kind, id, label, archived: Boolean(archivedAt) }
  confirmOpen.value = true
}

function askDeleteTimebox(timebox: Timebox): void {
  confirmTarget.value = {
    kind: 'timebox',
    id: timebox.id,
    label: `${taskNameById.value[timebox.taskId] ?? '任务'} · ${formatShortDate(timebox.plannedStart)} ${formatTime(timebox.plannedStart)}`,
    archived: false,
  }
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    if (target.kind === 'timebox') {
      await deleteTimebox(target.id)
      success('时间盒已删除')
    } else {
      await setArchived(target.kind, target.id, !target.archived)
      success(target.archived ? '已恢复' : '已归档，可随时恢复')
    }
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

function openTimeboxCreate(task?: Task, dayKey?: string): void {
  timeboxEditingId.value = null
  Object.assign(timeboxForm, emptyTimeboxForm())
  const selected = task ?? openTaskOptions.value[0]
  if (selected) {
    timeboxForm.taskId = selected.id
    if (task) {
      const linkedGoalId = (taskGoalIds.value[task.id] ?? [])[0]
      if (linkedGoalId) timeboxForm.goalId = linkedGoalId
    }
    const base = dayKey
      ? new Date(`${dayKey}T09:00:00`)
      : selected.scheduledDate
        ? new Date(selected.scheduledDate)
        : new Date()
    if (!dayKey) {
      if (selected.scheduledDate) base.setHours(9, 0, 0, 0)
      else base.setMinutes(0, 0, 0)
    }
    timeboxForm.plannedStart = toDateTimeInput(base.toISOString())
    const end = new Date(base.getTime() + 60 * 60000)
    timeboxForm.plannedEnd = toDateTimeInput(end.toISOString())
  }
  formError.value = ''
  modalKind.value = 'timebox'
}

function openTimeboxEdit(timebox: Timebox): void {
  timeboxEditingId.value = timebox.id
  Object.assign(timeboxForm, {
    goalId: (taskGoalIds.value[timebox.taskId] ?? [])[0] ?? '',
    taskId: timebox.taskId,
    plannedStart: toDateTimeInput(timebox.plannedStart),
    plannedEnd: toDateTimeInput(timebox.plannedEnd),
    status: timebox.status,
    note: timebox.note,
  })
  formError.value = ''
  modalKind.value = 'timebox'
}

async function submitTimebox(): Promise<void> {
  formError.value = ''
  if (!timeboxForm.taskId) {
    formError.value = '请选择要安排的任务'
    return
  }
  const plannedStart = fromDateTimeInput(timeboxForm.plannedStart)
  const plannedEnd = fromDateTimeInput(timeboxForm.plannedEnd)
  if (!plannedStart || !plannedEnd) {
    formError.value = '请填写开始和结束时间'
    return
  }
  saving.value = true
  try {
    const payload: TimeboxInput = {
      taskId: timeboxForm.taskId,
      plannedStart,
      plannedEnd,
      plannedDuration: 0,
      actualStart: null,
      actualEnd: null,
      actualDuration: 0,
      status: timeboxForm.status as Timebox['status'],
      note: timeboxForm.note.trim(),
    }
    await saveTimebox(payload, timeboxEditingId.value ?? undefined)
    const created = !timeboxEditingId.value
    resetModal()
    success(created ? '时间盒已安排' : '时间盒已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const dependencyTask = ref<Task | null>(null)
const dependencySelected = ref<string[]>([])
const dependencySearch = ref('')

const dependencyOptions = computed(() => {
  const keyword = dependencySearch.value.trim().toLowerCase()
  return visibleTasks.value
    .filter((task) => task.id !== dependencyTask.value?.id)
    .filter(
      (task) =>
        !keyword ||
        task.title.toLowerCase().includes(keyword) ||
        task.description.toLowerCase().includes(keyword),
    )
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
})

function openDependencies(task: Task): void {
  dependencyTask.value = task
  dependencySelected.value = [...(predecessorIds.value[task.id] ?? [])]
  dependencySearch.value = ''
  formError.value = ''
  modalKind.value = 'dependencies'
}

function toggleDependency(taskId: string, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    if (!dependencySelected.value.includes(taskId)) dependencySelected.value.push(taskId)
  } else {
    dependencySelected.value = dependencySelected.value.filter((id) => id !== taskId)
  }
}

async function submitDependencies(): Promise<void> {
  const task = dependencyTask.value
  if (!task) return
  formError.value = ''
  saving.value = true
  try {
    await saveDependencies(task.id, [...dependencySelected.value])
    resetModal()
    success('任务依赖已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

function viewTasksOfGoal(goalId: string): void {
  goalFilter.value = goalId
  activeView.value = 'tasks'
  taskDisplayMode.value = 'wbs'
}

function toggleGoalRelation(list: string[], id: string, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    if (!list.includes(id)) list.push(id)
  } else {
    const index = list.indexOf(id)
    if (index >= 0) list.splice(index, 1)
  }
}

onMounted(async () => {
  await refresh()

  const competencyParam = String(route.query.competency ?? '')
  const linkedCompetency = competencyParam
    ? competencies.value.find((item) => item.id === competencyParam && !item.archivedAt)
    : undefined
  if (competencyParam) {
    if (linkedCompetency) {
      competencyFilter.value = linkedCompetency.id
      activeView.value = 'goals'
    } else {
      toastError('这个能力不存在或已经归档')
    }
  }

  const goalParam = String(route.query.goal ?? '')
  if (goalParam) {
    const goal = goals.value.find((item) => item.id === goalParam)
    if (goal) {
      activeView.value = 'goals'
      openGoalDetail(goal)
    } else {
      toastError('这个目标不存在或已经归档')
    }
  }

  const taskParam = String(route.query.task ?? '')
  if (taskParam) {
    const task = tasks.value.find((item) => item.id === taskParam)
    if (task) {
      activeView.value = 'tasks'
      openTaskDetail(task)
    } else {
      toastError('这个任务不存在或已经归档')
    }
  }

  const create = String(route.query.create ?? '')
  if (create === 'task') {
    openTaskCreate()
    if (linkedCompetency) taskForm.competencyIds = [linkedCompetency.id]
  } else if (create === 'goal') {
    openGoalCreate(undefined, linkedCompetency?.id)
  }

  if (competencyParam || goalParam || taskParam || create) {
    await router.replace('/goals')
  }
})
</script>

<template>
  <div class="page goals-tasks">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">执行与学习 · 目标与任务</p>
        <h2 class="page-title">目标与任务</h2>
        <p class="page-subtitle">
          从发展路线中的能力出发，逐层拆成目标、可执行任务，再为任务安排现实时间盒。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="openGoalCreate()">
          <AppIcon name="target" :size="15" />
          新建目标
        </button>
        <button class="btn btn-primary" @click="openTaskCreate()">
          <AppIcon name="plus" :size="15" />
          新建任务
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="exec-stats">
      <div class="exec-stat">
        <span class="stat-icon"><AppIcon name="target" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.activeGoals }}</span>
          <span class="stat-caption">进行中目标</span>
        </div>
      </div>
      <div class="exec-stat">
        <span class="stat-icon icon-blue"><AppIcon name="check" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.openTasks }}</span>
          <span class="stat-caption">未完成任务</span>
        </div>
      </div>
      <div class="exec-stat">
        <span class="stat-icon icon-amber"><AppIcon name="calendar" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.todayTasks }}</span>
          <span class="stat-caption">今日任务</span>
        </div>
      </div>
      <div class="exec-stat">
        <span class="stat-icon icon-violet"><AppIcon name="clock" :size="16" /></span>
        <div>
          <span class="stat-number stat-small">{{ formatDuration(stats.weekMinutes) }}</span>
          <span class="stat-caption">本周已安排</span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar">
      <div class="view-tabs" role="tablist" aria-label="目标与任务视图">
        <button
          class="view-tab"
          :class="{ active: activeView === 'goals' }"
          role="tab"
          :aria-selected="activeView === 'goals'"
          @click="activeView = 'goals'"
        >
          <AppIcon name="target" :size="15" />
          目标拆解
          <span class="tab-count">{{ visibleGoals.length }}</span>
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'tasks' }"
          role="tab"
          :aria-selected="activeView === 'tasks'"
          @click="activeView = 'tasks'"
        >
          <AppIcon name="layers" :size="15" />
          任务
          <span class="tab-count">{{ visibleTasks.length }}</span>
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'timeboxes' }"
          role="tab"
          :aria-selected="activeView === 'timeboxes'"
          @click="activeView = 'timeboxes'"
        >
          <AppIcon name="clock" :size="15" />
          时间盒
          <span class="tab-count">{{ timeboxes.length }}</span>
        </button>
      </div>

      <div class="toolbar-actions">
        <select
          v-if="activeView === 'tasks'"
          v-model="goalFilter"
          class="select goal-filter"
          aria-label="按目标筛选任务"
        >
          <option value="all">全部目标</option>
          <option v-for="goal in activeGoals" :key="goal.id" :value="goal.id">
            {{ goal.title }}
          </option>
        </select>
        <button
          v-if="activeView === 'tasks'"
          class="btn btn-ghost"
          :class="{ 'is-on': !showCompleted }"
          @click="showCompleted = !showCompleted"
        >
          <AppIcon name="check" :size="14" />
          {{ showCompleted ? '隐藏已完成' : '显示已完成' }}
        </button>
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

    <div v-if="loading" class="skeleton exec-loading" />

    <template v-else>
      <section v-if="activeView === 'goals'" class="goals-view">
        <div class="section-head goals-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="target" :size="16" />
              目标拆解
            </h3>
            <p class="section-note">
              从能力锚点逐层拆到可执行任务。能直接写任务时就停止拆解，进度按任务完成度计算。
            </p>
          </div>
          <div class="row">
            <div class="seg-control" role="group" aria-label="目标显示方式">
              <button
                class="seg-btn"
                :class="{ active: goalDisplayMode === 'tree' }"
                :aria-pressed="goalDisplayMode === 'tree'"
                @click="goalDisplayMode = 'tree'"
              >
                树形
              </button>
              <button
                class="seg-btn"
                :class="{ active: goalDisplayMode === 'cards' }"
                :aria-pressed="goalDisplayMode === 'cards'"
                @click="goalDisplayMode = 'cards'"
              >
                卡片
              </button>
            </div>
            <button class="btn btn-sm btn-secondary" @click="openGoalCreate()">
              <AppIcon name="plus" :size="14" />
              新建目标
            </button>
          </div>
        </div>

        <div class="goal-filter-bar" aria-label="目标能力筛选">
          <span>
            <AppIcon name="layers" :size="14" />
            能力锚点
          </span>
          <select v-model="competencyFilter" class="select goal-filter">
            <option value="all">全部能力</option>
            <option v-for="competency in competencyOptions" :key="competency.id" :value="competency.id">
              {{ competencyPath(competency.id) }}
            </option>
          </select>
          <button
            v-if="competencyFilter !== 'all'"
            class="link-btn"
            @click="competencyFilter = 'all'"
          >
            清除筛选
          </button>
        </div>

        <EmptyState
          v-if="displayedGoals.length === 0"
          title="还没有目标"
          description="先选择一个能力作为锚点，再把能力拆成有验收标准的目标。"
        >
          <button class="btn btn-sm btn-secondary" @click="openGoalCreate()">创建第一个目标</button>
        </EmptyState>

        <div v-else-if="goalDisplayMode === 'tree'" class="goal-tree card">
          <p class="goal-tree-hint">
            <AppIcon name="layers" :size="13" />
            拖动目标到另一个目标上可调整层级，拖到空白区域回到顶层。点击标题查看详情。
          </p>
          <div class="goal-tree-body" @dragover.prevent @drop.prevent="dropGoalToRoot">
            <template v-for="row in goalTreeRows" :key="row.goal.id">
            <div
              class="goal-tree-row"
              :class="{
                archived: row.goal.archivedAt,
                dragging: goalDragId === row.goal.id,
                'drop-target': goalDropTargetId === row.goal.id,
              }"
              :style="{ '--depth': row.depth }"
              :draggable="!row.goal.archivedAt"
              @dragstart="startGoalDrag(row.goal, $event)"
              @dragend="endGoalDrag"
              @dragover.prevent.stop="markGoalDropTarget(row.goal)"
              @dragleave.stop="clearGoalDropTarget(row.goal)"
              @drop.prevent.stop="dropGoalOn(row.goal)"
            >
              <button
                v-if="row.hasChildren"
                class="tree-toggle"
                :class="{ collapsed: collapsedGoalIds.has(row.goal.id) }"
                :aria-label="collapsedGoalIds.has(row.goal.id) ? '展开子目标' : '折叠子目标'"
                @click.stop="toggleGoalCollapse(row.goal.id)"
              >
                <AppIcon name="arrow-right" :size="12" />
              </button>
              <span v-else class="tree-toggle tree-toggle-empty" />
              <div
                class="goal-tree-main"
                role="button"
                tabindex="0"
                @click="openGoalDetail(row.goal)"
                @keydown.enter="openGoalDetail(row.goal)"
              >
                <span class="goal-tree-title">{{ row.goal.title }}</span>
                <span class="badge badge-accent">{{ goalTypeLabels[row.goal.goalType] }}</span>
                <span class="badge">{{ goalStatusLabels[row.goal.status] }}</span>
                <span v-if="row.goal.competencyId" class="badge goal-capability-badge">
                  {{ competencyPath(row.goal.competencyId) }}
                </span>
                <span v-if="row.goal.archivedAt" class="badge badge-amber">已归档</span>
                <span class="goal-tree-meta">
                  {{ progressForGoal(row.goal) }}% ·
                  <button
                    class="goal-task-toggle"
                    :class="{ open: expandedGoalTaskIds.has(row.goal.id) }"
                    :aria-expanded="expandedGoalTaskIds.has(row.goal.id)"
                    :aria-label="expandedGoalTaskIds.has(row.goal.id) ? '收起任务' : '展开任务'"
                    @click.stop="toggleGoalTasks(row.goal.id)"
                  >
                    {{ goalTaskStats[row.goal.id]?.done ?? 0 }}/{{ goalTaskStats[row.goal.id]?.total ?? 0 }}
                    任务
                    <AppIcon name="arrow-right" :size="11" />
                  </button>
                  · {{ goalChildCounts[row.goal.id] ?? 0 }} 子目标
                </span>
              </div>
              <div class="goal-tree-progress" :title="`进度 ${progressForGoal(row.goal)}%`">
                <span class="progress-track">
                  <span class="progress-bar" :style="{ width: `${progressForGoal(row.goal)}%` }" />
                </span>
              </div>
              <div class="goal-actions">
                <button
                  v-if="!row.goal.archivedAt"
                  class="icon-btn"
                  title="添加子目标"
                  aria-label="添加子目标"
                  @click.stop="openGoalCreate(row.goal, row.goal.competencyId ?? undefined)"
                >
                  <AppIcon name="plus" :size="13" />
                </button>
                <button
                  v-if="!row.goal.archivedAt"
                  class="icon-btn"
                  title="添加任务"
                  aria-label="添加任务"
                  @click.stop="openTaskForGoal(row.goal)"
                >
                  <AppIcon name="check" :size="13" />
                </button>
                <button
                  v-if="!row.goal.archivedAt"
                  class="icon-btn"
                  title="编辑目标"
                  aria-label="编辑目标"
                  @click.stop="openGoalEdit(row.goal)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="row.goal.archivedAt ? '恢复目标' : '归档目标'"
                  :aria-label="row.goal.archivedAt ? '恢复目标' : '归档目标'"
                  @click.stop="askArchive('goal', row.goal.id, row.goal.title, row.goal.archivedAt)"
                >
                  <AppIcon :name="row.goal.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>
            <div
              v-if="expandedGoalTaskIds.has(row.goal.id)"
              class="goal-tree-tasks"
              :style="{ '--depth': row.depth }"
            >
              <button
                v-for="task in tasksForGoal(row.goal.id)"
                :key="task.id"
                class="goal-tree-task"
                @click="openTaskDetail(task)"
              >
                <span
                  class="goal-task-check"
                  :class="{ done: task.status === TaskStatus.COMPLETED }"
                />
                <span class="goal-task-title">{{ task.title }}</span>
                <span class="badge">{{ taskStatusLabels[task.status] }}</span>
                <span v-if="task.estimatedDuration" class="goal-task-duration">
                  {{ formatDuration(task.estimatedDuration) }}
                </span>
              </button>
              <p v-if="tasksForGoal(row.goal.id).length === 0" class="goal-tree-task-empty">
                还没有任务，点右侧 ✓ 添加。
              </p>
            </div>
            </template>
          </div>
          <p v-if="goalTreeRows.length === 0" class="goal-tree-empty">当前能力下没有目标。</p>
        </div>

        <div v-else class="goal-grid">
          <article
            v-for="goal in displayedGoals"
            :key="goal.id"
            class="goal-card card"
            :class="{ archived: goal.archivedAt }"
          >
            <div class="goal-top">
              <span class="badge badge-accent">{{ goalTypeLabels[goal.goalType] }}</span>
              <span class="badge">{{ goalStatusLabels[goal.status] }}</span>
              <span v-if="goal.archivedAt" class="badge badge-amber">已归档</span>
              <span
                v-if="goal.priority === 'URGENT' || goal.priority === 'HIGH'"
                class="badge badge-amber goal-priority"
              >
                {{ priorityLabels[goal.priority] }}
              </span>
              <div class="goal-actions">
                <button
                  v-if="!goal.archivedAt"
                  class="icon-btn"
                  title="编辑目标"
                  aria-label="编辑目标"
                  @click="openGoalEdit(goal)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="goal.archivedAt ? '恢复目标' : '归档目标'"
                  :aria-label="goal.archivedAt ? '恢复目标' : '归档目标'"
                  @click="askArchive('goal', goal.id, goal.title, goal.archivedAt)"
                >
                  <AppIcon :name="goal.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>

            <button class="goal-title goal-title-btn" @click="openGoalDetail(goal)">
              {{ goal.title }}
            </button>
            <p class="goal-desc">
              {{ goal.description || '还没有补充目标说明。' }}
            </p>

            <div class="goal-progress">
              <div class="progress-head">
                <span>进度 · {{ progressModeLabels[effectiveProgressMode(goal)] }}</span>
                <strong>{{ progressForGoal(goal) }}%</strong>
              </div>
              <div class="progress-track">
                <span class="progress-bar" :style="{ width: `${progressForGoal(goal)}%` }" />
              </div>
            </div>

            <div class="goal-meta">
              <span v-if="goal.dueDate" class="goal-due">
                <AppIcon name="calendar" :size="11" />
                {{ relativeDay(goal.dueDate) }}
              </span>
              <span>
                <AppIcon name="check" :size="11" />
                {{ goalTaskStats[goal.id]?.done ?? 0 }} /
                {{ goalTaskStats[goal.id]?.total ?? 0 }} 任务
              </span>
              <span>
                <AppIcon name="layers" :size="11" />
                {{ goalChildCounts[goal.id] ?? 0 }} 子目标
              </span>
            </div>

            <div v-if="goal.competencyId" class="goal-tags">
              <button class="goal-tag goal-tag-button" @click="filterByCompetency(goal.competencyId)">
                <span class="tag-dot" />
                {{ competencyPath(goal.competencyId) || '未知能力' }}
              </button>
            </div>

            <div class="goal-foot">
              <button class="link-btn" @click="viewTasksOfGoal(goal.id)">
                查看关联任务
                <AppIcon name="arrow-right" :size="12" />
              </button>
              <button
                v-if="!goal.archivedAt"
                class="link-btn"
                @click="openGoalCreate(goal, goal.competencyId ?? undefined)"
              >
                添加子目标
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'tasks'" class="card card-pad task-card">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="layers" :size="16" />
            {{ taskDisplayMode === 'wbs' ? '任务树' : '任务看板' }}
            <span class="count-pill">{{ taskDisplayMode === 'wbs' ? taskTree.length : kanbanSource.length }}</span>
          </h3>
          <div class="row">
            <div class="seg-control" role="group" aria-label="任务显示方式">
              <button
                class="seg-btn"
                :class="{ active: taskDisplayMode === 'wbs' }"
                :aria-pressed="taskDisplayMode === 'wbs'"
                @click="taskDisplayMode = 'wbs'"
              >
                WBS
              </button>
              <button
                class="seg-btn"
                :class="{ active: taskDisplayMode === 'kanban' }"
                :aria-pressed="taskDisplayMode === 'kanban'"
                @click="taskDisplayMode = 'kanban'"
              >
                看板
              </button>
            </div>
            <span class="section-note">
              {{ taskDisplayMode === 'wbs' ? 'WBS 拆解 · 父任务不会自动完成' : '拖动卡片改变状态 · 父任务未完成时会先确认' }}
            </span>
            <button class="btn btn-sm btn-secondary" @click="openTaskCreate()">
              <AppIcon name="plus" :size="14" />
              添加根任务
            </button>
          </div>
        </div>

        <EmptyState
          v-if="taskTree.length === 0 && kanbanSource.length === 0"
          title="这个视图里没有任务"
          description="可以调整目标筛选、显示已完成，或创建第一个可执行任务。"
        >
          <button class="btn btn-sm btn-secondary" @click="openTaskCreate()">创建任务</button>
        </EmptyState>

        <ul v-else-if="taskDisplayMode === 'wbs'" class="task-tree">
          <TaskTreeNode
            v-for="node in taskTree"
            :key="node.task.id"
            :node="node"
            :goal-titles="goalTitlesByTask"
            :predecessor-titles="predecessorTitlesByTask"
            :timebox-counts="timeboxCounts"
            :review-at-by-task="reviewAtByTask"
            @edit="openTaskEdit"
            @add-child="openTaskCreate"
            @toggle-status="requestToggleStatus"
            @toggle-archive="(task) => askArchive('task', task.id, task.title, task.archivedAt)"
            @edit-timebox="openTimeboxCreate"
            @edit-dependencies="openDependencies"
            @open-detail="openTaskDetail"
          />
        </ul>

        <div v-else class="kanban-board">
          <section
            v-for="column in kanbanColumns"
            :key="column.key"
            class="kanban-column"
            :class="`kanban-${column.key}`"
            @dragover.prevent
            @drop.prevent="dropTaskToKanban(column)"
          >
            <header class="kanban-head">
              <span class="kanban-dot" />
              <h4>{{ column.title }}</h4>
              <span class="kanban-count">{{ column.tasks.length }}</span>
            </header>
            <div class="kanban-list">
              <article
                v-for="task in column.tasks"
                :key="task.id"
                class="kanban-card"
                :class="{
                  done: task.status === 'COMPLETED',
                  dragging: kanbanDragId === task.id,
                }"
                draggable="true"
                @dragstart="startKanbanDrag(task, $event)"
                @dragend="kanbanDragId = null"
                @click="openTaskDetail(task)"
              >
                <div class="kanban-card-top">
                  <span class="badge">{{ taskTypeLabels[task.taskType] }}</span>
                  <span v-if="task.dueDate" class="kanban-due">{{ relativeDay(task.dueDate) }}</span>
                </div>
                <p class="kanban-title">{{ task.title }}</p>
                <div class="kanban-meta">
                  <span v-if="priorityLabels[task.priority]" class="kanban-priority">
                    {{ priorityLabels[task.priority] }}
                  </span>
                  <span v-if="timeboxCounts[task.id]" class="kanban-timebox">
                    <AppIcon name="clock" :size="11" />
                    {{ timeboxCounts[task.id] }}
                  </span>
                  <span v-if="goalTitlesByTask[task.id]?.length" class="kanban-goal">
                    <AppIcon name="target" :size="11" />
                    {{ goalTitlesByTask[task.id][0] }}
                  </span>
                </div>
              </article>
              <p v-if="column.tasks.length === 0" class="kanban-empty">拖任务到这里</p>
            </div>
          </section>
        </div>
      </section>

      <section v-else class="card card-pad timebox-card">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="clock" :size="16" />
              时间盒安排
            </h3>
            <p class="section-note">
              同一时间段不允许无提示地安排多个冲突任务。完成时间盒会累计任务实际耗时。
            </p>
          </div>
          <div class="row">
            <div class="seg-control" role="group" aria-label="时间盒显示方式">
              <button
                class="seg-btn"
                :class="{ active: timeboxDisplayMode === 'day' }"
                :aria-pressed="timeboxDisplayMode === 'day'"
                @click="timeboxDisplayMode = 'day'"
              >
                日视图
              </button>
              <button
                class="seg-btn"
                :class="{ active: timeboxDisplayMode === 'week' }"
                :aria-pressed="timeboxDisplayMode === 'week'"
                @click="timeboxDisplayMode = 'week'"
              >
                周视图
              </button>
              <button
                class="seg-btn"
                :class="{ active: timeboxDisplayMode === 'month' }"
                :aria-pressed="timeboxDisplayMode === 'month'"
                @click="timeboxDisplayMode = 'month'"
              >
                月视图
              </button>
              <button
                class="seg-btn"
                :class="{ active: timeboxDisplayMode === 'list' }"
                :aria-pressed="timeboxDisplayMode === 'list'"
                @click="timeboxDisplayMode = 'list'"
              >
                列表
              </button>
            </div>
            <button class="btn btn-sm btn-secondary" @click="openTimeboxCreate()">
              <AppIcon name="plus" :size="14" />
              安排时间盒
            </button>
          </div>
        </div>

        <EmptyState
          v-if="timeboxDisplayMode === 'list' && timeboxGroups.length === 0"
          title="还没有时间盒"
          description="把任务放入具体的 25 分钟或 45 分钟时段，比只写待办更容易开始。"
        >
          <button class="btn btn-sm btn-secondary" @click="openTimeboxCreate()">安排第一个时间盒</button>
        </EmptyState>

        <div v-else-if="timeboxDisplayMode === 'day'" class="day-board">
          <div class="period-nav">
            <button class="btn btn-sm btn-secondary" @click="shiftDay(-1)">前一天</button>
            <span class="period-range">{{ timeboxDayView.label }}</span>
            <button class="btn btn-sm btn-ghost" @click="resetDay">回到今天</button>
            <button class="btn btn-sm btn-secondary" @click="shiftDay(1)">后一天</button>
          </div>
          <section class="day-agenda" :class="{ today: timeboxDayView.isToday }">
            <header class="day-agenda-head">
              <div>
                <span class="day-agenda-kicker">{{ timeboxDayView.isToday ? '今天' : '日计划' }}</span>
                <h4>{{ timeboxDayView.label }}</h4>
              </div>
              <button class="btn btn-sm btn-secondary" @click="openTimeboxCreate(undefined, timeboxDayView.key)">
                <AppIcon name="plus" :size="13" />
                安排到这一天
              </button>
            </header>
            <ul v-if="timeboxDayView.items.length" class="timebox-list day-agenda-list">
              <li
                v-for="timebox in timeboxDayView.items"
                :key="timebox.id"
                class="timebox-item day-agenda-item"
                draggable="true"
                @dragstart="startTimeboxDrag(timebox, $event)"
                @dragend="timeboxDragId = null"
              >
                <div class="timebox-time">
                  <span class="time-range">
                    {{ formatTime(timebox.plannedStart) }} – {{ formatTime(timebox.plannedEnd) }}
                  </span>
                  <span class="time-duration">{{ formatDuration(timebox.plannedDuration) }}</span>
                </div>
                <div class="timebox-main">
                  <button class="timebox-task" @click="openTimeboxEdit(timebox)">
                    {{ taskFor(timebox)?.title ?? '任务已删除' }}
                  </button>
                  <div class="timebox-meta">
                    <span class="badge">{{ timeboxStatusLabels[timebox.status] }}</span>
                    <span v-if="timebox.note">{{ timebox.note }}</span>
                  </div>
                </div>
                <div class="timebox-resize" role="group" aria-label="调整时间盒时长">
                  <button class="btn btn-xs btn-ghost" @click="adjustTimebox(timebox, -15)">-15 分钟</button>
                  <button class="btn btn-xs btn-ghost" @click="adjustTimebox(timebox, 15)">+15 分钟</button>
                </div>
                <div class="timebox-actions">
                  <button
                    class="icon-btn"
                    title="编辑时间盒"
                    aria-label="编辑时间盒"
                    @click="openTimeboxEdit(timebox)"
                  >
                    <AppIcon name="sliders" :size="14" />
                  </button>
                  <button
                    class="icon-btn"
                    title="删除时间盒"
                    aria-label="删除时间盒"
                    @click="askDeleteTimebox(timebox)"
                  >
                    <AppIcon name="trash" :size="14" />
                  </button>
                </div>
              </li>
            </ul>
            <div v-else class="day-agenda-empty">
              <AppIcon name="calendar" :size="22" />
              <p>这一天还没有时间盒。点击「安排到这一天」把任务落到具体时段。</p>
            </div>
          </section>
        </div>

        <div v-else-if="timeboxDisplayMode === 'week'" class="week-board">
          <div class="period-nav">
            <button class="btn btn-sm btn-secondary" @click="shiftWeek(-1)">上一周</button>
            <span class="period-range">
              {{ formatShortDate(timeboxWeekDays[0]?.date.toISOString() ?? '') }} –
              {{ formatShortDate(timeboxWeekDays[6]?.date.toISOString() ?? '') }}
            </span>
            <button class="btn btn-sm btn-ghost" @click="resetWeek">回到本周</button>
            <button class="btn btn-sm btn-secondary" @click="shiftWeek(1)">下一周</button>
          </div>
          <div class="week-grid">
            <section
              v-for="day in timeboxWeekDays"
              :key="day.key"
              class="week-day"
              :class="{ today: day.isToday }"
              @dragover.prevent
              @drop.prevent="dropTimeboxToDay(day.key)"
            >
              <header class="week-day-head">
                <span class="week-day-label">{{ day.label }}</span>
                <span class="week-day-date">{{ formatShortDate(day.date.toISOString()) }}</span>
              </header>
              <ul class="week-day-list">
                <li
                  v-for="timebox in day.items"
                  :key="timebox.id"
                  class="week-card"
                  :class="{
                    dragging: timeboxDragId === timebox.id,
                    done: timebox.status === 'COMPLETED',
                  }"
                  draggable="true"
                  @dragstart="startTimeboxDrag(timebox, $event)"
                  @dragend="timeboxDragId = null"
                >
                  <span class="week-card-time">
                    {{ formatTime(timebox.plannedStart) }}
                  </span>
                  <span class="week-card-title">{{ taskFor(timebox)?.title ?? '任务已删除' }}</span>
                  <div class="week-card-actions">
                    <button class="week-resize-btn" title="缩短 15 分钟" @click="adjustTimebox(timebox, -15)">−15</button>
                    <button class="week-resize-btn" title="延长 15 分钟" @click="adjustTimebox(timebox, 15)">+15</button>
                    <button
                      class="icon-btn"
                      title="编辑时间盒"
                      aria-label="编辑时间盒"
                      @click="openTimeboxEdit(timebox)"
                    >
                      <AppIcon name="sliders" :size="13" />
                    </button>
                  </div>
                </li>
              </ul>
              <p v-if="day.items.length === 0" class="week-day-empty">空闲</p>
              <button class="btn btn-sm btn-ghost week-add" @click="openTimeboxCreate(undefined, day.key)">
                <AppIcon name="plus" :size="12" />
                安排
              </button>
            </section>
          </div>
        </div>

        <div v-else-if="timeboxDisplayMode === 'month'" class="month-board">
          <div class="period-nav">
            <button class="btn btn-sm btn-secondary" @click="shiftMonth(-1)">上个月</button>
            <span class="period-range">{{ timeboxMonthLabel }}</span>
            <button class="btn btn-sm btn-ghost" @click="resetMonth">回到本月</button>
            <button class="btn btn-sm btn-secondary" @click="shiftMonth(1)">下个月</button>
          </div>
          <div class="month-weekdays" aria-hidden="true">
            <span v-for="weekday in weekDayNames" :key="weekday">周{{ weekday }}</span>
          </div>
          <div class="month-grid">
            <section
              v-for="day in timeboxMonthDays"
              :key="day.key"
              class="month-day"
              :class="{ muted: !day.inMonth, today: day.isToday }"
              @dragover.prevent
              @drop.prevent="dropTimeboxToDay(day.key)"
            >
              <header class="month-day-head">
                <button
                  class="month-day-number"
                  :title="`打开 ${formatDate(day.date.toISOString())} 的日视图`"
                  @click="dayAnchor = dailyAnchorFor(day.date); timeboxDisplayMode = 'day'"
                >
                  {{ day.day }}
                </button>
                <button
                  class="month-add-btn"
                  title="安排到这一天"
                  aria-label="安排到这一天"
                  @click="openTimeboxCreate(undefined, day.key)"
                >
                  <AppIcon name="plus" :size="11" />
                </button>
              </header>
              <div class="month-day-items">
                <button
                  v-for="timebox in day.items.slice(0, 3)"
                  :key="timebox.id"
                  class="month-timebox"
                  :class="{ done: timebox.status === 'COMPLETED' }"
                  :title="`${formatTime(timebox.plannedStart)} ${taskFor(timebox)?.title ?? '任务已删除'}`"
                  @click="openTimeboxEdit(timebox)"
                >
                  <span>{{ formatTime(timebox.plannedStart) }}</span>
                  <strong>{{ taskFor(timebox)?.title ?? '任务已删除' }}</strong>
                </button>
                <span v-if="day.items.length > 3" class="month-more">+{{ day.items.length - 3 }} 项</span>
              </div>
            </section>
          </div>
        </div>

        <div v-else class="timebox-groups">
          <section v-for="group in timeboxGroups" :key="group.key" class="timebox-group">
            <header class="timebox-group-head">
              <span class="timebox-date">{{ group.label }}</span>
              <span class="timebox-day-count">{{ group.items.length }} 个时间盒</span>
            </header>
            <ul class="timebox-list">
              <li v-for="timebox in group.items" :key="timebox.id" class="timebox-item">
                <div class="timebox-time">
                  <span class="time-range">
                    {{ formatTime(timebox.plannedStart) }} – {{ formatTime(timebox.plannedEnd) }}
                  </span>
                  <span class="time-duration">{{ formatDuration(timebox.plannedDuration) }}</span>
                </div>
                <div class="timebox-main">
                  <button class="timebox-task" @click="taskFor(timebox) && openTaskEdit(taskFor(timebox)!)">
                    {{ taskFor(timebox)?.title ?? '任务已删除' }}
                  </button>
                  <div class="timebox-meta">
                    <span class="badge">{{ timeboxStatusLabels[timebox.status] }}</span>
                    <span v-if="timebox.note">{{ timebox.note }}</span>
                  </div>
                </div>
                <div class="timebox-resize" role="group" aria-label="调整时间盒时长">
                  <button class="btn btn-xs btn-ghost" @click="adjustTimebox(timebox, -15)">-15 分钟</button>
                  <button class="btn btn-xs btn-ghost" @click="adjustTimebox(timebox, 15)">+15 分钟</button>
                </div>
                <div class="timebox-actions">
                  <button
                    class="icon-btn"
                    title="编辑时间盒"
                    aria-label="编辑时间盒"
                    @click="openTimeboxEdit(timebox)"
                  >
                    <AppIcon name="sliders" :size="14" />
                  </button>
                  <button
                    class="icon-btn"
                    title="删除时间盒"
                    aria-label="删除时间盒"
                    @click="askDeleteTimebox(timebox)"
                  >
                    <AppIcon name="trash" :size="14" />
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </section>
    </template>

    <ModalDialog
      :open="modalKind === 'goal'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitGoal">
        <div class="field">
          <label class="field-label" for="goal-title">目标名称</label>
          <input
            id="goal-title"
            v-model="goalForm.title"
            class="input"
            placeholder="例如：掌握 ACO 求解 SAT 的基本原理与实现"
          />
        </div>
        <div class="field">
          <label class="field-label" for="goal-desc">目标描述</label>
          <textarea id="goal-desc" v-model="goalForm.description" class="textarea" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="goal-type">目标类型</label>
            <select id="goal-type" v-model="goalForm.goalType" class="select">
              <option v-for="type in goalTypes" :key="type" :value="type">
                {{ goalTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="goal-status">状态</label>
            <select id="goal-status" v-model="goalForm.status" class="select">
              <option v-for="status in goalStatuses" :key="status" :value="status">
                {{ goalStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="goal-parent">父目标</label>
          <select id="goal-parent" v-model="goalForm.parentGoalId" class="select">
            <option value="">无（顶层目标）</option>
            <option v-for="goal in goalParentOptions" :key="goal.id" :value="goal.id">
              {{ goal.title }}
            </option>
          </select>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="goal-start">开始日期</label>
            <input id="goal-start" v-model="goalForm.startDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="goal-due">截止日期</label>
            <input id="goal-due" v-model="goalForm.dueDate" class="input" type="date" />
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="goal-priority">优先级</label>
            <select id="goal-priority" v-model="goalForm.priority" class="select">
              <option v-for="priority in priorities" :key="priority" :value="priority">
                {{ priorityLabels[priority] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="goal-progress-mode">进度模式</label>
            <select id="goal-progress-mode" v-model="goalForm.progressMode" class="select">
              <option v-for="mode in progressModes" :key="mode" :value="mode">
                {{ progressModeLabels[mode] }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="goalForm.progressMode === 'MANUAL'" class="field">
          <label class="field-label" for="goal-manual">人工进度（%）</label>
          <input
            id="goal-manual"
            v-model.number="goalForm.manualProgress"
            class="input"
            type="number"
            min="0"
            max="100"
          />
        </div>

        <div class="field">
          <label class="field-label" for="goal-criteria">验收标准</label>
          <textarea
            id="goal-criteria"
            v-model="goalForm.successCriteria"
            class="textarea"
            placeholder="达到什么标准才算完成？"
          />
        </div>

        <div class="field">
          <label class="field-label" for="goal-review">复盘周期</label>
          <input id="goal-review" v-model="goalForm.reviewFrequency" class="input" />
        </div>

        <div class="field">
          <label class="field-label" for="goal-competency">主能力</label>
          <select id="goal-competency" v-model="goalForm.competencyId" class="select">
            <option value="">暂不关联能力</option>
            <option
              v-for="competency in competencyOptions"
              :key="competency.id"
              :value="competency.id"
            >
              {{ competencyPath(competency.id) }}
            </option>
          </select>
          <span class="field-hint">
            能力是拆解锚点。目标可继续添加子目标，直到能直接添加可执行任务。
          </span>
        </div>

        <div class="field">
          <span class="field-label">阶段里程碑</span>
          <div class="relation-options">
            <label
              v-for="milestone in milestones.filter((row) => !row.archivedAt)"
              :key="milestone.id"
              class="relation-option"
              :class="{ selected: goalForm.milestoneIds.includes(milestone.id) }"
            >
              <input
                type="checkbox"
                :checked="goalForm.milestoneIds.includes(milestone.id)"
                @change="toggleGoalRelation(goalForm.milestoneIds, milestone.id, $event)"
              />
              <span>{{ milestone.name }}</span>
              <small>{{ formatShortDate(milestone.dueDate, '待定') }}</small>
            </label>
            <p v-if="milestones.filter((row) => !row.archivedAt).length === 0" class="field-hint">
              还没有里程碑，先到发展路线里为目标方向添加阶段成果。
            </p>
          </div>
        </div>

        <div class="field">
          <span class="field-label">支撑的发展方向</span>
          <div class="relation-options">
            <label
              v-for="direction in directions.filter((row) => !row.archivedAt)"
              :key="direction.id"
              class="relation-option"
              :class="{ selected: goalForm.directionIds.includes(direction.id) }"
            >
              <input
                type="checkbox"
                :checked="goalForm.directionIds.includes(direction.id)"
                @change="toggleGoalRelation(goalForm.directionIds, direction.id, $event)"
              />
              <span class="relation-dot" :style="{ background: direction.color }" />
              <span>{{ direction.name }}</span>
            </label>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : goalEditingId ? '保存修改' : '创建目标' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'task'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitTask">
        <div class="field">
          <label class="field-label" for="task-title">任务名称</label>
          <input
            id="task-title"
            v-model="taskForm.title"
            class="input"
            placeholder="例如：阅读 SAT 局部搜索论文"
          />
        </div>
        <div class="field">
          <label class="field-label" for="task-desc">任务描述</label>
          <textarea id="task-desc" v-model="taskForm.description" class="textarea" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="task-type">任务类型</label>
            <select id="task-type" v-model="taskForm.taskType" class="select">
              <option v-for="type in taskTypes" :key="type" :value="type">
                {{ taskTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="task-status">状态</label>
            <select id="task-status" v-model="taskForm.status" class="select">
              <option v-for="status in taskStatuses" :key="status" :value="status">
                {{ taskStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="task-parent">父任务</label>
          <select id="task-parent" v-model="taskForm.parentTaskId" class="select">
            <option value="">无（根任务）</option>
            <option v-for="task in taskParentOptions" :key="task.id" :value="task.id">
              {{ task.title }}
            </option>
          </select>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="task-start">开始日期</label>
            <input id="task-start" v-model="taskForm.startDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="task-due">截止日期</label>
            <input id="task-due" v-model="taskForm.dueDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="task-scheduled">计划日期</label>
            <input id="task-scheduled" v-model="taskForm.scheduledDate" class="input" type="date" />
          </div>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="task-estimate">预计耗时（分钟）</label>
            <input
              id="task-estimate"
              v-model.number="taskForm.estimatedDuration"
              class="input"
              type="number"
              min="0"
              step="5"
            />
            <span class="field-hint">{{ formatDuration(taskForm.estimatedDuration) }}</span>
          </div>
          <div class="field">
            <label class="field-label" for="task-priority">优先级</label>
            <select id="task-priority" v-model="taskForm.priority" class="select">
              <option v-for="priority in priorities" :key="priority" :value="priority">
                {{ priorityLabels[priority] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">实际耗时</label>
            <input class="input" :value="formatDuration(tasks.find((task) => task.id === taskEditingId)?.actualDuration ?? 0)" readonly />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="task-criteria">完成条件</label>
          <textarea
            id="task-criteria"
            v-model="taskForm.completionCriteria"
            class="textarea"
            placeholder="满足什么条件才算完成？避免只有“做完”三个字。"
          />
        </div>

        <div class="field">
          <span class="field-label">关联目标</span>
          <div v-if="activeGoals.length === 0" class="relation-empty">还没有目标。</div>
          <div v-else class="chip-check-list">
            <label
              v-for="goal in activeGoals"
              :key="goal.id"
              class="chip-check"
              :class="{ selected: taskForm.goalIds.includes(goal.id) }"
            >
              <input
                type="checkbox"
                :checked="taskForm.goalIds.includes(goal.id)"
                @change="toggleGoalRelation(taskForm.goalIds, goal.id, $event)"
              />
              {{ goal.title }}
            </label>
          </div>
        </div>

        <div class="field">
          <span class="field-label">关联能力</span>
          <div v-if="competencyOptions.length === 0" class="relation-empty">还没有能力节点。</div>
          <div v-else class="chip-check-list">
            <label
              v-for="competency in competencyOptions"
              :key="competency.id"
              class="chip-check"
              :class="{ selected: taskForm.competencyIds.includes(competency.id) }"
            >
              <input
                type="checkbox"
                :checked="taskForm.competencyIds.includes(competency.id)"
                @change="toggleGoalRelation(taskForm.competencyIds, competency.id, $event)"
              />
              {{ competency.name }}
            </label>
          </div>
          <span class="field-hint">一个任务可以同时支持多个目标与能力，不复制任务本身。</span>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : taskEditingId ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'timebox'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitTimebox">
        <div class="field">
          <label class="field-label" for="timebox-goal">关联目标</label>
          <select
            id="timebox-goal"
            v-model="timeboxForm.goalId"
            class="select"
            @change="onTimeboxGoalChange"
          >
            <option value="">全部目标</option>
            <option v-for="goal in timeboxGoalOptions" :key="goal.id" :value="goal.id">
              {{ goal.title }}
            </option>
          </select>
          <span class="field-hint">选择目标后，任务列表只显示该目标及其子目标下的任务。</span>
        </div>
        <div class="field">
          <label class="field-label" for="timebox-task">任务</label>
          <select id="timebox-task" v-model="timeboxForm.taskId" class="select">
            <option value="" disabled>请选择任务</option>
            <option v-for="task in timeboxTaskOptions" :key="task.id" :value="task.id">
              {{ task.title }}
            </option>
          </select>
          <span v-if="timeboxForm.goalId && timeboxTaskOptions.length === 0" class="field-hint">
            这个目标下还没有可安排的任务，先到目标拆解里添加任务。
          </span>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="timebox-start">开始时间</label>
            <input
              id="timebox-start"
              v-model="timeboxForm.plannedStart"
              class="input"
              type="datetime-local"
            />
          </div>
          <div class="field">
            <label class="field-label" for="timebox-end">结束时间</label>
            <input
              id="timebox-end"
              v-model="timeboxForm.plannedEnd"
              class="input"
              type="datetime-local"
            />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="timebox-status">状态</label>
          <select id="timebox-status" v-model="timeboxForm.status" class="select">
            <option value="PLANNED">{{ timeboxStatusLabels.PLANNED }}</option>
            <option value="RUNNING">{{ timeboxStatusLabels.RUNNING }}</option>
            <option value="COMPLETED">{{ timeboxStatusLabels.COMPLETED }}</option>
            <option value="SKIPPED">{{ timeboxStatusLabels.SKIPPED }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="timebox-note">备注</label>
          <input id="timebox-note" v-model="timeboxForm.note" class="input" placeholder="可选" />
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button
            v-if="timeboxEditingId"
            type="button"
            class="btn btn-danger"
            @click="
              () => {
                const row = timeboxes.find((item) => item.id === timeboxEditingId)
                if (row) askDeleteTimebox(row)
              }
            "
          >
            删除时间盒
          </button>
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : timeboxEditingId ? '保存修改' : '安排时间盒' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'dependencies'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <div v-if="dependencyTask" class="dependency-body">
        <p class="dependency-target">
          当前任务：<strong>{{ dependencyTask.title }}</strong>
        </p>
        <input
          v-model="dependencySearch"
          class="input"
          placeholder="搜索前置任务"
          aria-label="搜索前置任务"
        />
        <div class="dependency-list">
          <label
            v-for="task in dependencyOptions"
            :key="task.id"
            class="dependency-row"
            :class="{ selected: dependencySelected.includes(task.id) }"
          >
            <input
              type="checkbox"
              :checked="dependencySelected.includes(task.id)"
              @change="toggleDependency(task.id, $event)"
            />
            <span class="dependency-name">{{ task.title }}</span>
            <span class="badge">{{ taskStatusLabels[task.status] }}</span>
          </label>
        </div>
        <p class="field-hint">
          已选择 {{ dependencySelected.length }} 个前置任务。保存时会检查是否形成环路。
        </p>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="resetModal">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="submitDependencies">
            {{ saving ? '保存中…' : '保存依赖' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="forceOpen" title="强制完成父任务" @close="forceOpen = false">
      <p class="confirm-text">
        「{{ forceTask?.title }}」还有 {{ forceTask ? incompleteChildren(forceTask.id).length : 0 }}
        个未完成子任务。父任务完成不会自动完成子任务。
      </p>
      <div class="alert alert-warning confirm-note">
        <AppIcon name="warning" :size="15" />
        <span>建议先完成或取消子任务。你也可以明确选择强制完成父任务。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="forceOpen = false">返回</button>
        <button class="btn btn-primary" :disabled="forceBusy" @click="confirmForceComplete">
          {{ forceBusy ? '处理中…' : '强制完成父任务' }}
        </button>
      </div>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div v-if="confirmTarget && confirmTarget.kind !== 'timebox' && !confirmTarget.archived" class="alert alert-warning confirm-note">
        <AppIcon name="warning" :size="15" />
        <span>归档不会级联删除子任务、关联目标、时间盒或历史记录。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button
          class="btn"
          :class="confirmTarget?.kind === 'timebox' ? 'btn-danger' : 'btn-primary'"
          :disabled="confirmBusy"
          @click="runConfirm"
        >
          {{ confirmBusy ? '处理中…' : confirmActionLabel }}
        </button>
      </div>
    </ModalDialog>
  <DetailDrawer
      :open="Boolean(detailGoal)"
      :title="detailGoal?.title ?? '目标详情'"
      :subtitle="
        detailGoal
          ? `${goalTypeLabels[detailGoal.goalType]} · ${progressModeLabels[effectiveProgressMode(detailGoal)]}`
          : ''
      "
      :width="480"
      @close="closeGoalDetail"
    >
      <template v-if="detailGoal">
        <div class="detail-badges">
          <span class="badge badge-accent">{{ goalTypeLabels[detailGoal.goalType] }}</span>
          <span class="badge">{{ goalStatusLabels[detailGoal.status] }}</span>
          <span class="badge badge-amber">{{ priorityLabels[detailGoal.priority] }}</span>
          <span v-if="detailGoal.archivedAt" class="badge badge-amber">已归档</span>
        </div>

        <p class="detail-desc">{{ detailGoal.description || '还没有补充目标说明。' }}</p>

        <div class="detail-block">
          <div class="detail-block-head">
            <span>进度 · {{ progressModeLabels[effectiveProgressMode(detailGoal)] }}</span>
            <strong>{{ progressForGoal(detailGoal) }}%</strong>
          </div>
          <div class="progress-track">
            <span class="progress-bar" :style="{ width: `${progressForGoal(detailGoal)}%` }" />
          </div>
          <p class="detail-hint">
            {{ goalTaskStats[detailGoal.id]?.done ?? 0 }} /
            {{ goalTaskStats[detailGoal.id]?.total ?? 0 }} 个关联任务已完成{{
              detailGoalChildren.length ? '（含子目标）' : ''
            }}
          </p>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">验收标准</h4>
          <p class="detail-text">
            {{ detailGoal.successCriteria || '还没有写验收标准，进度容易变成凭感觉。' }}
          </p>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">时间与复盘</h4>
          <dl class="detail-list">
            <div>
              <dt>开始日期</dt>
              <dd>{{ formatShortDate(detailGoal.startDate) }}</dd>
            </div>
            <div>
              <dt>截止日期</dt>
              <dd>{{ formatShortDate(detailGoal.dueDate) }}</dd>
            </div>
            <div>
              <dt>复盘周期</dt>
              <dd>{{ detailGoal.reviewFrequency || '未设置' }}</dd>
            </div>
            <div>
              <dt>父目标</dt>
              <dd>{{ detailGoal.parentGoalId ? goalMap[detailGoal.parentGoalId]?.title ?? '未知目标' : '顶层目标' }}</dd>
            </div>
          </dl>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">主能力</h4>
          <button
            v-if="detailGoal.competencyId"
            class="goal-tag goal-tag-button"
            @click="filterByCompetency(detailGoal.competencyId)"
          >
            <span class="tag-dot" />
            {{ competencyPath(detailGoal.competencyId) }}
            <AppIcon name="arrow-right" :size="12" />
          </button>
          <p v-else class="detail-empty">还没有关联能力，可编辑目标补上拆解锚点。</p>
        </div>

        <div v-if="detailGoalChildren.length > 0" class="detail-block">
          <h4 class="detail-block-title">
            子目标
            <span class="detail-count">{{ detailGoalChildren.length }}</span>
          </h4>
          <ul class="detail-task-list">
            <li v-for="child in detailGoalChildren" :key="child.id">
              <button class="detail-task-row" @click="openGoalDetail(child)">
                <span class="detail-task-title">{{ child.title }}</span>
                <span class="badge">{{ goalStatusLabels[child.status] }}</span>
                <AppIcon name="arrow-right" :size="12" />
              </button>
            </li>
          </ul>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">
            关联任务
            <span class="detail-count">{{ detailGoalTasks.length }}</span>
          </h4>
          <p v-if="detailGoalTasks.length === 0" class="detail-empty">还没有关联任务。</p>
          <ul v-else class="detail-task-list">
            <li v-for="task in detailGoalTasks" :key="task.id">
              <button class="detail-task-row" @click="openTaskFromGoal(task)">
                <span class="detail-task-title">{{ task.title }}</span>
                <span class="badge">{{ taskStatusLabels[task.status] }}</span>
                <span v-if="task.dueDate" class="detail-task-meta">{{ relativeDay(task.dueDate) }}</span>
                <AppIcon name="arrow-right" :size="12" />
              </button>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-sm btn-secondary" @click="addChildGoalForDetail">添加子目标</button>
        <button class="btn btn-sm btn-secondary" @click="addTaskForDetailGoal">添加任务</button>
        <button class="btn btn-sm btn-secondary" @click="timeboxForDetailGoal">安排时间盒</button>
        <button class="btn btn-sm btn-secondary" @click="editGoalFromDetail">编辑目标</button>
        <button
          class="btn btn-sm"
          :class="detailGoal?.archivedAt ? 'btn-secondary' : 'btn-danger'"
          @click="archiveGoalFromDetail"
        >
          {{ detailGoal?.archivedAt ? '恢复目标' : '归档目标' }}
        </button>
      </template>
    </DetailDrawer>

    <DetailDrawer
      :open="Boolean(detailTask)"
      :title="detailTask?.title ?? '任务详情'"
      :subtitle="
        detailTask
          ? `${taskTypeLabels[detailTask.taskType]} · ${taskStatusLabels[detailTask.status]}`
          : ''
      "
      :width="480"
      @close="closeTaskDetail"
    >
      <template v-if="detailTask">
        <div class="detail-badges">
          <span class="badge badge-accent">{{ taskTypeLabels[detailTask.taskType] }}</span>
          <span class="badge">{{ taskStatusLabels[detailTask.status] }}</span>
          <span class="badge">{{ priorityLabels[detailTask.priority] }}</span>
          <span v-if="detailTask.archivedAt" class="badge badge-amber">已归档</span>
        </div>

        <p class="detail-desc">{{ detailTask.description || '还没有补充任务说明。' }}</p>

        <div class="detail-block">
          <h4 class="detail-block-title">完成条件</h4>
          <p class="detail-text">
            {{ detailTask.completionCriteria || '还没有写完成条件，容易一直在“差一点”的状态。' }}
          </p>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">时间安排</h4>
          <dl class="detail-list">
            <div>
              <dt>预计耗时</dt>
              <dd>{{ formatDuration(detailTask.estimatedDuration) }}</dd>
            </div>
            <div>
              <dt>实际耗时</dt>
              <dd>{{ formatDuration(detailTask.actualDuration) }}</dd>
            </div>
            <div>
              <dt>开始 / 截止</dt>
              <dd>{{ formatShortDate(detailTask.startDate) }} – {{ formatShortDate(detailTask.dueDate) }}</dd>
            </div>
            <div>
              <dt>计划日期</dt>
              <dd>{{ formatShortDate(detailTask.scheduledDate) }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="detailTaskGoalNames.length > 0" class="detail-block">
          <h4 class="detail-block-title">关联目标</h4>
          <ul class="detail-pill-list">
            <li v-for="name in detailTaskGoalNames" :key="name">
              <AppIcon name="target" :size="12" />
              {{ name }}
            </li>
          </ul>
        </div>

        <div v-if="detailTaskPredecessorNames.length > 0" class="detail-block">
          <h4 class="detail-block-title">前置任务</h4>
          <ul class="detail-pill-list">
            <li v-for="name in detailTaskPredecessorNames" :key="name">
              <AppIcon name="arrow-right" :size="12" />
              {{ name }}
            </li>
          </ul>
        </div>

        <div v-if="detailTaskChildren.length > 0" class="detail-block">
          <h4 class="detail-block-title">
            子任务
            <span class="detail-count">{{ detailTaskChildren.length }}</span>
          </h4>
          <ul class="detail-task-list">
            <li v-for="child in detailTaskChildren" :key="child.id">
              <button class="detail-task-row" @click="openTaskDetail(child)">
                <span class="detail-task-title">{{ child.title }}</span>
                <span class="badge">{{ taskStatusLabels[child.status] }}</span>
                <AppIcon name="arrow-right" :size="12" />
              </button>
            </li>
          </ul>
        </div>

        <div class="detail-block">
          <h4 class="detail-block-title">
            时间盒
            <span class="detail-count">{{ detailTaskTimeboxes.length }}</span>
          </h4>
          <p v-if="detailTaskTimeboxes.length === 0" class="detail-empty">还没有安排时间盒。</p>
          <ul v-else class="detail-pill-list">
            <li v-for="timebox in detailTaskTimeboxes" :key="timebox.id">
              <AppIcon name="clock" :size="12" />
              {{ formatShortDate(timebox.plannedStart) }}
              {{ formatTime(timebox.plannedStart) }}–{{ formatTime(timebox.plannedEnd) }}
              <span class="badge">{{ timeboxStatusLabels[timebox.status] }}</span>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-sm btn-secondary" @click="learnTaskFromDetail">
          <AppIcon name="book" :size="13" />
          去学习
        </button>
        <button class="btn btn-sm btn-secondary" @click="timeboxFromDetail">安排时间盒</button>
        <button class="btn btn-sm btn-secondary" @click="dependenciesFromDetail">前置任务</button>
        <button class="btn btn-sm btn-secondary" @click="editTaskFromDetail">编辑任务</button>
        <button
          class="btn btn-sm"
          :class="detailTask?.archivedAt ? 'btn-secondary' : 'btn-danger'"
          @click="archiveTaskFromDetail"
        >
          {{ detailTask?.archivedAt ? '恢复任务' : '归档任务' }}
        </button>
      </template>
    </DetailDrawer>

  </div>
</template>

<style scoped>
.relation-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.relation-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 99px;
  color: var(--ink-soft);
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.relation-option.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--ink);
}

.relation-option small {
  color: var(--muted);
  font-size: 0.7rem;
}

.relation-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.exec-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.exec-stat {
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

.exec-stat > div {
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
  flex-wrap: wrap;
}

.goal-filter {
  width: auto;
  min-width: 150px;
  height: 34px;
  padding-top: 0;
  padding-bottom: 0;
}

.btn-ghost.is-on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.exec-loading {
  height: 340px;
}

.goals-head {
  align-items: flex-start;
}

.goal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.goal-card {
  display: flex;
  flex-direction: column;
  padding: 17px;
}

.goal-card.archived {
  opacity: 0.65;
}

.goal-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.goal-priority {
  margin-left: auto;
}

.goal-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 4px;
}

.goal-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.goal-title {
  margin-top: 9px;
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.45;
}

.goal-desc {
  margin-top: 4px;
  min-height: 34px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.goal-progress {
  margin-top: 12px;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 10px;
  color: var(--muted);
}

.progress-head strong {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
}

.goal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 10px;
}

.goal-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.goal-due {
  color: var(--amber);
}

.goal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.goal-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--tag-color) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--tag-color) 22%, transparent);
  color: var(--ink-soft);
  font-size: 9.5px;
}

.tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tag-color);
}

.goal-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-faint);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 550;
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

.task-tree {
  display: flex;
  flex-direction: column;
}


.timebox-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.timebox-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.timebox-date {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 600;
}

.timebox-day-count {
  font-size: 10px;
  color: var(--muted);
}

.timebox-list {
  display: flex;
  flex-direction: column;
}

.timebox-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-faint);
}

.timebox-item:last-child {
  border-bottom: none;
}

.timebox-time {
  display: flex;
  flex-direction: column;
  width: 100px;
  flex: none;
}

.time-range {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
}

.time-duration {
  font-size: 9.5px;
  color: var(--muted);
}

.timebox-main {
  flex: 1;
  min-width: 0;
}

.timebox-task {
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}

.timebox-task:hover {
  color: var(--accent);
}

.timebox-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
}

.timebox-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
}

.timebox-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.timebox-resize {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.btn-xs {
  min-height: 24px;
  padding: 3px 7px;
  font-size: 9px;
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

.relation-empty {
  padding: 12px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 11.5px;
}

.chip-check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 10.5px;
  cursor: pointer;
}

.chip-check.selected {
  border-color: var(--accent);
  background: var(--accent-faint);
  color: var(--accent-ink);
}

.chip-check input {
  accent-color: var(--accent);
}

.chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.dependency-body {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.dependency-target {
  color: var(--ink-soft);
  font-size: 12px;
}

.dependency-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.dependency-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.dependency-row:hover {
  background: var(--surface);
}

.dependency-row.selected {
  background: var(--accent-faint);
}

.dependency-row input {
  accent-color: var(--accent);
}

.dependency-name {
  flex: 1;
  font-size: 11.5px;
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-note {
  margin-top: 14px;
}

/* ---------- 分段控件 ---------- */
.seg-control {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
}

.seg-btn {
  padding: 4px 11px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.seg-btn:hover {
  color: var(--ink-soft);
}

.seg-btn.active {
  background: var(--surface);
  color: var(--accent-ink);
  box-shadow: var(--shadow-xs);
}

/* ---------- 目标树 ---------- */
.goal-title-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: color 0.15s ease;
}

.goal-title-btn:hover {
  color: var(--accent);
}

.goal-tree {
  padding: 14px 16px 16px;
}

.goal-tree-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.5;
}

.goal-tree-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 64px;
  padding: 4px;
  border: 1px dashed var(--line-faint);
  border-radius: var(--radius-md);
}

.goal-tree-row {
  --depth: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px calc(10px + var(--depth) * 22px);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  cursor: grab;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.goal-tree-row:hover {
  background: var(--surface-tint);
}

.goal-tree-row:active {
  cursor: grabbing;
}

.goal-tree-row.dragging {
  opacity: 0.45;
}

.goal-tree-row.drop-target {
  border-color: var(--accent);
  background: var(--accent-faint);
  box-shadow: inset 0 0 0 1px var(--accent-soft);
}

.goal-tree-row.archived {
  opacity: 0.62;
}

.tree-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  transform: rotate(90deg);
  cursor: pointer;
  transition: transform 0.16s ease, color 0.16s ease;
}

.tree-toggle:hover {
  color: var(--accent);
}

.tree-toggle.collapsed {
  transform: rotate(0deg);
}

.tree-toggle-empty {
  pointer-events: none;
  opacity: 0;
}

.goal-tree-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.goal-tree-main:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.goal-tree-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-tree-meta {
  margin-left: auto;
  color: var(--muted);
  font-size: 10.5px;
  white-space: nowrap;
}

.goal-tree-progress {
  flex: none;
  width: 96px;
}

.goal-tree-progress .progress-track {
  height: 5px;
}

.goal-task-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--muted);
  font-size: inherit;
  font-weight: 600;
}

.goal-task-toggle:hover {
  color: var(--accent-strong);
}

.goal-task-toggle .icon {
  transition: transform 0.16s ease;
}

.goal-task-toggle.open .icon {
  transform: rotate(90deg);
}

.goal-tree-tasks {
  display: grid;
  gap: 4px;
  padding: 6px 10px 8px calc(32px + var(--depth, 0) * 22px);
}

.goal-tree-task {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
}

.goal-tree-task:hover {
  border-color: var(--line-strong);
}

.goal-task-check {
  flex: none;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
}

.goal-task-check.done {
  border-color: var(--accent);
  background: var(--accent);
}

.goal-task-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-task-duration {
  flex: none;
  margin-left: auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.goal-tree-task-empty {
  padding: 8px 10px;
  color: var(--muted);
  font-size: 10.5px;
}

.goal-tree-empty {
  padding: 12px 2px 2px;
  color: var(--muted);
  font-size: 11px;
}

/* ---------- 看板 ---------- */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.kanban-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 190px;
  padding: 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  transition: border-color 0.16s ease;
}

.kanban-column:hover {
  border-color: var(--line-strong);
}

.kanban-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 2px 7px;
  border-bottom: 1px solid var(--line-faint);
}

.kanban-head h4 {
  font-size: 12px;
  font-weight: 600;
}

.kanban-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}

.kanban-doing .kanban-dot {
  background: var(--accent);
}

.kanban-done .kanban-dot {
  background: var(--success);
}

.kanban-count {
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.kanban-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.kanban-card {
  padding: 9px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: grab;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}

.kanban-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.kanban-card:active {
  cursor: grabbing;
}

.kanban-card.dragging {
  opacity: 0.45;
}

.kanban-card.done {
  opacity: 0.72;
}

.kanban-card.done .kanban-title {
  color: var(--muted);
  text-decoration: line-through;
}

.kanban-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kanban-due {
  margin-left: auto;
  color: var(--muted);
  font-size: 10px;
}

.kanban-title {
  margin-top: 5px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}

.kanban-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--muted);
  font-size: 10px;
}

.kanban-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.kanban-priority {
  color: var(--amber-ink);
}

.kanban-empty {
  padding: 16px 6px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 10.5px;
  text-align: center;
}



/* ---------- 日 / 周 / 月时间盒 ---------- */
.period-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 10px;
}

.period-range {
  min-width: 156px;
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.day-agenda {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.day-agenda.today {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.day-agenda-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.day-agenda-kicker {
  color: var(--accent-ink);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.day-agenda-head h4 {
  margin-top: 2px;
  font-family: var(--font-serif);
  font-size: 16px;
}

.day-agenda-list {
  margin-top: 3px;
}

.day-agenda-item {
  align-items: center;
}

.day-agenda-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 16px 24px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.65;
  text-align: center;
}

.month-board {
  margin-top: 2px;
}

.month-weekdays,
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.month-weekdays {
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 9px;
  text-align: center;
}

.month-day {
  min-width: 0;
  min-height: 104px;
  padding: 6px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.month-day:hover {
  border-color: var(--line-strong);
}

.month-day.muted {
  background: var(--surface-muted);
  opacity: 0.58;
}

.month-day.today {
  border-color: var(--accent);
  background: var(--accent-faint);
  opacity: 1;
}

.month-day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
}

.month-day-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.month-day.today .month-day-number {
  background: var(--accent);
  color: var(--on-accent);
}

.month-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-xs);
  color: var(--muted);
  opacity: 0;
}

.month-day:hover .month-add-btn,
.month-day.today .month-add-btn,
.month-add-btn:focus-visible {
  opacity: 1;
}

.month-day-items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 3px;
}

.month-timebox {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 3px 4px;
  border-radius: var(--radius-xs);
  background: var(--accent-faint);
  color: var(--accent-ink);
  text-align: left;
}

.month-timebox.done {
  background: var(--surface-muted);
  color: var(--muted);
}

.month-timebox span {
  font-family: var(--font-mono);
  font-size: 7.5px;
}

.month-timebox strong {
  overflow: hidden;
  font-size: 8.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.month-more {
  padding: 1px 4px;
  color: var(--muted);
  font-size: 8px;
}

.week-resize-btn {
  min-width: 26px;
  padding: 2px 3px;
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.week-resize-btn:hover {
  background: var(--surface-muted);
  color: var(--accent-ink);
}

/* ---------- 周时间盒 ---------- */
.week-board {
  margin-top: 14px;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.week-day {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 210px;
  padding: 8px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  transition: border-color 0.16s ease, background 0.16s ease;
}

.week-day.today {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.week-day-head {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line-faint);
}

.week-day-label {
  color: var(--ink);
  font-size: 11px;
  font-weight: 600;
}

.week-day.today .week-day-label {
  color: var(--accent);
}

.week-day-date {
  color: var(--muted);
  font-size: 9.5px;
}

.week-day-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.week-card {
  padding: 6px 7px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: var(--surface);
  cursor: grab;
  transition: border-color 0.16s ease, opacity 0.16s ease;
}

.week-card:hover {
  border-color: var(--accent);
}

.week-card.dragging {
  opacity: 0.45;
}

.week-card.done {
  opacity: 0.66;
}

.week-card-time {
  display: block;
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.week-card-title {
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  color: var(--ink);
  font-size: 10.5px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.week-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
  margin-top: 2px;
}

.week-day-empty {
  padding: 8px 0;
  color: var(--muted);
  font-size: 9.5px;
  text-align: center;
}

.week-add {
  width: 100%;
  justify-content: center;
  font-size: 10px;
}

/* ---------- 详情抽屉 ---------- */
.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-desc {
  margin-top: 10px;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.65;
}

.detail-block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line-faint);
}

.detail-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 11px;
}

.detail-block-head strong {
  color: var(--ink);
  font-size: 13px;
}

.detail-block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 11.5px;
  font-weight: 600;
}

.detail-count {
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
}

.detail-text {
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.detail-hint {
  margin-top: 5px;
  color: var(--muted);
  font-size: 10px;
}

.detail-list {
  display: grid;
  gap: 7px;
}

.detail-list > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.detail-list dt {
  flex: none;
  width: 76px;
  color: var(--muted);
  font-size: 10.5px;
}

.detail-list dd {
  margin: 0;
  color: var(--ink);
  font-size: 11.5px;
}

.detail-pill-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-pill-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 11px;
}

.detail-pill-list .badge {
  margin-left: auto;
}

.detail-task-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.detail-task-row:hover {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.detail-task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-task-meta {
  color: var(--muted);
  font-size: 10px;
}

.detail-empty {
  padding: 8px 2px;
  color: var(--muted);
  font-size: 11px;
}

@media (max-width: 1180px) {
  .week-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .goal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .exec-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kanban-board {
    grid-template-columns: minmax(0, 1fr);
  }

  .week-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .exec-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-head {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .section-head > div {
    width: 100%;
    min-width: 0;
  }

  .section-head > .row {
    flex-wrap: wrap;
  }

  .timebox-card .seg-control {
    max-width: 100%;
    overflow-x: auto;
  }

  .form-grid,
  .form-grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-tabs {
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .view-tabs::-webkit-scrollbar {
    display: none;
  }

  .view-tab {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .timebox-item {
    flex-wrap: wrap;
  }

  .timebox-actions {
    margin-left: auto;
  }

  .period-nav {
    flex-wrap: wrap;
  }

  .period-range {
    flex: 1;
    min-width: 110px;
  }

  .day-agenda-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .day-agenda-item .timebox-resize {
    width: 100%;
    padding-left: 114px;
  }

  .month-grid,
  .month-weekdays {
    gap: 3px;
  }

  .month-day {
    min-height: 82px;
    padding: 4px;
  }

  .month-day-number {
    width: 19px;
    height: 19px;
    font-size: 8.5px;
  }

  .month-add-btn {
    opacity: 1;
  }

  .month-timebox strong {
    display: none;
  }

  .week-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .goal-tree-meta,
  .goal-tree-progress {
    display: none;
  }
}
</style>
