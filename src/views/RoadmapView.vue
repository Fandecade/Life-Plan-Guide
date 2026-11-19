<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import DetailDrawer from '@/components/DetailDrawer.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import RoadmapAbilityNode from '@/components/RoadmapAbilityNode.vue'
import { useToast } from '@/composables/useToast'
import {
  levelIndex,
  levelPercent,
  useRoadmap,
  type CompetencyInput,
  type CompetencyNode,
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
  type Milestone,
} from '@/domain'
import { formatDate, formatShortDate, fromDateInput, relativeDay, toDateInput } from '@/utils/date'

const { success, error: toastError } = useToast()
const route = useRoute()
const router = useRouter()

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
  directionCompetencyTree,
  selectedDirectionId,
  includeArchived,
  inProgressMilestones,
  coveredDirectionCount,
  milestonesOfDirection,
  linkedGoalsForMilestone,
  growthHistoryFor,
  refresh,
  saveCompetency,
  saveMilestone,
  moveMilestone,
  setArchived,
  descendantsOf,
} = useRoadmap()

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
const milestoneStatusFilter = ref<'ALL' | MilestoneStatus>('ALL')
const importanceFilter = ref<'ALL' | Importance>('ALL')
const timelineDirectionId = ref('all')
const timelineCompetencyId = ref('all')
const timelineStatusFilter = ref<'ALL' | MilestoneStatus>('ALL')
const expandedDirectionIds = reactive<Record<string, boolean>>({})
const focusedCompetencyId = ref<string | null>(null)
const timelineColumns = ref(3)

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

function flattenNodes(nodes: CompetencyNode[]): CompetencyNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)])
}

const milestonesByCompetency = computed<Record<string, Milestone[]>>(() => {
  const result: Record<string, Milestone[]> = {}
  for (const milestone of filteredMilestones.value) {
    if (!milestone.competencyId) continue
    const key = `${milestone.directionId}:${milestone.competencyId}`
    if (!result[key]) result[key] = []
    result[key].push(milestone)
  }
  for (const rows of Object.values(result)) {
    rows.sort((left, right) => {
      const leftDate = left.dueDate ?? left.startDate ?? '9999-12-31'
      const rightDate = right.dueDate ?? right.startDate ?? '9999-12-31'
      return leftDate.localeCompare(rightDate) || left.name.localeCompare(right.name, 'zh-CN')
    })
  }
  return result
})

function requiredLevelsForDirection(directionId: string): Record<string, CompetencyLevel> {
  const result: Record<string, CompetencyLevel> = {}
  for (const relation of relations.value) {
    if (!relation.archivedAt && relation.directionId === directionId) {
      result[relation.competencyId] = relation.requiredLevel
    }
  }
  return result
}

function unlinkedMilestones(directionId: string): Milestone[] {
  return filteredMilestones.value.filter(
    (milestone) => milestone.directionId === directionId && !milestone.competencyId,
  )
}

interface DirectionSummary {
  direction: Direction
  competencyCount: number
  milestoneCount: number
  completedCount: number
  unlinkedCount: number
  nextMilestone: Milestone | null
  percent: number
  completedCompetencies: number
}

const directionSummaries = computed<DirectionSummary[]>(() => {
  const competencyById = new Map(
    visibleCompetencies.value.map((competency) => [competency.id, competency]),
  )

  return filteredDirections.value.map((direction) => {
    const tree = directionCompetencyTree(direction.id)
    const allNodes = flattenNodes(tree)
    const directionMilestones = milestonesOfDirection(direction.id).filter(milestoneMatchesFilters)
    const relationRows = relations.value.filter(
      (relation) => !relation.archivedAt && relation.directionId === direction.id,
    )
    let currentPoints = 0
    let requiredPoints = 0
    let completedCompetencies = 0

    for (const relation of relationRows) {
      const competency = competencyById.get(relation.competencyId)
      if (!competency) continue
      const required = levelIndex(relation.requiredLevel)
      const current = levelIndex(competency.currentLevel)
      currentPoints += Math.min(current, required)
      requiredPoints += required
      if (current >= required) completedCompetencies += 1
    }

    const upcoming = directionMilestones.find(
      (milestone) =>
        milestone.status !== MilestoneStatus.COMPLETED &&
        milestone.status !== MilestoneStatus.CANCELLED,
    )

    return {
      direction,
      competencyCount: allNodes.length,
      milestoneCount: directionMilestones.length,
      completedCount: directionMilestones.filter(
        (milestone) => milestone.status === MilestoneStatus.COMPLETED,
      ).length,
      unlinkedCount: directionMilestones.filter((milestone) => !milestone.competencyId).length,
      nextMilestone: upcoming ?? directionMilestones.at(-1) ?? null,
      percent: requiredPoints > 0 ? Math.round((currentPoints / requiredPoints) * 100) : 0,
      completedCompetencies,
    }
  })
})

const directionSummaryMap = computed<Record<string, DirectionSummary>>(() => {
  const map: Record<string, DirectionSummary> = {}
  for (const summary of directionSummaries.value) map[summary.direction.id] = summary
  return map
})

function toggleDirection(directionId: string): void {
  expandedDirectionIds[directionId] = !expandedDirectionIds[directionId]
}

function openDirection(directionId: string): void {
  expandedDirectionIds[directionId] = true
}

function directionNodeCount(directionId: string): number {
  return flattenNodes(directionCompetencyTree(directionId)).length
}

const timelineCompetencyOptions = computed(() => {
  const allowedDirectionIds =
    timelineDirectionId.value === 'all'
      ? new Set(activeDirections.value.map((direction) => direction.id))
      : new Set([timelineDirectionId.value])

  return visibleCompetencies.value
    .filter((competency) =>
      (assignmentsByCompetency.value[competency.id] ?? []).some((relation) =>
        allowedDirectionIds.has(relation.directionId),
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})

interface TimelineItem {
  milestone: Milestone
  direction: Direction | undefined
  competency: Competency | undefined
  date: string
  order: number
}

const timelineItems = computed<TimelineItem[]>(() => {
  const rows = visibleMilestones.value
    .filter((milestone) => {
      if (timelineStatusFilter.value !== 'ALL' && milestone.status !== timelineStatusFilter.value) {
        return false
      }
      if (
        timelineDirectionId.value !== 'all' &&
        milestone.directionId !== timelineDirectionId.value
      ) {
        return false
      }
      if (
        timelineCompetencyId.value !== 'all' &&
        milestone.competencyId !== timelineCompetencyId.value
      ) {
        return false
      }
      return Boolean(milestone.dueDate ?? milestone.startDate)
    })
    .slice()
    .sort((left, right) => {
      const leftDate = left.dueDate ?? left.startDate ?? '9999-12-31'
      const rightDate = right.dueDate ?? right.startDate ?? '9999-12-31'
      return leftDate.localeCompare(rightDate) || left.name.localeCompare(right.name, 'zh-CN')
    })

  return rows.map((milestone, index) => ({
    milestone,
    direction: directionMap.value[milestone.directionId],
    competency: milestone.competencyId
      ? competencies.value.find((item) => item.id === milestone.competencyId)
      : undefined,
    date: milestone.dueDate ?? milestone.startDate ?? '',
    order: index + 1,
  }))
})

interface TimelineSnakeRow {
  items: TimelineItem[]
  index: number
}

const sTimelineRows = computed<TimelineSnakeRow[]>(() => {
  const size = Math.max(1, timelineColumns.value)
  const rows: TimelineSnakeRow[] = []
  for (let index = 0; index < timelineItems.value.length; index += size) {
    const items = timelineItems.value.slice(index, index + size)
    if (rows.length % 2 === 1) items.reverse()
    rows.push({ items, index: rows.length })
  }
  return rows
})

const timelineScopeLabel = computed(() => {
  if (timelineCompetencyId.value !== 'all') {
    return competencies.value.find((item) => item.id === timelineCompetencyId.value)?.name ?? '指定能力'
  }
  if (timelineDirectionId.value !== 'all') {
    return directionMap.value[timelineDirectionId.value]?.name ?? '指定方向'
  }
  return '全部发展方向'
})

const undatedMilestoneCount = computed(
  () =>
    visibleMilestones.value.filter(
      (milestone) =>
        !milestone.dueDate &&
        !milestone.startDate &&
        (timelineDirectionId.value === 'all' ||
          milestone.directionId === timelineDirectionId.value) &&
        (timelineCompetencyId.value === 'all' ||
          milestone.competencyId === timelineCompetencyId.value),
    ).length,
)

watch(timelineDirectionId, () => {
  if (
    timelineCompetencyId.value !== 'all' &&
    !timelineCompetencyOptions.value.some((competency) => competency.id === timelineCompetencyId.value)
  ) {
    timelineCompetencyId.value = 'all'
  }
})

function syncTimelineColumns(): void {
  timelineColumns.value = window.innerWidth <= 760 ? 1 : window.innerWidth <= 1120 ? 2 : 3
}

const detailCompetencyId = ref<string | null>(null)
const detailMilestoneId = ref<string | null>(null)

const detailCompetency = computed(
  () => competencies.value.find((competency) => competency.id === detailCompetencyId.value) ?? null,
)

const detailAssignments = computed(() =>
  detailCompetency.value ? assignmentsByCompetency.value[detailCompetency.value.id] ?? [] : [],
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

const detailMilestoneDirection = computed(() =>
  detailMilestone.value ? directionMap.value[detailMilestone.value.directionId] : undefined,
)

const detailMilestoneCompetency = computed(() =>
  detailMilestone.value?.competencyId
    ? competencies.value.find((competency) => competency.id === detailMilestone.value?.competencyId) ??
      null
    : null,
)

const detailDirectionSummary = computed(() =>
  detailMilestone.value
    ? directionSummaryMap.value[detailMilestone.value.directionId] ?? null
    : null,
)

const detailMilestoneGoals = computed(() =>
  detailMilestone.value ? linkedGoalsForMilestone(detailMilestone.value.id) : [],
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
  if (competency) askToggle('competency', competency.id, competency.name, competency.archivedAt)
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
  if (milestone) askToggle('milestone', milestone.id, milestone.name, milestone.archivedAt)
}

async function shiftMilestoneDate(milestone: Milestone, deltaDays: number): Promise<void> {
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
  competencyId: string
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
    competencyId: '',
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
    return '能力可以属于多个发展方向；能力树负责组织，里程碑负责标记它的阶段成果。'
  }
  if (modalKind.value === 'milestone') {
    return '里程碑归属于一个方向，并可进一步关联该方向下的一个具体能力。'
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
    .filter((competency) => !competency.archivedAt && !blockedParentIds.value.has(competency.id))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
)

const milestoneDirectionOptions = computed(() =>
  directions.value.filter((direction) => !direction.archivedAt),
)

const milestoneCompetencyOptions = computed(() => {
  if (!milestoneForm.directionId) return []
  return visibleCompetencies.value
    .filter((competency) =>
      (assignmentsByCompetency.value[competency.id] ?? []).some(
        (relation) => relation.directionId === milestoneForm.directionId,
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})

watch(
  () => milestoneForm.directionId,
  () => {
    if (
      milestoneForm.competencyId &&
      !milestoneCompetencyOptions.value.some(
        (competency) => competency.id === milestoneForm.competencyId,
      )
    ) {
      milestoneForm.competencyId = ''
    }
  },
)

function toggleDirectionAssignment(directionId: string, event: Event): void {
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

function openCompetencyCreate(parent?: Competency, directionId?: string): void {
  editingId.value = null
  Object.assign(competencyForm, emptyCompetencyForm())
  if (parent) competencyForm.parentId = parent.id
  const preferredDirectionId =
    directionId ?? (selectedDirectionId.value !== 'all' ? selectedDirectionId.value : '')
  if (preferredDirectionId) {
    competencyForm.selectedDirectionIds = [preferredDirectionId]
    competencyForm.requiredLevels[preferredDirectionId] = competencyForm.targetLevel
    competencyForm.priorities[preferredDirectionId] = Priority.MEDIUM
  }
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

function openMilestoneCreate(directionId?: string, competencyId?: string): void {
  editingId.value = null
  Object.assign(milestoneForm, emptyMilestoneForm())
  milestoneForm.directionId =
    directionId ??
    (selectedDirectionId.value !== 'all'
      ? selectedDirectionId.value
      : activeDirections.value[0]?.id ?? '')
  if (competencyId) milestoneForm.competencyId = competencyId
  formError.value = ''
  modalKind.value = 'milestone'
}

function openMilestoneEdit(milestone: Milestone): void {
  editingId.value = milestone.id
  Object.assign(milestoneForm, {
    name: milestone.name,
    description: milestone.description,
    directionId: milestone.directionId,
    competencyId: milestone.competencyId ?? '',
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
      competencyId: milestoneForm.competencyId || null,
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

const confirmTitle = computed(() => (confirmTarget.value?.archived ? '恢复内容' : '归档内容'))

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

onMounted(async () => {
  syncTimelineColumns()
  window.addEventListener('resize', syncTimelineColumns)
  await refresh()

  let handledDeepLink = false
  const directionParam = String(route.query.direction ?? '')
  if (directionParam) {
    handledDeepLink = true
    const direction = activeDirections.value.find((item) => item.id === directionParam)
    if (direction) {
      selectedDirectionId.value = direction.id
      openDirection(direction.id)
    } else {
      toastError('这个发展方向不存在或已经归档')
    }
  }

  const competencyParam = String(route.query.competency ?? '')
  if (competencyParam) {
    handledDeepLink = true
    const competency = competencies.value.find((item) => item.id === competencyParam)
    const relation = relations.value.find(
      (item) => !item.archivedAt && item.competencyId === competencyParam,
    )
    if (competency && relation) {
      selectedDirectionId.value = relation.directionId
      timelineDirectionId.value = relation.directionId
      timelineCompetencyId.value = competency.id
      focusedCompetencyId.value = competency.id
      openDirection(relation.directionId)
    } else {
      toastError('这个能力不存在或没有关联发展方向')
    }
  }

  const milestoneParam = String(route.query.milestone ?? '')
  if (milestoneParam) {
    handledDeepLink = true
    const milestone = milestones.value.find((item) => item.id === milestoneParam)
    if (milestone) {
      selectedDirectionId.value = milestone.directionId
      openDirection(milestone.directionId)
      if (milestone.competencyId) focusedCompetencyId.value = milestone.competencyId
      openMilestoneDetail(milestone)
    } else {
      toastError('这个里程碑不存在或已经归档')
    }
  }

  if (handledDeepLink) await router.replace('/roadmap')
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncTimelineColumns)
})
</script>

<template>
  <div class="page roadmap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">方向与路线 · 长期路线</p>
        <h2 class="page-title">发展路线图</h2>
        <p class="page-subtitle">
          从一个发展方向开始，逐层展开能力、里程碑和时间节点；底部总时间线负责回看整体节奏。
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
        <div><span class="stat-number">{{ visibleCompetencies.length }}</span><span class="stat-caption">能力节点</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-amber"><AppIcon name="flag" :size="16" /></span>
        <div><span class="stat-number">{{ visibleMilestones.length }}</span><span class="stat-caption">里程碑</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-blue"><AppIcon name="play" :size="16" /></span>
        <div><span class="stat-number">{{ inProgressMilestones }}</span><span class="stat-caption">进行中</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-violet"><AppIcon name="map" :size="16" /></span>
        <div><span class="stat-number">{{ coveredDirectionCount }}</span><span class="stat-caption">覆盖方向</span></div>
      </div>
    </section>

    <section class="card view-toolbar roadmap-toolbar">
      <div class="toolbar-leading">
        <span class="toolbar-label">路线筛选</span>
        <span class="toolbar-help">默认只展开方向摘要</span>
      </div>
      <div class="toolbar-actions">
        <select v-model="selectedDirectionId" class="select direction-filter" aria-label="按方向筛选">
          <option value="all">全部方向</option>
          <option v-for="direction in activeDirections" :key="direction.id" :value="direction.id">
            {{ direction.name }}
          </option>
        </select>
        <select v-model="milestoneStatusFilter" class="select direction-filter" aria-label="按里程碑状态筛选">
          <option value="ALL">全部状态</option>
          <option v-for="status in milestoneStatuses" :key="status" :value="status">
            {{ milestoneStatusLabels[status] }}
          </option>
        </select>
        <select v-model="importanceFilter" class="select direction-filter" aria-label="按重要程度筛选">
          <option value="ALL">全部重要度</option>
          <option v-for="importance in importances" :key="importance" :value="importance">
            {{ importanceLabels[importance] }}
          </option>
        </select>
        <button
          class="btn btn-ghost"
          :class="{ 'is-on': includeArchived }"
          :aria-pressed="includeArchived"
          @click="includeArchived = !includeArchived"
        >
          <AppIcon name="archive" :size="14" />
          {{ includeArchived ? '隐藏归档' : '显示归档' }}
          <span v-if="archivedCount" class="archive-count">{{ archivedCount }}</span>
        </button>
      </div>
    </section>

    <div v-if="loading" class="skeleton roadmap-loading" />

    <template v-else>
      <section class="directions-section">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="map" :size="17" />
            发展方向
            <span class="count-pill">{{ filteredDirections.length }}</span>
          </h3>
          <span class="section-note">点击方向卡片展开能力树</span>
        </div>

        <EmptyState
          v-if="activeDirections.length === 0"
          title="还没有发展方向"
          description="先在“未来自我”中建立一个方向，再用能力树和里程碑规划它。"
        >
          <RouterLink to="/future-self" class="btn btn-sm btn-secondary">去创建发展方向</RouterLink>
        </EmptyState>

        <div v-else class="direction-card-list">
          <article
            v-for="summary in directionSummaries"
            :key="summary.direction.id"
            class="card direction-card"
            :data-direction-id="summary.direction.id"
          >
            <header class="direction-card-head">
              <button
                class="direction-summary"
                :aria-expanded="Boolean(expandedDirectionIds[summary.direction.id])"
                @click="toggleDirection(summary.direction.id)"
              >
                <span class="direction-swatch" :style="{ background: summary.direction.color }" />
                <span class="direction-copy">
                  <span class="direction-kicker">
                    优先级 {{ summary.direction.priority }} · 目标 {{ formatShortDate(summary.direction.targetDate) }}
                  </span>
                  <strong>{{ summary.direction.name }}</strong>
                  <span class="direction-description">
                    {{ summary.direction.description || '尚未补充方向说明' }}
                  </span>
                </span>

                <span class="direction-metrics">
                  <span><b>{{ summary.competencyCount }}</b> 项能力</span>
                  <span><b>{{ summary.milestoneCount }}</b> 个里程碑</span>
                  <span v-if="summary.nextMilestone" class="next-node">
                    下一节点 {{ formatShortDate(summary.nextMilestone.dueDate ?? summary.nextMilestone.startDate) }}
                  </span>
                  <span v-else class="next-node muted">还没有时间节点</span>
                </span>

                <span class="direction-progress-box">
                  <span class="direction-progress-label">
                    能力完整度 <b>{{ summary.percent }}%</b>
                  </span>
                  <span class="direction-progress-track" aria-hidden="true">
                    <span
                      class="direction-progress-fill"
                      :style="{ width: `${summary.percent}%`, background: summary.direction.color }"
                    />
                  </span>
                </span>

                <span class="direction-expand">
                  <AppIcon
                    name="arrow-right"
                    :size="15"
                    :class="{ rotated: expandedDirectionIds[summary.direction.id] }"
                  />
                  {{ expandedDirectionIds[summary.direction.id] ? '收起' : '展开能力树' }}
                </span>
              </button>

              <div class="direction-actions">
                <button
                  class="icon-btn"
                  title="在此方向添加根能力"
                  aria-label="在此方向添加根能力"
                  @click="openCompetencyCreate(undefined, summary.direction.id)"
                >
                  <AppIcon name="plus" :size="15" />
                </button>
                <button
                  class="icon-btn"
                  title="在此方向添加里程碑"
                  aria-label="在此方向添加里程碑"
                  @click="openMilestoneCreate(summary.direction.id)"
                >
                  <AppIcon name="flag" :size="15" />
                </button>
              </div>
            </header>

            <div v-if="expandedDirectionIds[summary.direction.id]" class="direction-body">
              <div class="ability-tree-head">
                <div>
                  <strong>能力树</strong>
                  <span>能力 → 子能力 → 里程碑与时间节点</span>
                </div>
                <span class="ability-tree-count">
                  {{ directionNodeCount(summary.direction.id) }} 个能力节点
                </span>
              </div>

              <EmptyState
                v-if="directionCompetencyTree(summary.direction.id).length === 0"
                title="这个方向还没有能力"
                description="先添加一个根能力，再继续拆出子能力，并为能力设置里程碑。"
              >
                <button class="btn btn-sm btn-secondary" @click="openCompetencyCreate(undefined, summary.direction.id)">
                  添加根能力
                </button>
              </EmptyState>

              <ul v-else class="direction-ability-tree">
                <RoadmapAbilityNode
                  v-for="node in directionCompetencyTree(summary.direction.id)"
                  :key="node.competency.id"
                  :node="node"
                  :direction-id="summary.direction.id"
                  :direction-color="summary.direction.color"
                  :required-levels="requiredLevelsForDirection(summary.direction.id)"
                  :milestones-by-competency="milestonesByCompetency"
                  :focused-competency-id="focusedCompetencyId"
                  @open-competency="openCompetencyDetail"
                  @add-child="(competency) => openCompetencyCreate(competency, summary.direction.id)"
                  @edit-competency="openCompetencyEdit"
                  @toggle-archive="
                    (competency) => askToggle('competency', competency.id, competency.name, competency.archivedAt)
                  "
                  @add-milestone="(competency) => openMilestoneCreate(summary.direction.id, competency.id)"
                  @open-milestone="openMilestoneDetail"
                />
              </ul>

              <section v-if="unlinkedMilestones(summary.direction.id).length" class="unlinked-milestones">
                <div class="unlinked-head">
                  <span><AppIcon name="flag" :size="14" /> 方向级里程碑</span>
                  <span>尚未关联到具体能力</span>
                </div>
                <button
                  v-for="milestone in unlinkedMilestones(summary.direction.id)"
                  :key="milestone.id"
                  class="unlinked-milestone"
                  @click="openMilestoneDetail(milestone)"
                >
                  <span class="unlinked-date">{{ formatShortDate(milestone.dueDate ?? milestone.startDate) }}</span>
                  <span class="unlinked-name">{{ milestone.name }}</span>
                  <span class="badge">{{ milestoneStatusLabels[milestone.status] }}</span>
                  <AppIcon name="arrow-right" :size="13" />
                </button>
              </section>

              <div class="direction-body-actions">
                <button class="btn btn-sm btn-ghost" @click="openCompetencyCreate(undefined, summary.direction.id)">
                  <AppIcon name="plus" :size="14" /> 添加根能力
                </button>
                <button class="btn btn-sm btn-ghost" @click="openMilestoneCreate(summary.direction.id)">
                  <AppIcon name="flag" :size="14" /> 添加方向级里程碑
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="card s-timeline-card" aria-labelledby="s-timeline-title">
        <div class="s-timeline-head">
          <div>
            <p class="timeline-eyebrow">全局回看</p>
            <h3 id="s-timeline-title" class="timeline-title">
              <AppIcon name="calendar" :size="17" />
              S 型总时间线
            </h3>
            <p class="timeline-subtitle">
              当前范围：{{ timelineScopeLabel }} · {{ timelineItems.length }} 个时间节点
            </p>
          </div>
          <div class="s-timeline-controls">
            <select v-model="timelineDirectionId" class="select direction-filter" aria-label="时间线方向范围">
              <option value="all">全部方向</option>
              <option v-for="direction in activeDirections" :key="direction.id" :value="direction.id">
                {{ direction.name }}
              </option>
            </select>
            <select v-model="timelineCompetencyId" class="select direction-filter" aria-label="时间线能力范围">
              <option value="all">全部能力</option>
              <option v-for="competency in timelineCompetencyOptions" :key="competency.id" :value="competency.id">
                {{ competency.name }}
              </option>
            </select>
            <select v-model="timelineStatusFilter" class="select direction-filter" aria-label="时间线状态范围">
              <option value="ALL">全部状态</option>
              <option v-for="status in milestoneStatuses" :key="status" :value="status">
                {{ milestoneStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <EmptyState
          v-if="timelineItems.length === 0"
          title="当前范围还没有时间节点"
          description="为里程碑补充开始或截止日期，或者切换筛选范围。"
        >
          <button class="btn btn-sm btn-secondary" @click="openMilestoneCreate()">添加里程碑</button>
        </EmptyState>

        <div v-else class="s-timeline-board" data-timeline-mode="snake">
          <div
            v-for="(row, rowIndex) in sTimelineRows"
            :key="row.index"
            class="s-timeline-row"
            :class="{ reverse: row.index % 2 === 1 }"
            :data-row-index="rowIndex"
          >
            <button
              v-for="item in row.items"
              :key="item.milestone.id"
              class="s-timeline-node"
              :class="`status-${item.milestone.status.toLowerCase()}`"
              :style="{ '--node-color': item.direction?.color ?? '#3563e9' }"
              :data-milestone-id="item.milestone.id"
              @click="openMilestoneDetail(item.milestone)"
            >
              <span class="s-node-order">{{ item.order }}</span>
              <span class="s-node-date">{{ formatShortDate(item.date) }}</span>
              <strong>{{ item.milestone.name }}</strong>
              <span class="s-node-context">
                <span>{{ item.direction?.name ?? '未知方向' }}</span>
                <span>{{ item.competency?.name ?? '方向级里程碑' }}</span>
              </span>
              <span class="s-node-foot">
                <span class="badge">{{ milestoneStatusLabels[item.milestone.status] }}</span>
                <span>{{ relativeDay(item.milestone.dueDate) }}</span>
              </span>
            </button>
          </div>

          <template v-for="(row, rowIndex) in sTimelineRows.slice(0, -1)" :key="`connector-${row.index}`">
            <div
              class="s-timeline-connector"
              :class="rowIndex % 2 === 0 ? 'at-right' : 'at-left'"
              aria-hidden="true"
            >
              <span />
            </div>
          </template>
        </div>

        <div class="s-timeline-foot">
          <span><span class="legend-node" /> 点击节点查看里程碑详情</span>
          <span v-if="undatedMilestoneCount">{{ undatedMilestoneCount }} 个里程碑尚未排期，未进入时间线</span>
          <span>按计划完成日排序；同一天按名称排序</span>
        </div>
      </section>
    </template>

    <DetailDrawer
      :open="detailCompetency !== null"
      :title="detailCompetency?.name ?? '能力详情'"
      :subtitle="detailCompetency ? competencyCategoryLabels[detailCompetency.category] : ''"
      :width="480"
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
            <span class="level-fill" :style="{ width: `${levelPercent(detailCompetency.currentLevel)}%` }" />
            <span class="level-target" :style="{ left: `${levelPercent(detailCompetency.targetLevel)}%` }" />
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
            <h4 class="growth-title"><AppIcon name="spark" :size="14" /> 成长曲线</h4>
            <span class="section-note">来自成果评价</span>
          </div>

          <div v-if="detailGrowth.length < 2" class="growth-empty">
            数据积累中：至少需要两次带等级的成果评价，才能形成可解释的趋势。
          </div>
          <template v-else>
            <svg class="growth-svg" viewBox="0 0 300 90" role="img" aria-label="能力等级变化">
              <line v-for="y in [22, 48, 74]" :key="y" x1="18" :y1="y" x2="282" :y2="y" class="growth-grid-line" />
              <polyline :points="growthPoints" class="growth-line" />
              <circle v-for="dot in growthDots" :key="dot.id" :cx="dot.x" :cy="dot.y" r="3.5" class="growth-dot" />
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
                <span class="growth-entry-meta">{{ formatShortDate(item.date) }} · {{ item.note || '未填写评价说明' }}</span>
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
      :width="500"
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
          <div><span>计划开始</span><strong>{{ formatDate(detailMilestone.startDate) }}</strong></div>
          <div><span>计划完成</span><strong>{{ formatDate(detailMilestone.dueDate) }}</strong></div>
          <div><span>距离完成</span><strong>{{ relativeDay(detailMilestone.dueDate) }}</strong></div>
          <div><span>所属方向</span><strong>{{ detailMilestoneDirection?.name ?? '未知方向' }}</strong></div>
        </div>

        <div
          v-if="!detailMilestone.archivedAt && (detailMilestone.startDate || detailMilestone.dueDate)"
          class="milestone-date-editor"
        >
          <span class="detail-block-label">快速调整日期</span>
          <div class="date-shift-group">
            <button class="date-shift-btn" @click="shiftMilestoneDate(detailMilestone, -1)">提前 1 天</button>
            <button class="date-shift-btn" @click="shiftMilestoneDate(detailMilestone, 1)">延后 1 天</button>
          </div>
          <span class="date-shift-hint">调整后会同步更新能力树和 S 型总时间线。</span>
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
              :style="{ width: `${detailDirectionSummary.percent}%`, background: detailDirectionSummary.direction.color }"
            />
          </div>
          <div class="direction-progress-meta">
            <span>{{ detailDirectionSummary.completedCompetencies }} / {{ detailDirectionSummary.competencyCount }} 项能力达标</span>
            <span>{{ detailDirectionSummary.completedCount }} / {{ detailDirectionSummary.milestoneCount }} 个里程碑完成</span>
          </div>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">验收条件</span>
          <p>{{ detailMilestone.successCriteria || '还没有设置验收条件。' }}</p>
        </div>

        <div class="detail-block">
          <span class="detail-block-label">关联能力</span>
          <div v-if="detailMilestoneCompetency" class="linked-competency-card">
            <span class="tag-dot" :style="{ background: detailMilestoneDirection?.color ?? '#3563e9' }" />
            <div>
              <strong>{{ detailMilestoneCompetency.name }}</strong>
              <span>{{ competencyCategoryLabels[detailMilestoneCompetency.category] }} · {{ detailMilestoneCompetency.currentLevel }} → {{ detailMilestoneCompetency.targetLevel }}</span>
            </div>
          </div>
          <div v-else class="detail-empty">
            这是方向级里程碑，尚未关联具体能力。编辑里程碑即可补上能力归属。
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
          <input id="competency-name" v-model="competencyForm.name" class="input" placeholder="例如：SAT 与局部搜索 / C++ 工程能力" />
        </div>

        <div class="field">
          <label class="field-label" for="competency-desc">能力说明</label>
          <textarea id="competency-desc" v-model="competencyForm.description" class="textarea" placeholder="这个能力具体指什么？能做什么？" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="competency-category">能力类别</label>
            <select id="competency-category" v-model="competencyForm.category" class="select">
              <option v-for="category in categories" :key="category" :value="category">{{ competencyCategoryLabels[category] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-status">状态</label>
            <select id="competency-status" v-model="competencyForm.status" class="select">
              <option v-for="status in competencyStatuses" :key="status" :value="status">{{ competencyStatusLabels[status] }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="competency-parent">父能力</label>
          <select id="competency-parent" v-model="competencyForm.parentId" class="select">
            <option value="">无（作为根能力）</option>
            <option v-for="option in parentOptions" :key="option.id" :value="option.id">{{ option.name }}</option>
          </select>
          <span class="field-hint">从方向卡片进入时会自动关联当前方向；根能力下可继续添加子能力。</span>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="competency-current">当前等级</label>
            <select id="competency-current" v-model="competencyForm.currentLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">{{ competencyLevelLabels[level] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-target">目标等级</label>
            <select id="competency-target" v-model="competencyForm.targetLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">{{ competencyLevelLabels[level] }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="competency-criteria">评价标准</label>
          <textarea id="competency-criteria" v-model="competencyForm.assessmentCriteria" class="textarea" placeholder="达到目标等级时，应该能做出什么？需要哪些成果证据？" />
          <span class="field-hint">等级不能仅按学习时长或任务完成率自动提升，要有标准和证据。</span>
        </div>

        <div class="field">
          <span class="field-label">关联发展方向</span>
          <div v-if="activeDirections.length === 0" class="relation-empty">还没有发展方向，请先在“未来自我”中创建。</div>
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
                  @change="toggleDirectionAssignment(direction.id, $event)"
                />
                <span class="relation-dot" :style="{ background: direction.color }" />
                <span class="relation-name">{{ direction.name }}</span>
              </label>
              <template v-if="competencyForm.selectedDirectionIds.includes(direction.id)">
                <select v-model="competencyForm.requiredLevels[direction.id]" class="select relation-select" aria-label="要求等级">
                  <option v-for="level in levels" :key="level" :value="level">{{ level }}</option>
                </select>
                <select v-model="competencyForm.priorities[direction.id]" class="select relation-select" aria-label="关联优先级">
                  <option v-for="priority in relationPriorities" :key="priority" :value="priority">{{ priorityLabels[priority] }}</option>
                </select>
              </template>
            </div>
          </div>
          <span class="field-hint">同一能力被多个方向引用时只维护一份能力记录和一套子能力。</span>
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
          <input id="milestone-name" v-model="milestoneForm.name" class="input" placeholder="例如：独立完成 SAT 算法复现实验" />
        </div>

        <div class="field">
          <label class="field-label" for="milestone-desc">说明</label>
          <textarea id="milestone-desc" v-model="milestoneForm.description" class="textarea" placeholder="这个阶段要完成什么？" />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="milestone-direction">所属发展方向</label>
            <select id="milestone-direction" v-model="milestoneForm.directionId" class="select">
              <option value="" disabled>请选择方向</option>
              <option v-for="direction in milestoneDirectionOptions" :key="direction.id" :value="direction.id">{{ direction.name }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="milestone-competency">关联能力</label>
            <select id="milestone-competency" v-model="milestoneForm.competencyId" class="select">
              <option value="">不关联具体能力（方向级里程碑）</option>
              <option v-for="competency in milestoneCompetencyOptions" :key="competency.id" :value="competency.id">
                {{ competency.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="milestone-importance">重要性</label>
            <select id="milestone-importance" v-model="milestoneForm.importance" class="select">
              <option v-for="importance in importances" :key="importance" :value="importance">{{ importanceLabels[importance] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="milestone-status">状态</label>
            <select id="milestone-status" v-model="milestoneForm.status" class="select">
              <option v-for="status in milestoneStatuses" :key="status" :value="status">{{ milestoneStatusLabels[status] }}</option>
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
          <label class="field-label" for="milestone-criteria">验收条件</label>
          <textarea id="milestone-criteria" v-model="milestoneForm.successCriteria" class="textarea" placeholder="达到什么标准才算完成？最好附上可验证的成果。" />
        </div>

        <p class="field-hint">
          里程碑归属于方向；关联能力后，它会直接出现在对应能力节点下，并进入 S 型总时间线。
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



/* 融合后的路线图结构 */
.roadmap-toolbar {
  background: color-mix(in srgb, var(--surface) 92%, var(--accent-soft));
}

.toolbar-leading {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.toolbar-label {
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.toolbar-help {
  color: var(--muted);
  font-size: 12px;
}

.directions-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.direction-card-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.direction-card {
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.direction-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-sm);
}

.direction-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
}

.direction-summary {
  display: grid;
  grid-template-columns: 8px minmax(240px, 1.25fr) minmax(235px, 0.9fr) minmax(170px, 0.65fr) auto;
  align-items: center;
  gap: 18px;
  min-width: 0;
  padding: 19px 18px 19px 20px;
  text-align: left;
}

.direction-summary:hover {
  background: color-mix(in srgb, var(--surface-muted) 55%, transparent);
}

.direction-swatch {
  align-self: stretch;
  width: 7px;
  min-height: 64px;
  border-radius: var(--radius-pill);
}

.direction-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.direction-kicker {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.direction-copy strong {
  color: var(--ink);
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
}

.direction-description {
  overflow: hidden;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 14px;
  color: var(--muted);
  font-size: 12.5px;
}

.direction-metrics b {
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 13px;
}

.direction-metrics .next-node {
  flex-basis: 100%;
  color: var(--ink-soft);
}

.direction-progress-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
}

.direction-progress-label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 11.5px;
}

.direction-progress-label b {
  color: var(--ink-soft);
  font-family: var(--font-mono);
}

.direction-progress-box .direction-progress-track {
  width: 100%;
  height: 6px;
}

.direction-expand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
}

.direction-expand .icon {
  transition: transform 0.18s var(--ease-out);
}

.direction-expand .icon.rotated {
  transform: rotate(90deg);
}

.direction-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 12px 0 2px;
  border-left: 1px solid var(--line-faint);
}

.direction-body {
  padding: 0 20px 19px;
  border-top: 1px solid var(--line-faint);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-muted) 42%, transparent), transparent 90px),
    var(--surface);
}

.ability-tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 2px 11px;
}

.ability-tree-head > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.ability-tree-head strong {
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
}

.ability-tree-head span {
  color: var(--muted);
  font-size: 12px;
}

.ability-tree-count {
  flex: none;
  font-family: var(--font-mono);
}

.direction-ability-tree {
  margin: 0;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.unlinked-milestones {
  margin-top: 13px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.unlinked-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
  border-bottom: 1px solid var(--line-faint);
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
}

.unlinked-head > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.unlinked-head > span:last-child {
  color: var(--muted);
  font-weight: 400;
}

.unlinked-milestone {
  display: grid;
  grid-template-columns: 94px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 13px;
  border-bottom: 1px solid var(--line-faint);
  text-align: left;
}

.unlinked-milestone:last-child {
  border-bottom: 0;
}

.unlinked-milestone:hover {
  background: var(--surface);
}

.unlinked-date {
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.unlinked-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction-body-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 13px;
}

.s-timeline-card {
  overflow: hidden;
}

.s-timeline-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--line-faint);
  background:
    radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 55%),
    var(--surface);
  flex-wrap: wrap;
}

.timeline-eyebrow {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.timeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
  font-family: var(--font-serif);
  font-size: 21px;
  font-weight: 600;
}

.timeline-title .icon {
  color: var(--accent);
}

.timeline-subtitle {
  margin-top: 5px;
  color: var(--ink-soft);
  font-size: 13px;
}

.s-timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.s-timeline-board {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 24px 22px 18px;
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 48%),
    var(--surface);
}

.s-timeline-row {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}

.s-timeline-node {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 15px 15px 13px;
  border: 1px solid var(--line);
  border-top: 3px solid var(--node-color);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  text-align: left;
  transition:
    transform 0.18s var(--ease-out),
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.s-timeline-node:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--node-color) 42%, var(--line));
  box-shadow: var(--shadow-sm);
}

.s-node-order {
  position: absolute;
  top: 11px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.s-node-date {
  color: var(--node-color);
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 650;
}

.s-timeline-node > strong {
  margin: 8px 26px 9px 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.5;
}

.s-node-context {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--muted);
  font-size: 11.5px;
}

.s-node-context span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s-node-context span:first-child {
  color: var(--ink-soft);
  font-weight: 550;
}

.s-node-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  color: var(--muted);
  font-size: 11px;
}

.s-timeline-connector {
  position: relative;
  height: 34px;
}

.s-timeline-connector::before {
  position: absolute;
  top: 0;
  width: 30px;
  height: 24px;
  border-bottom: 1.5px dashed color-mix(in srgb, var(--accent) 34%, var(--line));
  content: '';
}

.s-timeline-connector.at-right::before {
  right: 9%;
  border-right: 1.5px dashed color-mix(in srgb, var(--accent) 34%, var(--line));
  border-bottom-right-radius: 14px;
}

.s-timeline-connector.at-left::before {
  left: 9%;
  border-left: 1.5px dashed color-mix(in srgb, var(--accent) 34%, var(--line));
  border-bottom-left-radius: 14px;
}

.s-timeline-connector span {
  position: absolute;
  top: 17px;
  width: 7px;
  height: 7px;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  background: var(--surface);
}

.s-timeline-connector.at-right span {
  right: calc(9% - 3px);
}

.s-timeline-connector.at-left span {
  left: calc(9% - 3px);
}

.s-timeline-foot {
  display: flex;
  align-items: center;
  gap: 9px 18px;
  padding: 12px 22px;
  border-top: 1px solid var(--line-faint);
  color: var(--muted);
  font-size: 11.5px;
  flex-wrap: wrap;
  background: var(--surface-muted);
}

.s-timeline-foot > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-node {
  width: 8px;
  height: 8px;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: var(--surface);
}

.linked-competency-card {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.linked-competency-card .tag-dot {
  margin-top: 5px;
}

.linked-competency-card > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.linked-competency-card strong {
  color: var(--ink);
  font-size: 13px;
}

.linked-competency-card span {
  color: var(--muted);
  font-size: 11.5px;
}

@media (max-width: 1180px) {
  .direction-summary {
    grid-template-columns: 8px minmax(220px, 1fr) minmax(190px, 0.75fr) auto;
  }

  .direction-progress-box {
    display: none;
  }
}

@media (max-width: 900px) {
  .direction-summary {
    grid-template-columns: 7px minmax(0, 1fr) auto;
    gap: 12px;
  }

  .direction-metrics {
    grid-column: 2 / -1;
  }

  .direction-expand {
    grid-column: 3;
    grid-row: 1;
  }

  .s-timeline-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .s-timeline-node {
    min-height: 150px;
  }
}

@media (max-width: 760px) {
  .direction-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .direction-summary {
    grid-template-columns: 6px minmax(0, 1fr);
    padding: 15px;
  }

  .direction-swatch {
    grid-row: 1 / span 3;
  }

  .direction-copy {
    grid-column: 2;
    grid-row: 1;
  }

  .direction-expand {
    grid-column: 2;
    grid-row: 2;
    justify-self: start;
    margin-top: 3px;
  }

  .direction-metrics {
    grid-column: 2;
    grid-row: 3;
  }

  .direction-description {
    white-space: normal;
  }

  .direction-actions {
    justify-content: flex-end;
    padding: 7px 10px;
    border-top: 1px solid var(--line-faint);
    border-left: 0;
  }

  .direction-body {
    padding: 0 11px 14px;
  }

  .direction-ability-tree {
    padding: 0 7px;
  }

  .ability-tree-head > div {
    flex-direction: column;
    gap: 2px;
  }

  .unlinked-milestone {
    grid-template-columns: 80px minmax(0, 1fr) 16px;
  }

  .unlinked-milestone .badge {
    display: none;
  }

  .s-timeline-head,
  .s-timeline-board {
    padding-right: 14px;
    padding-left: 14px;
  }

  .s-timeline-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .s-timeline-connector {
    height: 24px;
  }

  .s-timeline-connector::before,
  .s-timeline-connector span {
    display: none;
  }
}
</style>
