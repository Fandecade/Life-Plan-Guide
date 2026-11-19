<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import CompetencyTreeNode from '@/components/CompetencyTreeNode.vue'
import DetailDrawer from '@/components/DetailDrawer.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useToast } from '@/composables/useToast'
import {
  levelIndex,
  levelPercent,
  useRoadmap,
  type CompetencyInput,
  type DirectionAssignmentInput,
  type MilestoneInput,
  type RoadmapKind,
} from '@/composables/useRoadmap'
import {
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  Importance,
  MilestoneStatus,
  Priority,
  competencyCategoryLabels,
  competencyLevelLabels,
  competencyStatusLabels,
  importanceLabels,
  milestoneStatusLabels,
  priorityLabels,
  type Competency,
  type Direction,
  type DirectionCompetency,
  type Milestone,
} from '@/domain'
import { formatDate, formatShortDate, fromDateInput, relativeDay, toDateInput } from '@/utils/date'

const { success, error: toastError } = useToast()

const {
  loading,
  error,
  competencies,
  milestones,
  directions,
  relations,
  activeDirections,
  directionMap,
  visibleCompetencies,
  visibleMilestones,
  assignmentsByCompetency,
  evidenceCounts,
  competencyTree,
  selectedDirectionId,
  includeArchived,
  inProgressMilestones,
  coveredDirectionCount,
  milestonesOfDirection,
  descendantsOf,
  linkedGoalsForMilestone,
  growthHistoryFor,
  refresh,
  saveCompetency,
  saveMilestone,
  moveMilestone,
  setArchived,
} = useRoadmap()

type RoadmapView = 'map' | 'milestones' | 'timeline'
type TimelineScale = 'year' | 'quarter' | 'month' | 'week'

const activeView = ref<RoadmapView>('map')
const route = useRoute()
const router = useRouter()
const timelineScale = ref<TimelineScale>('year')
const milestoneStatusFilter = ref<'ALL' | MilestoneStatus>('ALL')
const importanceFilter = ref<'ALL' | Importance>('ALL')

const categories = Object.values(CompetencyCategory)
const levels = Object.values(CompetencyLevel)
const competencyStatuses = [
  CompetencyStatus.NOT_STARTED,
  CompetencyStatus.LEARNING,
  CompetencyStatus.PENDING_VALIDATION,
  CompetencyStatus.VALIDATED,
]
const milestoneStatuses = [
  MilestoneStatus.NOT_STARTED,
  MilestoneStatus.IN_PROGRESS,
  MilestoneStatus.COMPLETED,
  MilestoneStatus.DELAYED,
  MilestoneStatus.CANCELLED,
]
const importances = [Importance.CRITICAL, Importance.IMPORTANT, Importance.NORMAL]
const relationPriorities = [Priority.HIGH, Priority.MEDIUM, Priority.LOW]
const priorityOrder: Record<Priority, number> = {
  [Priority.LOW]: 1,
  [Priority.MEDIUM]: 2,
  [Priority.HIGH]: 3,
  [Priority.URGENT]: 4,
}

const archivedCount = computed(
  () =>
    competencies.value.filter((competency) => competency.archivedAt).length +
    milestones.value.filter((milestone) => milestone.archivedAt).length,
)

const filteredDirections = computed(() =>
  selectedDirectionId.value === 'all'
    ? activeDirections.value
    : activeDirections.value.filter((direction) => direction.id === selectedDirectionId.value),
)

function milestoneMatchesFilters(milestone: Milestone): boolean {
  if (
    milestoneStatusFilter.value !== 'ALL' &&
    milestone.status !== milestoneStatusFilter.value
  ) {
    return false
  }
  if (
    importanceFilter.value !== 'ALL' &&
    milestone.importance !== importanceFilter.value
  ) {
    return false
  }
  return true
}

const filteredMilestones = computed(() =>
  visibleMilestones.value.filter(milestoneMatchesFilters),
)

function boardMilestones(directionId: string): Milestone[] {
  return milestonesOfDirection(directionId).filter(milestoneMatchesFilters)
}

const hasMilestoneFilters = computed(
  () => milestoneStatusFilter.value !== 'ALL' || importanceFilter.value !== 'ALL',
)

interface DirectionCompetencySummary {
  direction: Direction
  currentPoints: number
  requiredPoints: number
  completed: number
  total: number
  percent: number
}

const directionCompetencySummaries = computed<DirectionCompetencySummary[]>(() => {
  const competencyById = new Map(
    visibleCompetencies.value.map((competency) => [competency.id, competency]),
  )

  return filteredDirections.value.map((direction) => {
    let currentPoints = 0
    let requiredPoints = 0
    let completed = 0
    let total = 0

    for (const relation of relations.value) {
      if (relation.archivedAt || relation.directionId !== direction.id) continue
      const competency = competencyById.get(relation.competencyId)
      if (!competency) continue

      const required = levelIndex(relation.requiredLevel)
      const current = levelIndex(competency.currentLevel)
      currentPoints += Math.min(current, required)
      requiredPoints += required
      total += 1
      if (current >= required) completed += 1
    }

    return {
      direction,
      currentPoints,
      requiredPoints,
      completed,
      total,
      percent: requiredPoints > 0 ? Math.round((currentPoints / requiredPoints) * 100) : 0,
    }
  })
})

interface RoadmapStage {
  id: string
  index: number
  label: string
  startDate: string | null
  endDate: string | null
  startMilestone: Milestone | null
  endMilestone: Milestone
}

function milestoneAnchor(milestone: Milestone): string | null {
  return milestone.dueDate ?? milestone.startDate
}

const stagesByDirection = computed<Record<string, RoadmapStage[]>>(() => {
  const result: Record<string, RoadmapStage[]> = {}

  for (const direction of activeDirections.value) {
    const directionMilestones = filteredMilestones.value
      .filter((milestone) => milestone.directionId === direction.id && !milestone.archivedAt)
      .slice()
      .sort((left, right) => {
        const leftAnchor = milestoneAnchor(left) ?? '9999-12-31'
        const rightAnchor = milestoneAnchor(right) ?? '9999-12-31'
        return leftAnchor.localeCompare(rightAnchor)
      })

    result[direction.id] = directionMilestones.map((milestone, index) => {
      const previous = index > 0 ? directionMilestones[index - 1] : null
      const startDate =
        index === 0
          ? direction.startDate ?? milestone.startDate ?? milestone.dueDate
          : previous?.dueDate ?? previous?.startDate ?? null
      const endDate = milestoneAnchor(milestone)

      return {
        id: `${direction.id}:${milestone.id}`,
        index: index + 1,
        label:
          index === 0
            ? `方向启动 → ${milestone.name}`
            : `${previous?.name ?? '上一里程碑'} → ${milestone.name}`,
        startDate,
        endDate,
        startMilestone: previous,
        endMilestone: milestone,
      }
    })
  }

  return result
})

function stagesOfDirection(directionId: string): RoadmapStage[] {
  return stagesByDirection.value[directionId] ?? []
}

const detailMilestoneCompetencies = computed(() => {
  const directionId = detailMilestone.value?.directionId
  if (!directionId) return []

  return visibleCompetencies.value
    .map((competency) => {
      const assignment = (assignmentsByCompetency.value[competency.id] ?? []).find(
        (relation) => relation.directionId === directionId,
      )
      return assignment ? { competency, assignment } : null
    })
    .filter(
      (
        item,
      ): item is {
        competency: Competency
        assignment: DirectionCompetency
      } => item !== null,
    )
    .sort(
      (left, right) =>
        priorityOrder[right.assignment.priority] - priorityOrder[left.assignment.priority],
    )
})

const detailCompetencyId = ref<string | null>(null)
const detailMilestoneId = ref<string | null>(null)

const detailCompetency = computed(
  () =>
    competencies.value.find((competency) => competency.id === detailCompetencyId.value) ??
    null,
)

const detailAssignments = computed(() =>
  detailCompetency.value
    ? assignmentsByCompetency.value[detailCompetency.value.id] ?? []
    : [],
)

const detailGrowth = computed(() =>
  detailCompetency.value ? growthHistoryFor(detailCompetency.value.id) : [],
)

const growthDots = computed(() =>
  detailGrowth.value.map((item, index) => {
    const total = detailGrowth.value.length
    const x = total > 1 ? 24 + (252 / (total - 1)) * index : 150
    const level = Number(item.level.replace('L', ''))
    const y = 74 - (level / 5) * 52
    return { ...item, x, y, level }
  }),
)

const growthPoints = computed(() =>
  growthDots.value.length < 2
    ? ''
    : growthDots.value.map((dot) => `${dot.x},${dot.y}`).join(' '),
)

const detailMilestone = computed(
  () => milestones.value.find((milestone) => milestone.id === detailMilestoneId.value) ?? null,
)

const detailDirectionSummary = computed(() =>
  detailMilestone.value
    ? directionCompetencySummaries.value.find(
        (summary) => summary.direction.id === detailMilestone.value?.directionId,
      ) ?? null
    : null,
)

const detailMilestoneGoals = computed(() =>
  detailMilestone.value ? linkedGoalsForMilestone(detailMilestone.value.id) : [],
)

const detailMilestoneDirection = computed(() =>
  detailMilestone.value ? directionMap.value[detailMilestone.value.directionId] : undefined,
)

function openCompetencyDetail(competency: Competency): void {
  detailCompetencyId.value = competency.id
}

function closeCompetencyDetail(): void {
  detailCompetencyId.value = null
}

function editCompetencyFromDetail(): void {
  const competency = detailCompetency.value
  closeCompetencyDetail()
  if (competency) openCompetencyEdit(competency)
}

function archiveCompetencyFromDetail(): void {
  const competency = detailCompetency.value
  closeCompetencyDetail()
  if (competency) {
    askToggle('competency', competency.id, competency.name, competency.archivedAt)
  }
}

function openMilestoneDetail(milestone: Milestone): void {
  detailMilestoneId.value = milestone.id
}

function closeMilestoneDetail(): void {
  detailMilestoneId.value = null
}

function editMilestoneFromDetail(): void {
  const milestone = detailMilestone.value
  closeMilestoneDetail()
  if (milestone) openMilestoneEdit(milestone)
}

function archiveMilestoneFromDetail(): void {
  const milestone = detailMilestone.value
  closeMilestoneDetail()
  if (milestone) {
    askToggle('milestone', milestone.id, milestone.name, milestone.archivedAt)
  }
}

async function shiftMilestoneDate(
  milestone: Milestone,
  deltaDays: number,
): Promise<void> {
  if (!milestone.startDate && !milestone.dueDate) {
    toastError('请先为里程碑设置开始或截止日期')
    return
  }
  try {
    await moveMilestone(milestone.id, deltaDays)
    success(`「${milestone.name}」已${deltaDays < 0 ? '提前' : '延后'} ${Math.abs(deltaDays)} 天`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

function shiftStageBoundary(
  stage: RoadmapStage,
  boundary: 'start' | 'end',
  deltaDays: number,
): void {
  const milestone = boundary === 'start' ? stage.startMilestone : stage.endMilestone
  if (milestone) void shiftMilestoneDate(milestone, deltaDays)
}

const draggingMilestoneId = ref<string | null>(null)
const dragOffsetPx = ref(0)
let dragStartX = 0
let dragTrackWidth = 0
let dragMoved = false
let suppressTimelineClick = false
let suppressTimer: ReturnType<typeof setTimeout> | null = null

function onTimelinePointerDown(event: PointerEvent, bar: TimelineBar): void {
  if (event.button !== 0) return
  const track = (event.currentTarget as HTMLElement | null)?.parentElement
  if (!track) return
  dragStartX = event.clientX
  dragTrackWidth = track.getBoundingClientRect().width
  dragMoved = false
  dragOffsetPx.value = 0
  draggingMilestoneId.value = bar.milestone.id
  window.addEventListener('pointermove', onTimelinePointerMove)
  window.addEventListener('pointerup', onTimelinePointerUp)
  event.preventDefault()
}

function onTimelinePointerMove(event: PointerEvent): void {
  dragOffsetPx.value = event.clientX - dragStartX
  if (Math.abs(dragOffsetPx.value) > 3) dragMoved = true
}

async function onTimelinePointerUp(): Promise<void> {
  window.removeEventListener('pointermove', onTimelinePointerMove)
  window.removeEventListener('pointerup', onTimelinePointerUp)
  const id = draggingMilestoneId.value
  const offset = dragOffsetPx.value
  const moved = dragMoved
  const width = dragTrackWidth
  draggingMilestoneId.value = null
  dragOffsetPx.value = 0
  dragMoved = false
  dragTrackWidth = 0
  if (!id || !moved || width <= 0) return

  const rangeDays =
    (timelineRange.value.end.getTime() - timelineRange.value.start.getTime()) / 86400000
  const deltaDays = Math.round((offset / width) * rangeDays)
  if (deltaDays === 0) return

  suppressTimelineClick = true
  if (suppressTimer) clearTimeout(suppressTimer)
  suppressTimer = setTimeout(() => {
    suppressTimelineClick = false
  }, 260)

  try {
    await moveMilestone(id, deltaDays)
    success(`里程碑日期已调整 ${deltaDays > 0 ? '+' : ''}${deltaDays} 天`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

function handleTimelineBarClick(bar: TimelineBar): void {
  if (suppressTimelineClick) {
    suppressTimelineClick = false
    return
  }
  openMilestoneDetail(bar.milestone)
}

function timelineBarStyle(bar: TimelineBar): Record<string, string> {
  const style: Record<string, string> = {
    left: `${bar.startPercent}%`,
    width: `${bar.widthPercent}%`,
    '--bar-color': directionMap.value[bar.milestone.directionId]?.color ?? '#3563e9',
  }
  if (draggingMilestoneId.value === bar.milestone.id) {
    style.transform = `translateX(${dragOffsetPx.value}px)`
  }
  return style
}

function timelinePhaseStyle(
  phase: TimelinePhase,
  direction: Direction,
): Record<string, string> {
  return {
    left: `${phase.startPercent}%`,
    width: `${phase.widthPercent}%`,
    '--phase-color': direction.color,
  }
}

interface CompetencyForm {
  name: string
  description: string
  category: CompetencyCategory
  parentId: string
  targetLevel: CompetencyLevel
  currentLevel: CompetencyLevel
  status: CompetencyStatus
  assessmentCriteria: string
  selectedDirectionIds: string[]
  requiredLevels: Record<string, CompetencyLevel>
  priorities: Record<string, Priority>
}

function emptyCompetencyForm(): CompetencyForm {
  return {
    name: '',
    description: '',
    category: CompetencyCategory.KNOWLEDGE,
    parentId: '',
    targetLevel: CompetencyLevel.L3,
    currentLevel: CompetencyLevel.L0,
    status: CompetencyStatus.NOT_STARTED,
    assessmentCriteria: '',
    selectedDirectionIds: [],
    requiredLevels: {},
    priorities: {},
  }
}

interface MilestoneForm {
  name: string
  description: string
  directionId: string
  importance: Importance
  status: MilestoneStatus
  startDate: string
  dueDate: string
  successCriteria: string
}

function emptyMilestoneForm(): MilestoneForm {
  return {
    name: '',
    description: '',
    directionId: '',
    importance: Importance.IMPORTANT,
    status: MilestoneStatus.NOT_STARTED,
    startDate: '',
    dueDate: '',
    successCriteria: '',
  }
}

const competencyForm = reactive<CompetencyForm>(emptyCompetencyForm())
const milestoneForm = reactive<MilestoneForm>(emptyMilestoneForm())
const modalKind = ref<'competency' | 'milestone' | null>(null)
const editingId = ref<string | null>(null)
const formError = ref('')
const saving = ref(false)

const modalTitle = computed(() => {
  if (modalKind.value === 'competency') {
    return editingId.value ? '编辑能力节点' : '添加能力节点'
  }
  if (modalKind.value === 'milestone') {
    return editingId.value ? '编辑里程碑' : '添加里程碑'
  }
  return ''
})

const modalSubtitle = computed(() => {
  if (modalKind.value === 'competency') {
    return '能力可以属于多个发展方向，等级必须以评价标准和成果证据为依据。'
  }
  if (modalKind.value === 'milestone') {
    return '里程碑表示阶段性成果，必须属于一个发展方向，而不是普通待办。'
  }
  return ''
})

const blockedParentIds = computed(() => {
  const ids = new Set<string>()
  if (editingId.value) {
    ids.add(editingId.value)
    for (const id of descendantsOf(editingId.value)) ids.add(id)
  }
  return ids
})

const parentOptions = computed(() =>
  competencies.value
    .filter(
      (competency) => !competency.archivedAt && !blockedParentIds.value.has(competency.id),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
)

const milestoneDirectionOptions = computed(() =>
  directions.value.filter((direction) => !direction.archivedAt),
)

function toggleDirection(directionId: string, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    if (!competencyForm.selectedDirectionIds.includes(directionId)) {
      competencyForm.selectedDirectionIds.push(directionId)
    }
    if (!competencyForm.requiredLevels[directionId]) {
      competencyForm.requiredLevels[directionId] = competencyForm.targetLevel
    }
    if (!competencyForm.priorities[directionId]) {
      competencyForm.priorities[directionId] = Priority.MEDIUM
    }
  } else {
    competencyForm.selectedDirectionIds = competencyForm.selectedDirectionIds.filter(
      (id) => id !== directionId,
    )
  }
}

function resetModal(): void {
  modalKind.value = null
  editingId.value = null
  formError.value = ''
}

function openCompetencyCreate(parent?: Competency): void {
  editingId.value = null
  Object.assign(competencyForm, emptyCompetencyForm())
  if (parent) competencyForm.parentId = parent.id
  formError.value = ''
  modalKind.value = 'competency'
}

function openCompetencyEdit(competency: Competency): void {
  editingId.value = competency.id
  const assignments = assignmentsByCompetency.value[competency.id] ?? []
  Object.assign(competencyForm, {
    name: competency.name,
    description: competency.description,
    category: competency.category,
    parentId: competency.parentId ?? '',
    targetLevel: competency.targetLevel,
    currentLevel: competency.currentLevel,
    status: competency.status,
    assessmentCriteria: competency.assessmentCriteria,
    selectedDirectionIds: assignments.map((relation) => relation.directionId),
    requiredLevels: Object.fromEntries(
      assignments.map((relation) => [relation.directionId, relation.requiredLevel]),
    ),
    priorities: Object.fromEntries(
      assignments.map((relation) => [relation.directionId, relation.priority]),
    ),
  })
  formError.value = ''
  modalKind.value = 'competency'
}

async function submitCompetency(): Promise<void> {
  formError.value = ''
  if (!competencyForm.name.trim()) {
    formError.value = '能力名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: CompetencyInput = {
      name: competencyForm.name.trim(),
      description: competencyForm.description.trim(),
      category: competencyForm.category,
      parentId: competencyForm.parentId || null,
      targetLevel: competencyForm.targetLevel,
      currentLevel: competencyForm.currentLevel,
      assessmentCriteria: competencyForm.assessmentCriteria.trim(),
      status: competencyForm.status,
    }
    const assignments: DirectionAssignmentInput[] = competencyForm.selectedDirectionIds.map(
      (directionId) => ({
        directionId,
        requiredLevel: competencyForm.requiredLevels[directionId] ?? competencyForm.targetLevel,
        priority: competencyForm.priorities[directionId] ?? Priority.MEDIUM,
      }),
    )
    await saveCompetency(payload, assignments, editingId.value ?? undefined)
    const created = !editingId.value
    resetModal()
    success(created ? '能力节点已添加' : '能力节点已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

function openMilestoneCreate(directionId?: string): void {
  editingId.value = null
  Object.assign(milestoneForm, emptyMilestoneForm())
  milestoneForm.directionId =
    directionId ??
    (selectedDirectionId.value !== 'all'
      ? selectedDirectionId.value
      : activeDirections.value[0]?.id ?? '')
  formError.value = ''
  modalKind.value = 'milestone'
}

function openMilestoneEdit(milestone: Milestone): void {
  editingId.value = milestone.id
  Object.assign(milestoneForm, {
    name: milestone.name,
    description: milestone.description,
    directionId: milestone.directionId,
    importance: milestone.importance,
    status: milestone.status,
    startDate: toDateInput(milestone.startDate),
    dueDate: toDateInput(milestone.dueDate),
    successCriteria: milestone.successCriteria,
  })
  formError.value = ''
  modalKind.value = 'milestone'
}

async function submitMilestone(): Promise<void> {
  formError.value = ''
  if (!milestoneForm.name.trim()) {
    formError.value = '里程碑名称不能为空'
    return
  }
  if (!milestoneForm.directionId) {
    formError.value = '里程碑必须属于一个发展方向'
    return
  }
  const startDate = fromDateInput(milestoneForm.startDate)
  const dueDate = fromDateInput(milestoneForm.dueDate)
  if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
    formError.value = '预期完成日期不能早于开始日期'
    return
  }
  saving.value = true
  try {
    const payload: MilestoneInput = {
      directionId: milestoneForm.directionId,
      name: milestoneForm.name.trim(),
      description: milestoneForm.description.trim(),
      startDate,
      dueDate,
      importance: milestoneForm.importance,
      status: milestoneForm.status,
      successCriteria: milestoneForm.successCriteria.trim(),
    }
    await saveMilestone(payload, editingId.value ?? undefined)
    const created = !editingId.value
    resetModal()
    success(created ? '里程碑已添加' : '里程碑已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{
  kind: RoadmapKind
  id: string
  label: string
  archived: boolean
} | null>(null)

const confirmTitle = computed(() =>
  confirmTarget.value?.archived ? '恢复内容' : '归档内容',
)

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在默认列表中。`
  return `将归档「${target.label}」。不会删除其子能力、关联方向或历史记录，归档后可以随时恢复。`
})

function askToggle(kind: RoadmapKind, id: string, label: string, archivedAt: string | null): void {
  confirmTarget.value = { kind, id, label, archived: Boolean(archivedAt) }
  confirmOpen.value = true
}

async function runToggle(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    await setArchived(target.kind, target.id, !target.archived)
    success(target.archived ? '已恢复' : '已归档，可随时恢复')
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

interface TimelineTick {
  key: string
  label: string
  percent: number
  major: boolean
}

const timelineRange = computed(() => {
  const timestamps: number[] = [Date.now()]
  for (const milestone of visibleMilestones.value) {
    if (milestone.startDate) timestamps.push(new Date(milestone.startDate).getTime())
    if (milestone.dueDate) timestamps.push(new Date(milestone.dueDate).getTime())
  }
  for (const direction of activeDirections.value) {
    if (direction.startDate) timestamps.push(new Date(direction.startDate).getTime())
    if (direction.targetDate) timestamps.push(new Date(direction.targetDate).getTime())
  }
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  const start = new Date(min)
  start.setMonth(0, 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(max)
  end.setMonth(11, 31)
  end.setHours(23, 59, 59, 999)
  if (end.getTime() <= start.getTime()) {
    end.setFullYear(start.getFullYear() + 1)
  }
  return { start, end }
})

function percentOfDate(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value)
  const { start, end } = timelineRange.value
  const ratio = (date.getTime() - start.getTime()) / (end.getTime() - start.getTime())
  return Math.max(0, Math.min(100, ratio * 100))
}

const timelineTicks = computed<TimelineTick[]>(() => {
  const { start, end } = timelineRange.value
  const result: TimelineTick[] = []
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()

  if (timelineScale.value === 'year') {
    for (let year = startYear; year <= endYear; year += 1) {
      const date = new Date(year, 0, 1)
      result.push({
        key: `y-${year}`,
        label: `${year}`,
        percent: percentOfDate(date),
        major: true,
      })
    }
    return result
  }

  if (timelineScale.value === 'quarter') {
    for (let year = startYear; year <= endYear; year += 1) {
      for (let quarter = 0; quarter < 4; quarter += 1) {
        const date = new Date(year, quarter * 3, 1)
        if (date < start || date > end) continue
        result.push({
          key: `q-${year}-${quarter}`,
          label: `${year} Q${quarter + 1}`,
          percent: percentOfDate(date),
          major: quarter === 0,
        })
      }
    }
    return result
  }

  if (timelineScale.value === 'week') {
    const cursor = new Date(start)
    const offset = (cursor.getDay() + 6) % 7
    cursor.setDate(cursor.getDate() - offset)
    let lastMonth = -1
    while (cursor <= end) {
      if (cursor >= start) {
        const monthChanged = cursor.getMonth() !== lastMonth
        if (monthChanged) lastMonth = cursor.getMonth()
        result.push({
          key: `w-${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`,
          label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
          percent: percentOfDate(cursor),
          major: monthChanged,
        })
      }
      cursor.setDate(cursor.getDate() + 7)
    }
    return result
  }

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(year, month, 1)
      if (date < start || date > end) continue
      result.push({
        key: `m-${year}-${month}`,
        label: month === 0 ? `${year}` : `${month + 1}月`,
        percent: percentOfDate(date),
        major: month === 0,
      })
    }
  }
  return result
})

const timelineWidth = computed(() => {
  if (timelineScale.value === 'year') return 880
  if (timelineScale.value === 'quarter') {
    return Math.max(880, timelineTicks.value.length * 104)
  }
  if (timelineScale.value === 'week') {
    return Math.max(1200, timelineTicks.value.length * 48)
  }
  return Math.max(980, timelineTicks.value.length * 62)
})

interface TimelineBar {
  milestone: Milestone
  startPercent: number
  widthPercent: number
}

interface TimelinePhase {
  stage: RoadmapStage
  startPercent: number
  widthPercent: number
}

const timelineRows = computed(() =>
  filteredDirections.value.map((direction) => {
    const bars: TimelineBar[] = filteredMilestones.value
      .filter(
        (milestone) =>
          milestone.directionId === direction.id &&
          (milestone.startDate !== null || milestone.dueDate !== null),
      )
      .map((milestone) => {
        const startValue = milestone.startDate ?? milestone.dueDate ?? ''
        const endValue = milestone.dueDate ?? milestone.startDate ?? ''
        const startPercent = percentOfDate(startValue)
        const endPercent = percentOfDate(endValue)
        return {
          milestone,
          startPercent,
          widthPercent: Math.max(endPercent - startPercent, 1.4),
        }
      })
      .sort((left, right) => left.startPercent - right.startPercent)

    const phases: TimelinePhase[] = stagesOfDirection(direction.id)
      .filter((stage) => stage.startDate !== null && stage.endDate !== null)
      .map((stage) => {
        const startPercent = percentOfDate(stage.startDate as string)
        const endPercent = percentOfDate(stage.endDate as string)
        return {
          stage,
          startPercent: Math.min(startPercent, endPercent),
          widthPercent: Math.max(Math.abs(endPercent - startPercent), 1.4),
        }
      })

    return { direction, bars, phases }
  }),
)

const hasTimelineItems = computed(() =>
  timelineRows.value.some((row) => row.bars.length > 0),
)

const todayPercent = computed(() => {
  const value = percentOfDate(new Date())
  return value > 0 && value < 100 ? value : null
})

const timelineScroll = ref<HTMLElement | null>(null)

async function scrollToToday(): Promise<void> {
  await nextTick()
  const element = timelineScroll.value
  const percent = todayPercent.value
  if (!element || percent === null) return
  const trackWidth = Math.max(0, element.scrollWidth - 180)
  const target = 180 + trackWidth * (percent / 100) - element.clientWidth / 2
  element.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
}

function changeTimelineScale(scale: TimelineScale): void {
  timelineScale.value = scale
  void scrollToToday()
}

watch(timelineScale, () => {
  void scrollToToday()
})

onMounted(async () => {
  await refresh()

  let handledDeepLink = false
  const directionParam = String(route.query.direction ?? '')
  if (directionParam) {
    handledDeepLink = true
    const direction = activeDirections.value.find((item) => item.id === directionParam)
    if (direction) {
      selectedDirectionId.value = direction.id
      activeView.value = 'map'
    } else {
      toastError('这个发展方向不存在或已经归档')
    }
  }

  const milestoneParam = String(route.query.milestone ?? '')
  if (milestoneParam) {
    handledDeepLink = true
    const milestone = milestones.value.find((item) => item.id === milestoneParam)
    if (milestone) {
      activeView.value = 'milestones'
      openMilestoneDetail(milestone)
    } else {
      toastError('这个里程碑不存在或已经归档')
    }
  }

  if (handledDeepLink) await router.replace('/roadmap')
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onTimelinePointerMove)
  window.removeEventListener('pointerup', onTimelinePointerUp)
  if (suppressTimer) clearTimeout(suppressTimer)
})
</script>

<template>
  <div class="page roadmap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">方向与路线 · 长期路线</p>
        <h2 class="page-title">发展路线图</h2>
        <p class="page-subtitle">
          用能力地图、里程碑与时间线三种视图管理长期路线。Roadmap 负责战略与阶段成果，不等于日历。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="openCompetencyCreate()">
          <AppIcon name="layers" :size="15" />
          新建能力
        </button>
        <button class="btn btn-primary" @click="openMilestoneCreate()">
          <AppIcon name="flag" :size="15" />
          新建里程碑
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="roadmap-stats">
      <div class="roadmap-stat">
        <span class="stat-icon"><AppIcon name="layers" :size="16" /></span>
        <div>
          <span class="stat-number">{{ visibleCompetencies.length }}</span>
          <span class="stat-caption">能力节点</span>
        </div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-amber"><AppIcon name="flag" :size="16" /></span>
        <div>
          <span class="stat-number">{{ visibleMilestones.length }}</span>
          <span class="stat-caption">里程碑</span>
        </div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-blue"><AppIcon name="play" :size="16" /></span>
        <div>
          <span class="stat-number">{{ inProgressMilestones }}</span>
          <span class="stat-caption">进行中里程碑</span>
        </div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-violet"><AppIcon name="map" :size="16" /></span>
        <div>
          <span class="stat-number">{{ coveredDirectionCount }}</span>
          <span class="stat-caption">覆盖发展方向</span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar">
      <div class="view-tabs" role="tablist" aria-label="路线图视图">
        <button
          class="view-tab"
          :class="{ active: activeView === 'map' }"
          role="tab"
          :aria-selected="activeView === 'map'"
          @click="activeView = 'map'"
        >
          <AppIcon name="layers" :size="15" />
          能力地图
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'milestones' }"
          role="tab"
          :aria-selected="activeView === 'milestones'"
          @click="activeView = 'milestones'"
        >
          <AppIcon name="flag" :size="15" />
          里程碑
        </button>
        <button
          class="view-tab"
          :class="{ active: activeView === 'timeline' }"
          role="tab"
          :aria-selected="activeView === 'timeline'"
          @click="activeView = 'timeline'"
        >
          <AppIcon name="calendar" :size="15" />
          时间线
        </button>
      </div>

      <div class="toolbar-actions">
        <select v-model="selectedDirectionId" class="select direction-filter" aria-label="按方向筛选">
          <option value="all">全部方向</option>
          <option v-for="direction in activeDirections" :key="direction.id" :value="direction.id">
            {{ direction.name }}
          </option>
        </select>
        <template v-if="activeView !== 'map'">
          <select
            v-model="milestoneStatusFilter"
            class="select direction-filter"
            aria-label="按里程碑状态筛选"
          >
            <option value="ALL">全部状态</option>
            <option v-for="status in milestoneStatuses" :key="status" :value="status">
              {{ milestoneStatusLabels[status] }}
            </option>
          </select>
          <select
            v-model="importanceFilter"
            class="select direction-filter"
            aria-label="按重要程度筛选"
          >
            <option value="ALL">全部重要度</option>
            <option v-for="importance in importances" :key="importance" :value="importance">
              {{ importanceLabels[importance] }}
            </option>
          </select>
        </template>
        <button
          class="btn btn-ghost"
          :class="{ 'is-on': includeArchived }"
          :aria-pressed="includeArchived"
          @click="includeArchived = !includeArchived"
        >
          <AppIcon name="archive" :size="14" />
          {{ includeArchived ? '隐藏已归档' : '显示已归档' }}
          <span v-if="archivedCount" class="archive-count">{{ archivedCount }}</span>
        </button>
      </div>
    </section>

    <div v-if="loading" class="skeleton roadmap-loading" />

    <template v-else>
      <section v-if="activeView === 'map'" class="card card-pad map-card">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="layers" :size="16" />
            能力地图
            <span class="count-pill">{{ visibleCompetencies.length }}</span>
          </h3>
          <span class="section-note">一个能力可以被多个方向共享</span>
        </div>

        <div class="level-legend" aria-hidden="true">
          <span v-for="level in levels" :key="level" class="legend-item">
            <span class="legend-code">{{ level }}</span>
            <span class="legend-text">{{ competencyLevelLabels[level].split('·')[1]?.trim() }}</span>
          </span>
        </div>

        <section
          v-if="directionCompetencySummaries.length"
          class="direction-progress-grid"
          aria-label="方向能力完整度"
        >
          <article
            v-for="summary in directionCompetencySummaries"
            :key="summary.direction.id"
            class="direction-progress-card"
          >
            <div class="direction-progress-head">
              <span class="column-dot" :style="{ background: summary.direction.color }" />
              <strong>{{ summary.direction.name }}</strong>
              <span class="direction-progress-percent">{{ summary.percent }}%</span>
            </div>
            <div class="direction-progress-meta">
              <span v-if="summary.total">
                {{ summary.completed }} / {{ summary.total }} 项能力达标 ·
                {{ summary.currentPoints }} / {{ summary.requiredPoints }} 等级分
              </span>
              <span v-else>尚未关联能力</span>
            </div>
            <div class="direction-progress-track" aria-hidden="true">
              <span
                class="direction-progress-fill"
                :style="{ width: `${summary.percent}%`, background: summary.direction.color }"
              />
            </div>
          </article>
        </section>

        <EmptyState
          v-if="activeDirections.length === 0"
          title="还没有发展方向"
          description="能力需要挂在发展方向上。先在“未来自我”中建立一个方向，再回来搭建能力地图。"
        >
          <RouterLink to="/future-self" class="btn btn-sm btn-secondary">
            去创建发展方向
          </RouterLink>
        </EmptyState>

        <EmptyState
          v-else-if="competencyTree.length === 0"
          title="能力地图还是空的"
          description="从一组可以被验证的能力开始，例如“C++ 工程能力”或“科研阅读与写作”。"
        >
          <button class="btn btn-sm btn-secondary" @click="openCompetencyCreate()">
            添加第一个能力
          </button>
        </EmptyState>

        <ul v-else class="competency-tree">
          <CompetencyTreeNode
            v-for="node in competencyTree"
            :key="node.competency.id"
            :node="node"
            :direction-map="directionMap"
            :assignments-by-competency="assignmentsByCompetency"
            :evidence-counts="evidenceCounts"
            @add-child="openCompetencyCreate"
            @edit="openCompetencyEdit"
            @open-detail="openCompetencyDetail"
            @toggle-archive="
              (competency) => askToggle('competency', competency.id, competency.name, competency.archivedAt)
            "
          />
        </ul>

        <div v-if="activeDirections.length > 0" class="map-foot">
          <button class="btn btn-sm btn-ghost" @click="openCompetencyCreate()">
            <AppIcon name="plus" :size="14" />
            添加根能力
          </button>
        </div>
      </section>

      <div v-else-if="activeView === 'milestones'" class="milestone-board">
        <EmptyState
          v-if="activeDirections.length === 0"
          title="还没有发展方向"
          description="里程碑必须属于一个发展方向，先创建一个方向再回来。"
        >
          <RouterLink to="/future-self" class="btn btn-sm btn-secondary">
            去创建发展方向
          </RouterLink>
        </EmptyState>

        <section
          v-for="direction in filteredDirections"
          v-else
          :key="direction.id"
          class="direction-column card"
        >
          <header class="column-head">
            <span class="column-dot" :style="{ background: direction.color }" />
            <div class="column-title">
              <span class="column-name">{{ direction.name }}</span>
              <span class="column-meta">
                {{ boardMilestones(direction.id).length }} 个里程碑 ·
                {{ formatDate(direction.targetDate) }}
              </span>
            </div>
            <button
              class="icon-btn"
              title="在此方向添加里程碑"
              aria-label="在此方向添加里程碑"
              @click="openMilestoneCreate(direction.id)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
          </header>

          <section
            v-if="stagesOfDirection(direction.id).length"
            class="stage-list"
            :aria-label="`${direction.name}的阶段轨道`"
          >
            <div class="stage-list-head">
              <span>
                <AppIcon name="flag" :size="12" />
                阶段轨道
              </span>
              <span>由里程碑日期推导</span>
            </div>

            <article
              v-for="stage in stagesOfDirection(direction.id)"
              :key="stage.id"
              class="stage-card"
            >
              <div class="stage-card-main">
                <span class="stage-index">P{{ stage.index }}</span>
                <button class="stage-name-btn" @click="openMilestoneDetail(stage.endMilestone)">
                  {{ stage.label }}
                </button>
                <span class="stage-range">
                  {{ formatShortDate(stage.startDate) }} → {{ formatShortDate(stage.endDate) }}
                </span>
              </div>
              <div class="stage-actions">
                <template v-if="stage.startMilestone">
                  <span class="stage-boundary-label">起点</span>
                  <button
                    class="date-shift-btn"
                    :aria-label="`${stage.startMilestone.name}提前一天`"
                    @click="shiftStageBoundary(stage, 'start', -1)"
                  >
                    提前 1 天
                  </button>
                  <button
                    class="date-shift-btn"
                    :aria-label="`${stage.startMilestone.name}延后一天`"
                    @click="shiftStageBoundary(stage, 'start', 1)"
                  >
                    延后 1 天
                  </button>
                </template>
                <span class="stage-boundary-label">终点</span>
                <button
                  class="date-shift-btn"
                  :aria-label="`${stage.endMilestone.name}提前一天`"
                  @click="shiftStageBoundary(stage, 'end', -1)"
                >
                  提前 1 天
                </button>
                <button
                  class="date-shift-btn"
                  :aria-label="`${stage.endMilestone.name}延后一天`"
                  @click="shiftStageBoundary(stage, 'end', 1)"
                >
                  延后 1 天
                </button>
                <button class="stage-open-btn" @click="openMilestoneDetail(stage.endMilestone)">
                  查看里程碑
                  <AppIcon name="arrow-right" :size="11" />
                </button>
              </div>
            </article>

            <button class="btn btn-sm btn-secondary stage-add-btn" @click="openMilestoneCreate(direction.id)">
              <AppIcon name="plus" :size="13" />
              新增阶段里程碑
            </button>
          </section>

          <div v-if="boardMilestones(direction.id).length === 0" class="column-empty">
            <span>{{ hasMilestoneFilters ? '当前筛选下没有里程碑。' : '这个方向还没有阶段成果。' }}</span>
            <button class="link-btn" @click="openMilestoneCreate(direction.id)">
              添加一个里程碑
              <AppIcon name="arrow-right" :size="12" />
            </button>
          </div>

          <ul v-else class="milestone-list">
            <li
              v-for="milestone in boardMilestones(direction.id)"
              :key="milestone.id"
              class="milestone-card"
              :class="{ archived: milestone.archivedAt }"
            >
              <div class="milestone-top">
                <button class="milestone-name milestone-name-btn" @click="openMilestoneDetail(milestone)">
                  {{ milestone.name }}
                </button>
                <span class="badge">{{ milestoneStatusLabels[milestone.status] }}</span>
              </div>
              <div class="milestone-meta">
                <span class="badge badge-accent">{{ importanceLabels[milestone.importance] }}</span>
                <span>{{ formatShortDate(milestone.startDate) }} → {{ formatShortDate(milestone.dueDate) }}</span>
                <span class="milestone-when">{{ relativeDay(milestone.dueDate) }}</span>
              </div>
              <p v-if="milestone.successCriteria" class="milestone-criteria">
                <AppIcon name="check" :size="12" />
                {{ milestone.successCriteria }}
              </p>
              <div class="milestone-foot">
                <span v-if="milestone.archivedAt" class="badge badge-amber">已归档</span>
                <div
                  v-else-if="milestone.startDate || milestone.dueDate"
                  class="milestone-date-actions"
                >
                  <button
                    class="date-shift-btn"
                    :aria-label="`${milestone.name}提前一天`"
                    @click="shiftMilestoneDate(milestone, -1)"
                  >
                    提前 1 天
                  </button>
                  <button
                    class="date-shift-btn"
                    :aria-label="`${milestone.name}延后一天`"
                    @click="shiftMilestoneDate(milestone, 1)"
                  >
                    延后 1 天
                  </button>
                </div>
                <div class="row-actions">
                  <button
                    v-if="!milestone.archivedAt"
                    class="icon-btn"
                    title="编辑里程碑"
                    aria-label="编辑里程碑"
                    @click="openMilestoneEdit(milestone)"
                  >
                    <AppIcon name="sliders" :size="14" />
                  </button>
                  <button
                    class="icon-btn"
                    :title="milestone.archivedAt ? '恢复里程碑' : '归档里程碑'"
                    :aria-label="milestone.archivedAt ? '恢复里程碑' : '归档里程碑'"
                    @click="askToggle('milestone', milestone.id, milestone.name, milestone.archivedAt)"
                  >
                    <AppIcon :name="milestone.archivedAt ? 'archive' : 'trash'" :size="14" />
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <section v-else class="card card-pad timeline-card">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="calendar" :size="16" />
            多轨道时间线
          </h3>
          <div class="timeline-controls">
            <div class="scale-switch">
              <button
                class="scale-btn"
                :class="{ active: timelineScale === 'year' }"
                @click="changeTimelineScale('year')"
              >
                年
              </button>
              <button
                class="scale-btn"
                :class="{ active: timelineScale === 'quarter' }"
                @click="changeTimelineScale('quarter')"
              >
                季度
              </button>
              <button
                class="scale-btn"
                :class="{ active: timelineScale === 'month' }"
                @click="changeTimelineScale('month')"
              >
                月
              </button>
              <button
                class="scale-btn"
                :class="{ active: timelineScale === 'week' }"
                @click="changeTimelineScale('week')"
              >
                周
              </button>
            </div>
            <button class="timeline-today-btn" @click="scrollToToday">
              <AppIcon name="target" :size="12" />
              回到今天
            </button>
            <span class="section-note">
              {{ formatDate(timelineRange.start.toISOString()) }} —
              {{ formatDate(timelineRange.end.toISOString()) }}
            </span>
          </div>
        </div>

        <EmptyState
          v-if="!hasTimelineItems"
          title="时间线上还没有里程碑"
          description="为里程碑补充开始或截止日期后，它们会按发展方向显示在时间线上。"
        >
          <button class="btn btn-sm btn-secondary" @click="openMilestoneCreate()">
            添加里程碑
          </button>
        </EmptyState>

        <div v-else ref="timelineScroll" class="timeline-scroll">
          <div class="timeline-table" :style="{ minWidth: `${180 + timelineWidth}px` }">
            <div class="timeline-row timeline-head-row">
              <div class="timeline-label">发展方向</div>
              <div class="timeline-track ticks-track" :style="{ minWidth: `${timelineWidth}px` }">
                <span
                  v-for="tick in timelineTicks"
                  :key="tick.key"
                  class="tick"
                  :class="{ major: tick.major }"
                  :style="{ left: `${tick.percent}%` }"
                >
                  {{ tick.label }}
                </span>
              </div>
            </div>

            <div v-for="row in timelineRows" :key="row.direction.id" class="timeline-row">
              <div class="timeline-label">
                <span class="lane-dot" :style="{ background: row.direction.color }" />
                <span class="lane-name">{{ row.direction.name }}</span>
              </div>
              <div class="timeline-track lane-track">
                <span class="lane-line" />
                <span
                  v-if="todayPercent !== null"
                  class="today-line"
                  :style="{ left: `${todayPercent}%` }"
                  title="今天"
                />
                <button
                  v-for="phase in row.phases"
                  :key="phase.stage.id"
                  class="timeline-phase"
                  :style="timelinePhaseStyle(phase, row.direction)"
                  :title="`阶段 P${phase.stage.index}：${phase.stage.label}`"
                  @click.stop="openMilestoneDetail(phase.stage.endMilestone)"
                >
                  <span>P{{ phase.stage.index }}</span>
                  <span class="timeline-phase-name">{{ phase.stage.endMilestone.name }}</span>
                </button>
                <button
                  v-for="bar in row.bars"
                  :key="bar.milestone.id"
                  class="timeline-bar"
                  :class="{ dragging: draggingMilestoneId === bar.milestone.id }"
                  :style="timelineBarStyle(bar)"
                  :title="`${bar.milestone.name} · ${formatDate(bar.milestone.startDate)} → ${formatDate(bar.milestone.dueDate)}\n拖动调整日期，点击查看详情`"
                  @pointerdown.stop="onTimelinePointerDown($event, bar)"
                  @click="handleTimelineBarClick(bar)"
                >
                  <span class="bar-text">{{ bar.milestone.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="timeline-foot">
          <span class="timeline-legend"><span class="legend-today" /> 今天</span>
          <span class="timeline-legend"><span class="legend-phase" /> 推导阶段区间</span>
          <span class="timeline-legend"><span class="legend-bar" /> 里程碑时间范围</span>
          <span class="timeline-legend"><AppIcon name="sliders" :size="11" /> 拖动里程碑或用按钮调整日期</span>
          <span class="section-note">横向滚动查看更长周期</span>
        </div>
      </section>
    </template>

    <DetailDrawer
      :open="detailCompetency !== null"
      :title="detailCompetency?.name ?? '能力详情'"
      :subtitle="detailCompetency ? competencyCategoryLabels[detailCompetency.category] : ''"
      :width="460"
      @close="closeCompetencyDetail"
    >
      <div v-if="detailCompetency" class="competency-detail">
        <div class="detail-badge-row">
          <span class="badge">{{ competencyStatusLabels[detailCompetency.status] }}</span>
          <span v-if="detailCompetency.archivedAt" class="badge badge-amber">已归档</span>
          <span class="badge">{{ evidenceCounts[detailCompetency.id] ?? 0 }} 条证据</span>
        </div>

        <p class="detail-description">
          {{ detailCompetency.description || '还没有补充能力说明。' }}
        </p>

        <div class="detail-level-block">
          <div class="detail-level-head">
            <span>当前等级</span>
            <strong>{{ detailCompetency.currentLevel }} → {{ detailCompetency.targetLevel }}</strong>
          </div>
          <div class="level-track detail-level-track">
            <span
              class="level-fill"
              :style="{ width: `${levelPercent(detailCompetency.currentLevel)}%` }"
            />
            <span
              class="level-target"
              :style="{ left: `${levelPercent(detailCompetency.targetLevel)}%` }"
            />
          </div>
          <div class="detail-level-caption">
            <span>{{ competencyLevelLabels[detailCompetency.currentLevel] }}</span>
            <span>目标：{{ competencyLevelLabels[detailCompetency.targetLevel] }}</span>
          </div>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">评价标准</span>
          <p>{{ detailCompetency.assessmentCriteria || '还没有设置评价标准。' }}</p>
        </div>

        <div v-if="detailAssignments.length" class="detail-block">
          <span class="detail-block-label">关联发展方向</span>
          <div class="detail-tags">
            <span
              v-for="assignment in detailAssignments"
              :key="assignment.id"
              class="detail-tag"
              :style="{ '--tag-color': directionMap[assignment.directionId]?.color ?? '#3563e9' }"
            >
              <span class="tag-dot" />
              {{ directionMap[assignment.directionId]?.name ?? '未知方向' }}
              · 要求 {{ assignment.requiredLevel }}
            </span>
          </div>
        </div>

        <div class="growth-block">
          <div class="section-head">
            <h4 class="growth-title">
              <AppIcon name="spark" :size="14" />
              成长曲线
            </h4>
            <span class="section-note">来自成果评价，不按学习时长拟合</span>
          </div>

          <div v-if="detailGrowth.length < 2" class="growth-empty">
            数据积累中：至少需要两次带等级的成果评价，才能形成可解释的趋势。
          </div>
          <template v-else>
            <svg class="growth-svg" viewBox="0 0 300 90" role="img" aria-label="能力等级变化">
              <line v-for="y in [22, 48, 74]" :key="y" x1="18" :y1="y" x2="282" :y2="y" class="growth-grid-line" />
              <polyline :points="growthPoints" class="growth-line" />
              <circle
                v-for="dot in growthDots"
                :key="dot.id"
                :cx="dot.x"
                :cy="dot.y"
                r="3.5"
                class="growth-dot"
              />
            </svg>
            <div class="growth-axis">
              <span>{{ formatShortDate(growthDots[0]?.date ?? null) }}</span>
              <span>{{ formatShortDate(growthDots[growthDots.length - 1]?.date ?? null) }}</span>
            </div>
          </template>

          <div v-if="detailGrowth.length" class="growth-history">
            <div v-for="item in detailGrowth" :key="item.id" class="growth-entry">
              <span class="growth-entry-level">{{ item.level }}</span>
              <div>
                <span class="growth-entry-title">{{ item.evidenceTitle }}</span>
                <span class="growth-entry-meta">
                  {{ formatShortDate(item.date) }} · {{ item.note || '未填写评价说明' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button
          v-if="detailCompetency && !detailCompetency.archivedAt"
          class="btn btn-sm btn-secondary"
          @click="editCompetencyFromDetail"
        >
          编辑能力
        </button>
        <button class="btn btn-sm btn-primary" @click="archiveCompetencyFromDetail">
          {{ detailCompetency?.archivedAt ? '恢复能力' : '归档能力' }}
        </button>
      </template>
    </DetailDrawer>

    <DetailDrawer
      :open="detailMilestone !== null"
      :title="detailMilestone?.name ?? '里程碑详情'"
      :subtitle="detailMilestoneDirection ? detailMilestoneDirection.name : ''"
      :width="450"
      @close="closeMilestoneDetail"
    >
      <div v-if="detailMilestone" class="milestone-detail">
        <div class="detail-badge-row">
          <span class="badge">{{ milestoneStatusLabels[detailMilestone.status] }}</span>
          <span class="badge badge-accent">{{ importanceLabels[detailMilestone.importance] }}</span>
          <span v-if="detailMilestone.archivedAt" class="badge badge-amber">已归档</span>
        </div>

        <p class="detail-description">
          {{ detailMilestone.description || '还没有补充里程碑说明。' }}
        </p>

        <div class="milestone-detail-grid">
          <div>
            <span>计划开始</span>
            <strong>{{ formatDate(detailMilestone.startDate) }}</strong>
          </div>
          <div>
            <span>计划完成</span>
            <strong>{{ formatDate(detailMilestone.dueDate) }}</strong>
          </div>
          <div>
            <span>距离完成</span>
            <strong>{{ relativeDay(detailMilestone.dueDate) }}</strong>
          </div>
          <div>
            <span>所属方向</span>
            <strong>{{ detailMilestoneDirection?.name ?? '未知方向' }}</strong>
          </div>
        </div>

        <div
          v-if="!detailMilestone.archivedAt && (detailMilestone.startDate || detailMilestone.dueDate)"
          class="milestone-date-editor"
        >
          <span class="detail-block-label">快速调整日期</span>
          <div class="date-shift-group">
            <button class="date-shift-btn" @click="shiftMilestoneDate(detailMilestone, -1)">
              提前 1 天
            </button>
            <button class="date-shift-btn" @click="shiftMilestoneDate(detailMilestone, 1)">
              延后 1 天
            </button>
          </div>
          <span class="date-shift-hint">与时间线拖拽等效，便于键盘和触屏操作。</span>
        </div>

        <div v-if="detailDirectionSummary" class="detail-direction-progress">
          <div class="detail-progress-head">
            <span>
              <span class="column-dot" :style="{ background: detailDirectionSummary.direction.color }" />
              {{ detailDirectionSummary.direction.name }}能力完整度
            </span>
            <strong>{{ detailDirectionSummary.percent }}%</strong>
          </div>
          <div class="direction-progress-track" aria-hidden="true">
            <span
              class="direction-progress-fill"
              :style="{
                width: `${detailDirectionSummary.percent}%`,
                background: detailDirectionSummary.direction.color,
              }"
            />
          </div>
          <div class="direction-progress-meta">
            <span>
              {{ detailDirectionSummary.completed }} / {{ detailDirectionSummary.total }} 项能力达标
            </span>
            <span>
              {{ detailDirectionSummary.currentPoints }} / {{ detailDirectionSummary.requiredPoints }} 等级分
            </span>
          </div>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">验收条件</span>
          <p>{{ detailMilestone.successCriteria || '还没有设置验收条件。' }}</p>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">
            相关能力（{{ detailMilestoneCompetencies.length }}）
          </span>
          <div v-if="detailMilestoneCompetencies.length === 0" class="detail-empty">
            这个方向还没有关联能力，可先到能力地图补充。
          </div>
          <div v-else class="milestone-competency-list">
            <div
              v-for="item in detailMilestoneCompetencies"
              :key="item.competency.id"
              class="milestone-competency"
            >
              <span class="milestone-competency-name">{{ item.competency.name }}</span>
              <span class="level-pill">
                当前 {{ item.competency.currentLevel }} / 要求 {{ item.assignment.requiredLevel }}
              </span>
            </div>
          </div>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">关联目标（{{ detailMilestoneGoals.length }}）</span>
          <div v-if="detailMilestoneGoals.length === 0" class="detail-empty">
            还没有目标链接到这个里程碑。
          </div>
          <div v-else class="milestone-goal-list">
            <div v-for="goal in detailMilestoneGoals" :key="goal.id" class="milestone-goal">
              <AppIcon name="target" :size="12" />
              {{ goal.title }}
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <button
          v-if="detailMilestone && !detailMilestone.archivedAt"
          class="btn btn-sm btn-secondary"
          @click="editMilestoneFromDetail"
        >
          编辑里程碑
        </button>
        <button class="btn btn-sm btn-primary" @click="archiveMilestoneFromDetail">
          {{ detailMilestone?.archivedAt ? '恢复里程碑' : '归档里程碑' }}
        </button>
      </template>
    </DetailDrawer>

    <ModalDialog
      :open="modalKind === 'competency'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitCompetency">
        <div class="field">
          <label class="field-label" for="competency-name">能力名称</label>
          <input
            id="competency-name"
            v-model="competencyForm.name"
            class="input"
            placeholder="例如：SAT 与局部搜索 / C++ 工程能力"
          />
        </div>

        <div class="field">
          <label class="field-label" for="competency-desc">能力说明</label>
          <textarea
            id="competency-desc"
            v-model="competencyForm.description"
            class="textarea"
            placeholder="这个能力具体指什么？能做什么？"
          />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="competency-category">能力类别</label>
            <select id="competency-category" v-model="competencyForm.category" class="select">
              <option v-for="category in categories" :key="category" :value="category">
                {{ competencyCategoryLabels[category] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-status">状态</label>
            <select id="competency-status" v-model="competencyForm.status" class="select">
              <option v-for="status in competencyStatuses" :key="status" :value="status">
                {{ competencyStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="competency-parent">父能力</label>
          <select id="competency-parent" v-model="competencyForm.parentId" class="select">
            <option value="">无（作为根能力）</option>
            <option
              v-for="option in parentOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ option.name }}
            </option>
          </select>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="competency-current">当前等级</label>
            <select id="competency-current" v-model="competencyForm.currentLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">
                {{ competencyLevelLabels[level] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-target">目标等级</label>
            <select id="competency-target" v-model="competencyForm.targetLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">
                {{ competencyLevelLabels[level] }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="competency-criteria">评价标准</label>
          <textarea
            id="competency-criteria"
            v-model="competencyForm.assessmentCriteria"
            class="textarea"
            placeholder="达到目标等级时，应该能做出什么？需要哪些成果证据？"
          />
          <span class="field-hint">等级不能仅按学习时长或任务完成率自动提升，要有标准和证据。</span>
        </div>

        <div class="field">
          <span class="field-label">关联发展方向</span>
          <div v-if="activeDirections.length === 0" class="relation-empty">
            还没有发展方向，请先在“未来自我”中创建。
          </div>
          <div v-else class="relation-list">
            <div
              v-for="direction in activeDirections"
              :key="direction.id"
              class="relation-row"
              :class="{ selected: competencyForm.selectedDirectionIds.includes(direction.id) }"
            >
              <label class="relation-check">
                <input
                  type="checkbox"
                  :checked="competencyForm.selectedDirectionIds.includes(direction.id)"
                  @change="toggleDirection(direction.id, $event)"
                />
                <span class="relation-dot" :style="{ background: direction.color }" />
                <span class="relation-name">{{ direction.name }}</span>
              </label>
              <template v-if="competencyForm.selectedDirectionIds.includes(direction.id)">
                <select
                  v-model="competencyForm.requiredLevels[direction.id]"
                  class="select relation-select"
                  aria-label="要求等级"
                >
                  <option v-for="level in levels" :key="level" :value="level">
                    {{ level }}
                  </option>
                </select>
                <select
                  v-model="competencyForm.priorities[direction.id]"
                  class="select relation-select"
                  aria-label="关联优先级"
                >
                  <option
                    v-for="priority in relationPriorities"
                    :key="priority"
                    :value="priority"
                  >
                    {{ priorityLabels[priority] }}
                  </option>
                </select>
              </template>
            </div>
          </div>
          <span class="field-hint">同一能力被多个方向引用时只维护一份能力记录。</span>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加能力' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'milestone'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitMilestone">
        <div class="field">
          <label class="field-label" for="milestone-name">里程碑名称</label>
          <input
            id="milestone-name"
            v-model="milestoneForm.name"
            class="input"
            placeholder="例如：独立完成 SAT 算法复现实验"
          />
        </div>

        <div class="field">
          <label class="field-label" for="milestone-desc">说明</label>
          <textarea
            id="milestone-desc"
            v-model="milestoneForm.description"
            class="textarea"
            placeholder="这个阶段要完成什么？"
          />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="milestone-direction">所属发展方向</label>
            <select id="milestone-direction" v-model="milestoneForm.directionId" class="select">
              <option value="" disabled>请选择方向</option>
              <option
                v-for="direction in milestoneDirectionOptions"
                :key="direction.id"
                :value="direction.id"
              >
                {{ direction.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="milestone-importance">重要性</label>
            <select id="milestone-importance" v-model="milestoneForm.importance" class="select">
              <option v-for="importance in importances" :key="importance" :value="importance">
                {{ importanceLabels[importance] }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="milestone-start">计划开始</label>
            <input id="milestone-start" v-model="milestoneForm.startDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="milestone-due">计划完成</label>
            <input id="milestone-due" v-model="milestoneForm.dueDate" class="input" type="date" />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="milestone-status">状态</label>
          <select id="milestone-status" v-model="milestoneForm.status" class="select">
            <option v-for="status in milestoneStatuses" :key="status" :value="status">
              {{ milestoneStatusLabels[status] }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="milestone-criteria">验收条件</label>
          <textarea
            id="milestone-criteria"
            v-model="milestoneForm.successCriteria"
            class="textarea"
            placeholder="达到什么标准才算完成？最好附上可验证的成果。"
          />
        </div>

        <p class="field-hint">
          里程碑可直接关联目标和任务；时间线负责时间范围与阶段成果，目标与任务负责具体推进。
        </p>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加里程碑' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div v-if="confirmTarget && !confirmTarget.archived" class="alert alert-warning confirm-note">
        <AppIcon name="warning" :size="15" />
        <span>归档不会级联删除子能力、关联方向、时间线或历史成果。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="confirmBusy" @click="runToggle">
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
  flex-wrap: wrap;
}

.roadmap-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.roadmap-stat {
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

.icon-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.icon-blue {
  background: var(--blue-soft);
  color: var(--blue);
}

.icon-violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.roadmap-stat > div {
  display: flex;
  flex-direction: column;
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

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.direction-filter {
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

.archive-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 9px;
}

.roadmap-loading {
  height: 360px;
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

.level-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 11px;
  margin-bottom: 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--muted);
}

.legend-code {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--accent);
}

.direction-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin-bottom: 13px;
}

.direction-progress-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.direction-progress-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.direction-progress-head .column-dot {
  margin-top: 0;
}

.direction-progress-head strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
}

.direction-progress-percent {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 650;
}

.direction-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 8.5px;
}

.direction-progress-track {
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--bg-deep);
}

.direction-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.25s ease;
}

.competency-tree {
  display: flex;
  flex-direction: column;
}

.map-foot {
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line-faint);
}

.milestone-board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.direction-column {
  padding: 17px 17px 15px;
}

.column-head {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-faint);
}

.column-dot {
  width: 8px;
  height: 8px;
  flex: none;
  margin-top: 6px;
  border-radius: 50%;
}

.column-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.column-name {
  font-size: 13px;
  font-weight: 600;
}

.column-meta {
  font-size: 10px;
  color: var(--muted);
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
  padding: 9px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.stage-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 8.5px;
}

.stage-list-head > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-soft);
  font-weight: 600;
}

.stage-card {
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface);
}

.stage-card-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 7px;
  align-items: center;
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 25px;
  height: 19px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 650;
}

.stage-name-btn {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.5;
  text-align: left;
}

.stage-name-btn:hover {
  color: var(--accent);
}

.stage-range {
  grid-column: 2;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.stage-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px solid var(--line-faint);
}

.stage-boundary-label {
  margin-left: 2px;
  color: var(--muted);
  font-size: 8px;
}

.stage-boundary-label:first-child {
  margin-left: 0;
}

.date-shift-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 23px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface);
  color: var(--muted);
  font-size: 8.5px;
  white-space: nowrap;
}

.date-shift-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-faint);
}

.stage-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  color: var(--accent);
  font-size: 9px;
  font-weight: 550;
  white-space: nowrap;
}

.stage-open-btn:hover {
  text-decoration: underline;
}

.stage-add-btn {
  align-self: flex-start;
  margin-top: 1px;
}

.milestone-date-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 2px 6px;
  color: var(--muted);
  font-size: 11.5px;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 550;
  white-space: nowrap;
}

.milestone-list {
  display: flex;
  flex-direction: column;
}

.milestone-card {
  padding: 13px 2px;
  border-bottom: 1px solid var(--line-faint);
}

.milestone-card:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.milestone-card.archived {
  opacity: 0.65;
}

.milestone-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.milestone-name {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
}

.milestone-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 5px;
  color: var(--muted);
  font-size: 10px;
}

.milestone-when {
  color: var(--amber);
}

.milestone-criteria {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 10.5px;
  line-height: 1.6;
}

.milestone-criteria .icon {
  flex: none;
  margin-top: 1px;
  color: var(--accent);
}

.milestone-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
  min-height: 26px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-left: auto;
}

.row-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.timeline-card {
  overflow: hidden;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scale-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.scale-btn {
  height: 25px;
  padding: 0 9px;
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 550;
}

.scale-btn.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-xs);
}

.timeline-today-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 9.5px;
}

.timeline-today-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.timeline-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.timeline-table {
  display: flex;
  flex-direction: column;
}

.timeline-row {
  display: flex;
  align-items: stretch;
}

.timeline-label {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 180px;
  flex: none;
  padding: 10px 12px 10px 0;
  color: var(--ink-soft);
  font-size: 11px;
  border-right: 1px solid var(--line-faint);
}

.timeline-head-row .timeline-label {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.lane-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
}

.lane-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-track {
  position: relative;
  flex: 1;
  border-bottom: 1px solid var(--line-faint);
}

.ticks-track {
  height: 34px;
  border-bottom: 1px solid var(--line);
}

.tick {
  position: absolute;
  top: 11px;
  padding-left: 5px;
  border-left: 1px solid var(--line);
  color: var(--ink-faint);
  font-size: 9px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.tick.major {
  border-left-color: var(--line-strong);
  color: var(--ink-soft);
}

.lane-track {
  height: 44px;
}

.lane-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--line);
}

.today-line {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: var(--danger);
  opacity: 0.55;
  z-index: 2;
}

.timeline-phase {
  position: absolute;
  top: 3px;
  bottom: 3px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 3px 5px;
  overflow: hidden;
  border: 1px dashed color-mix(in srgb, var(--phase-color) 32%, var(--line));
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--phase-color) 6%, transparent);
  color: color-mix(in srgb, var(--phase-color) 72%, var(--ink));
  font-family: var(--font-mono);
  font-size: 8px;
  text-align: left;
  z-index: 1;
}

.timeline-phase:hover {
  border-style: solid;
  background: color-mix(in srgb, var(--phase-color) 12%, transparent);
}

.timeline-phase > span:first-child {
  flex: none;
  font-weight: 650;
}

.timeline-phase-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-bar {
  position: absolute;
  top: 9px;
  height: 26px;
  display: flex;
  align-items: center;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--bar-color) 30%, transparent);
  border-left: 3px solid var(--bar-color);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--bar-color) 9%, var(--surface));
  color: var(--ink-soft);
  font-size: 9.5px;
  text-align: left;
  overflow: hidden;
  z-index: 3;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.timeline-bar:hover {
  background: color-mix(in srgb, var(--bar-color) 16%, var(--surface));
  border-color: var(--bar-color);
}

.bar-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line-faint);
}

.timeline-legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--muted);
}

.legend-today {
  width: 1px;
  height: 11px;
  background: var(--danger);
}

.legend-phase {
  width: 14px;
  height: 8px;
  border: 1px dashed var(--accent);
  border-radius: 2px;
  background: var(--accent-faint);
}

.legend-bar {
  width: 14px;
  height: 7px;
  border-left: 2px solid var(--accent);
  border-radius: 1px;
  background: var(--accent-soft);
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.relation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.relation-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.relation-row.selected {
  border-color: var(--line-strong);
  background: var(--accent-faint);
}

.relation-check {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.relation-check input {
  accent-color: var(--accent);
}

.relation-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
}

.relation-name {
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relation-select {
  width: auto;
  height: 28px;
  padding: 0 6px;
  font-size: 10.5px;
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-note {
  margin-top: 14px;
}

@media (max-width: 1100px) {
  .milestone-board {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .roadmap-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .direction-progress-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .timeline-label {
    width: 130px;
  }
}

@media (max-width: 620px) {
  .roadmap-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid,
  .form-grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-toolbar {
    align-items: flex-start;
  }

  .view-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .relation-row {
    flex-wrap: wrap;
  }

  .direction-filter {
    flex: 1;
  }

  .direction-progress-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .stage-actions {
    align-items: flex-start;
  }

  .stage-open-btn {
    width: 100%;
    margin-left: 0;
    padding-top: 2px;
  }

  .milestone-foot {
    align-items: flex-start;
    gap: 7px;
    flex-wrap: wrap;
  }

  .milestone-date-actions {
    flex-wrap: wrap;
  }

  .milestone-competency {
    align-items: flex-start;
    flex-direction: column;
  }
}
.milestone-name-btn {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.milestone-name-btn:hover {
  color: var(--accent);
}

.timeline-bar {
  touch-action: none;
  cursor: grab;
}

.timeline-bar.dragging {
  cursor: grabbing;
  z-index: 5;
  box-shadow: var(--shadow-md);
  opacity: 0.9;
}

.competency-detail,
.milestone-detail {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.detail-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.detail-description {
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.75;
  white-space: pre-line;
}

.detail-level-block {
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.detail-level-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 9.5px;
}

.detail-level-head strong {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
}

.detail-level-track {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-deep);
}

.detail-level-caption {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 5px;
  color: var(--muted);
  font-size: 8.5px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-block-label {
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.detail-block p {
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-line;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.detail-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--tag-color) 24%, var(--line));
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--tag-color) 9%, var(--surface));
  color: var(--ink-soft);
  font-size: 9px;
}

.tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tag-color);
}

.growth-block {
  padding-top: 12px;
  border-top: 1px solid var(--line-faint);
}

.growth-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
}

.growth-empty {
  padding: 13px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.65;
}

.growth-svg {
  width: 100%;
  height: auto;
  margin-top: 5px;
}

.growth-grid-line {
  stroke: var(--line);
  stroke-width: 0.7;
  stroke-dasharray: 3 3;
}

.growth-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.growth-dot {
  fill: var(--surface);
  stroke: var(--accent);
  stroke-width: 2;
}

.growth-axis {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.growth-history {
  display: flex;
  flex-direction: column;
  margin-top: 9px;
}

.growth-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--line-faint);
}

.growth-entry-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 20px;
  flex: none;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.growth-entry-title {
  display: block;
  font-size: 10px;
  font-weight: 600;
}

.growth-entry-meta {
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.milestone-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.milestone-detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.milestone-detail-grid span {
  color: var(--muted);
  font-size: 8.5px;
}

.milestone-detail-grid strong {
  color: var(--ink-soft);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.5;
}

.milestone-date-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.date-shift-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.date-shift-hint {
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.detail-direction-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 11px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.detail-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 550;
}

.detail-progress-head > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.detail-progress-head .column-dot {
  margin-top: 0;
}

.detail-progress-head strong {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
}

.milestone-competency-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.milestone-competency {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
}

.milestone-competency-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
  font-size: 9.5px;
}

.milestone-competency .level-pill {
  flex: none;
  font-size: 8px;
}

.detail-empty {
  padding: 9px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 9.5px;
}

.milestone-goal-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.milestone-goal {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 9.5px;
}

@media (max-width: 620px) {
  .milestone-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
