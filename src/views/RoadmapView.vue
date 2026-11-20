<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
} from '@/composables/useRoadmap'
import {
  CompetencyCategory,
  CompetencyLevel,
  CompetencyStatus,
  GoalStatus,
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
  type Goal,
  type Milestone,
} from '@/domain'
import { formatShortDate, fromDateInput, toDateInput } from '@/utils/date'

const { success, error: toastError } = useToast()
const route = useRoute()
const router = useRouter()

const {
  loading,
  error,
  competencies,
  relations,
  goals,
  activeDirections,
  directionMap,
  visibleCompetencies,
  assignmentsByCompetency,
  evidenceCounts,
  directionCompetencyTree,
  selectedDirectionId,
  includeArchived,
  coveredDirectionCount,
  growthHistoryFor,
  milestones,
  inProgressMilestones,
  milestonesOfDirection,
  refresh,
  saveCompetency,
  saveMilestone,
  recordCompetencyEvidence,
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
const relationPriorities = [Priority.HIGH, Priority.MEDIUM, Priority.LOW]
const expandedDirectionIds = reactive<Record<string, boolean>>({})
const focusedCompetencyId = ref<string | null>(null)

function flattenNodes(nodes: CompetencyNode[]): CompetencyNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)])
}

const goalCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const goal of goals.value) {
    if (goal.archivedAt || !goal.competencyId) continue
    counts[goal.competencyId] = (counts[goal.competencyId] ?? 0) + 1
  }
  return counts
})

const goalsByCompetency = computed<Record<string, Goal[]>>(() => {
  const map: Record<string, Goal[]> = {}
  for (const goal of goals.value) {
    if (goal.archivedAt || !goal.competencyId) continue
    const list = map[goal.competencyId] ?? (map[goal.competencyId] = [])
    list.push(goal)
  }
  for (const list of Object.values(map)) {
    list.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }
  return map
})

function openGoalInGoals(goal: Goal): void {
  router.push({ path: '/goals', query: { goal: goal.id } })
}

const filteredDirections = computed(() =>
  selectedDirectionId.value === 'all'
    ? activeDirections.value
    : activeDirections.value.filter((direction) => direction.id === selectedDirectionId.value),
)

interface DirectionSummary {
  direction: Direction
  competencyCount: number
  goalCount: number
  completedGoals: number
  percent: number
}

const directionSummaries = computed<DirectionSummary[]>(() =>
  filteredDirections.value.map((direction) => {
    const nodes = flattenNodes(directionCompetencyTree(direction.id))
    const competencyIds = new Set(nodes.map((node) => node.competency.id))
    const linkedGoals = goals.value.filter(
      (goal) => !goal.archivedAt && goal.competencyId && competencyIds.has(goal.competencyId),
    )
    const required = requiredLevelsForDirection(direction.id)
    const totalProgress = nodes.reduce((total, node) => {
      const target = Math.max(1, levelIndex(required[node.competency.id] ?? node.competency.targetLevel))
      return total + Math.min(100, (levelIndex(node.competency.currentLevel) / target) * 100)
    }, 0)
    return {
      direction,
      competencyCount: nodes.length,
      goalCount: linkedGoals.length,
      completedGoals: linkedGoals.filter((goal) => goal.status === GoalStatus.COMPLETED).length,
      percent: nodes.length ? Math.round(totalProgress / nodes.length) : 0,
    }
  }),
)

function requiredLevelsForDirection(directionId: string): Record<string, CompetencyLevel> {
  const result: Record<string, CompetencyLevel> = {}
  for (const relation of relations.value) {
    if (!relation.archivedAt && relation.directionId === directionId) {
      result[relation.competencyId] = relation.requiredLevel
    }
  }
  return result
}

function toggleDirection(directionId: string): void {
  expandedDirectionIds[directionId] = !expandedDirectionIds[directionId]
}

function openDirection(directionId: string): void {
  expandedDirectionIds[directionId] = true
}

function decomposeToGoals(competency: Competency): void {
  void router.push({ path: '/goals', query: { competency: competency.id } })
}

const archivedCount = computed(() => competencies.value.filter((item) => item.archivedAt).length)
const detailCompetencyId = ref<string | null>(null)
const detailCompetency = computed(
  () => competencies.value.find((item) => item.id === detailCompetencyId.value) ?? null,
)
const detailAssignments = computed(() =>
  detailCompetency.value ? assignmentsByCompetency.value[detailCompetency.value.id] ?? [] : [],
)
const detailGrowth = computed(() =>
  detailCompetency.value ? growthHistoryFor(detailCompetency.value.id) : [],
)
const detailGoals = computed(() =>
  detailCompetency.value
    ? goals.value.filter(
        (goal) => !goal.archivedAt && goal.competencyId === detailCompetency.value?.id,
      )
    : [],
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
  if (competency) askToggle(competency)
}

const evidenceModalOpen = ref(false)
const evidenceSaving = ref(false)
const evidenceError = ref('')
const evidenceForm = reactive({
  competencyId: '',
  title: '',
  description: '',
  assessedLevel: CompetencyLevel.L2 as CompetencyLevel,
  note: '',
})

function openEvidence(competency: Competency): void {
  evidenceForm.competencyId = competency.id
  evidenceForm.title = ''
  evidenceForm.description = ''
  evidenceForm.assessedLevel = competency.currentLevel
  evidenceForm.note = ''
  evidenceError.value = ''
  evidenceModalOpen.value = true
}

async function submitEvidence(): Promise<void> {
  evidenceError.value = ''
  if (!evidenceForm.title.trim()) {
    evidenceError.value = '请填写成果标题'
    return
  }
  evidenceSaving.value = true
  try {
    await recordCompetencyEvidence({
      competencyId: evidenceForm.competencyId,
      title: evidenceForm.title,
      description: evidenceForm.description,
      assessedLevel: evidenceForm.assessedLevel,
      note: evidenceForm.note,
    })
    evidenceModalOpen.value = false
    success('成果已记录，能力等级与路线进度已同步')
  } catch (caught) {
    evidenceError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    evidenceSaving.value = false
  }
}

const milestoneModalOpen = ref(false)
const milestoneSaving = ref(false)
const milestoneError = ref('')
const milestoneEditingId = ref<string | null>(null)
const milestoneForm = reactive({
  directionId: '',
  name: '',
  description: '',
  dueDate: '',
  status: MilestoneStatus.NOT_STARTED as MilestoneStatus,
  importance: Importance.NORMAL as Importance,
})

function openMilestoneCreate(direction: Direction): void {
  milestoneEditingId.value = null
  Object.assign(milestoneForm, {
    directionId: direction.id,
    name: '',
    description: '',
    dueDate: '',
    status: MilestoneStatus.NOT_STARTED,
    importance: Importance.NORMAL,
  })
  milestoneError.value = ''
  milestoneModalOpen.value = true
}

function openMilestoneEdit(milestone: Milestone): void {
  milestoneEditingId.value = milestone.id
  Object.assign(milestoneForm, {
    directionId: milestone.directionId,
    name: milestone.name,
    description: milestone.description,
    dueDate: toDateInput(milestone.dueDate),
    status: milestone.status,
    importance: milestone.importance,
  })
  milestoneError.value = ''
  milestoneModalOpen.value = true
}

async function submitMilestone(): Promise<void> {
  milestoneError.value = ''
  if (!milestoneForm.name.trim()) {
    milestoneError.value = '里程碑名称不能为空'
    return
  }
  milestoneSaving.value = true
  try {
    await saveMilestone(
      {
        directionId: milestoneForm.directionId,
        competencyId: null,
        name: milestoneForm.name.trim(),
        description: milestoneForm.description.trim(),
        startDate: null,
        dueDate: fromDateInput(milestoneForm.dueDate),
        importance: milestoneForm.importance,
        status: milestoneForm.status,
        successCriteria: '',
      },
      milestoneEditingId.value ?? undefined,
    )
    milestoneModalOpen.value = false
    success(milestoneEditingId.value ? '里程碑已更新' : '里程碑已创建')
  } catch (caught) {
    milestoneError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    milestoneSaving.value = false
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

const competencyForm = reactive<CompetencyForm>(emptyCompetencyForm())
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const formError = ref('')
const saving = ref(false)
const modalTitle = computed(() => (editingId.value ? '编辑能力节点' : '添加能力节点'))

const blockedParentIds = computed(() => {
  const ids = new Set<string>()
  if (editingId.value) {
    ids.add(editingId.value)
    for (const id of descendantsOf(editingId.value)) ids.add(id)
  }
  return ids
})

const parentOptions = computed(() =>
  visibleCompetencies.value
    .filter((competency) => !blockedParentIds.value.has(competency.id))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
)

function openCompetencyCreate(parent?: Competency, directionId?: string): void {
  editingId.value = null
  Object.assign(competencyForm, emptyCompetencyForm())
  if (parent) {
    competencyForm.parentId = parent.id
    competencyForm.category = parent.category
    competencyForm.targetLevel = parent.targetLevel
  }
  const preferredDirectionId =
    directionId ?? (selectedDirectionId.value !== 'all' ? selectedDirectionId.value : '')
  if (preferredDirectionId) {
    competencyForm.selectedDirectionIds = [preferredDirectionId]
    competencyForm.requiredLevels[preferredDirectionId] = competencyForm.targetLevel
    competencyForm.priorities[preferredDirectionId] = Priority.MEDIUM
  }
  formError.value = ''
  modalOpen.value = true
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
  modalOpen.value = true
}

function resetModal(): void {
  modalOpen.value = false
  editingId.value = null
  formError.value = ''
  Object.assign(competencyForm, emptyCompetencyForm())
}

function toggleDirectionAssignment(directionId: string, checked: boolean): void {
  competencyForm.selectedDirectionIds = checked
    ? [...new Set([...competencyForm.selectedDirectionIds, directionId])]
    : competencyForm.selectedDirectionIds.filter((id) => id !== directionId)
  if (checked) {
    competencyForm.requiredLevels[directionId] ??= competencyForm.targetLevel
    competencyForm.priorities[directionId] ??= Priority.MEDIUM
  }
}

async function submitCompetency(): Promise<void> {
  formError.value = ''
  if (!competencyForm.name.trim()) {
    formError.value = '能力名称不能为空'
    return
  }
  saving.value = true
  try {
    const parent = competencyForm.parentId
      ? visibleCompetencies.value.find((row) => row.id === competencyForm.parentId)
      : undefined
    const assignedIdentityId = competencyForm.selectedDirectionIds
      .map((directionId) => directionMap.value[directionId]?.identityId)
      .find((identityId): identityId is string => Boolean(identityId))
    const fallbackIdentityId = activeDirections.value
      .map((direction) => direction.identityId)
      .find((identityId): identityId is string => Boolean(identityId))
    const existing = editingId.value
      ? competencies.value.find((row) => row.id === editingId.value)
      : undefined
    const identityId =
      existing?.identityId ?? parent?.identityId ?? assignedIdentityId ?? fallbackIdentityId
    if (!identityId) {
      formError.value = '能力必须归属一个身份，请先创建方向或选择父能力'
      return
    }
    const payload: CompetencyInput = {
      identityId,
      weight: existing?.weight ?? 1,
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

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<Competency | null>(null)
const confirmTitle = computed(() => (confirmTarget.value?.archivedAt ? '恢复能力' : '归档能力'))
const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  return target.archivedAt
    ? `将恢复「${target.name}」，它会重新出现在能力树中。`
    : `将归档「${target.name}」。不会删除子能力、目标、任务或历史记录，之后可以随时恢复。`
})

function askToggle(competency: Competency): void {
  confirmTarget.value = competency
  confirmOpen.value = true
}

async function runToggle(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    await setArchived('competency', target.id, !target.archivedAt)
    success(target.archivedAt ? '能力已恢复' : '能力已归档')
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

onMounted(async () => {
  await refresh()
  let handled = false
  const directionParam = String(route.query.direction ?? '')
  if (directionParam) {
    handled = true
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
    handled = true
    const competency = competencies.value.find((item) => item.id === competencyParam)
    const relation = relations.value.find(
      (item) => !item.archivedAt && item.competencyId === competencyParam,
    )
    if (competency && relation) {
      selectedDirectionId.value = relation.directionId
      focusedCompetencyId.value = competency.id
      openDirection(relation.directionId)
    } else {
      toastError('这个能力不存在或没有关联发展方向')
    }
  }
  if (handled) await router.replace('/roadmap')
})
</script>

<template>
  <div class="page roadmap">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">方向与路线 · 能力地图</p>
        <h2 class="page-title">发展路线图</h2>
        <p class="page-subtitle">
          用发展方向组织能力。能力是目标拆解的锚点：选中一个能力，再到目标拆解中把它拆成可执行成果和任务。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" @click="openCompetencyCreate()">
          <AppIcon name="plus" :size="15" />
          新建能力
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="roadmap-flow card" aria-label="规划链路">
      <span>发展方向</span><AppIcon name="arrow-right" :size="13" />
      <strong>能力</strong><AppIcon name="arrow-right" :size="13" />
      <span>多级目标</span><AppIcon name="arrow-right" :size="13" />
      <span>任务</span><AppIcon name="arrow-right" :size="13" />
      <span>时间盒</span>
    </section>

    <section class="roadmap-stats">
      <div class="roadmap-stat">
        <span class="stat-icon"><AppIcon name="layers" :size="16" /></span>
        <div><strong>{{ visibleCompetencies.length }}</strong><span>能力节点</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-amber"><AppIcon name="target" :size="16" /></span>
        <div><strong>{{ Object.values(goalCounts).reduce((sum, count) => sum + count, 0) }}</strong><span>关联目标</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-blue"><AppIcon name="map" :size="16" /></span>
        <div><strong>{{ coveredDirectionCount }}</strong><span>覆盖方向</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-violet"><AppIcon name="layers" :size="16" /></span>
        <div><strong>{{ activeDirections.length }}</strong><span>进行中方向</span></div>
      </div>
      <div class="roadmap-stat">
        <span class="stat-icon icon-amber"><AppIcon name="flag" :size="16" /></span>
        <div>
          <strong>{{ inProgressMilestones }} / {{ milestones.length }}</strong>
          <span>进行中里程碑</span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar roadmap-toolbar">
      <div class="toolbar-leading">
        <span class="toolbar-label">能力地图</span>
        <span class="toolbar-help">展开方向和能力，查看它们承接的目标</span>
      </div>
      <div class="toolbar-actions">
        <select v-model="selectedDirectionId" class="select direction-filter" aria-label="按方向筛选">
          <option value="all">全部方向</option>
          <option v-for="direction in activeDirections" :key="direction.id" :value="direction.id">
            {{ direction.name }}
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

    <section v-else class="directions-section">
      <div class="section-head">
        <h3 class="section-title">
          <AppIcon name="map" :size="17" />
          发展方向
          <span class="count-pill">{{ filteredDirections.length }}</span>
        </h3>
        <span class="section-note">能力树可以逐层展开和收起</span>
      </div>

      <EmptyState
        v-if="activeDirections.length === 0"
        title="还没有发展方向"
        description="先在“未来自我”中建立方向，再用能力树描述实现这个方向所需的本领。"
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
                  优先级 {{ summary.direction.priority }} · 目标 {{ formatShortDate(summary.direction.targetDate, '待定') }}
                </span>
                <strong>{{ summary.direction.name }}</strong>
                <span class="direction-description">
                  {{ summary.direction.description || '尚未补充方向说明' }}
                </span>
              </span>
              <span class="direction-metrics">
                <span><b>{{ summary.competencyCount }}</b> 项能力</span>
                <span><b>{{ summary.goalCount }}</b> 个目标</span>
                <span>{{ summary.completedGoals }} 个已完成</span>
              </span>
              <span class="direction-progress-box">
                <span class="direction-progress-label">能力完成度 <b>{{ summary.percent }}%</b></span>
                <span class="direction-progress-track" aria-hidden="true">
                  <span
                    class="direction-progress-fill"
                    :style="{ width: `${summary.percent}%`, background: summary.direction.color }"
                  />
                </span>
              </span>
              <AppIcon
                name="arrow-right"
                :size="15"
                class="direction-chevron"
                :class="{ open: expandedDirectionIds[summary.direction.id] }"
              />
            </button>
          </header>

          <div v-if="expandedDirectionIds[summary.direction.id]" class="direction-body">
            <div class="milestone-panel">
              <div class="ability-heading-row">
                <span><AppIcon name="flag" :size="14" /> 阶段里程碑</span>
                <button class="link-btn" @click="openMilestoneCreate(summary.direction)">添加里程碑</button>
              </div>
              <ul v-if="milestonesOfDirection(summary.direction.id).length" class="milestone-list">
                <li v-for="milestone in milestonesOfDirection(summary.direction.id)" :key="milestone.id">
                  <button class="milestone-main" @click="openMilestoneEdit(milestone)">
                    <span class="milestone-name">{{ milestone.name }}</span>
                    <span class="milestone-meta">
                      {{ formatShortDate(milestone.dueDate, '待定') }}
                      · {{ milestoneStatusLabels[milestone.status] }}
                      · {{ importanceLabels[milestone.importance] }}
                    </span>
                  </button>
                </li>
              </ul>
              <p v-else class="detail-empty">还没有阶段里程碑。用它标记这条路线上必须发生的阶段成果。</p>
            </div>
            <div class="ability-heading-row">
              <span><AppIcon name="layers" :size="14" /> 能力树</span>
              <span>点击“拆解为目标”进入目标拆解</span>
            </div>
            <ul v-if="directionCompetencyTree(summary.direction.id).length" class="ability-tree">
              <RoadmapAbilityNode
                v-for="node in directionCompetencyTree(summary.direction.id)"
                :key="node.competency.id"
                :node="node"
                :direction-id="summary.direction.id"
                :direction-color="summary.direction.color"
                :required-levels="requiredLevelsForDirection(summary.direction.id)"
                :goal-counts="goalCounts"
                :goals-by-competency="goalsByCompetency"
                :focused-competency-id="focusedCompetencyId"
                @open-competency="openCompetencyDetail"
                @add-child="(competency) => openCompetencyCreate(competency, summary.direction.id)"
                @edit-competency="openCompetencyEdit"
                @toggle-archive="askToggle"
                @decompose="decomposeToGoals"
                @open-goal="openGoalInGoals"
              />
            </ul>
            <div v-else class="ability-empty">
              这个方向还没有能力节点。
              <button class="link-btn" @click="openCompetencyCreate(undefined, summary.direction.id)">添加第一项能力</button>
            </div>
            <button class="btn btn-sm btn-ghost add-root-ability" @click="openCompetencyCreate(undefined, summary.direction.id)">
              <AppIcon name="plus" :size="13" /> 添加顶层能力
            </button>
          </div>
        </article>
      </div>
    </section>

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
          <span class="badge badge-accent">{{ detailGoals.length }} 个目标</span>
        </div>
        <p class="detail-description">{{ detailCompetency.description || '还没有补充能力说明。' }}</p>
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
          <span class="detail-block-label">所属方向</span>
          <div class="detail-tag-list">
            <span v-for="assignment in detailAssignments" :key="assignment.id" class="goal-tag">
              <span class="tag-dot" :style="{ background: directionMap[assignment.directionId]?.color }" />
              {{ directionMap[assignment.directionId]?.name ?? '未知方向' }}
              · 要求 {{ assignment.requiredLevel }}
              · {{ priorityLabels[assignment.priority] }}
            </span>
          </div>
        </div>
        <div class="detail-block ability-decompose-panel">
          <span class="detail-block-label">下一步</span>
          <p>把这个能力拆成想达成的成果。每个目标都可以继续添加子目标，最后只让叶子目标承接任务。</p>
          <button class="btn btn-primary" @click="decomposeToGoals(detailCompetency)">
            <AppIcon name="target" :size="14" /> 拆解为目标
          </button>
        </div>
        <div class="detail-block">
          <span class="detail-block-label">成长记录</span>
          <div v-if="detailGrowth.length" class="growth-list">
            <div v-for="item in detailGrowth" :key="item.id" class="growth-row">
              <span>{{ item.level }}</span>
              <div><strong>{{ item.date }}</strong><small>{{ item.evidenceTitle }}</small></div>
              <p>{{ item.note || '无备注' }}</p>
            </div>
          </div>
          <p v-else class="detail-empty">还没有成长证据。</p>
          <button v-if="!detailCompetency.archivedAt" class="btn btn-sm btn-secondary" @click="openEvidence(detailCompetency)">
            <AppIcon name="plus" :size="13" /> 记录成果并评估等级
          </button>
        </div>
      </div>
      <template #footer>
        <button v-if="detailCompetency && !detailCompetency.archivedAt" class="btn btn-sm btn-secondary" @click="editCompetencyFromDetail">编辑能力</button>
        <button class="btn btn-sm" :class="detailCompetency?.archivedAt ? 'btn-secondary' : 'btn-danger'" @click="archiveCompetencyFromDetail">
          {{ detailCompetency?.archivedAt ? '恢复能力' : '归档能力' }}
        </button>
      </template>
    </DetailDrawer>

    <ModalDialog :open="modalOpen" :title="modalTitle" subtitle="能力用于组织方向所需的本领；目标负责描述要达成的成果。" size="lg" @close="resetModal">
      <form class="form" @submit.prevent="submitCompetency">
        <div class="field">
          <label class="field-label" for="competency-name">能力名称</label>
          <input id="competency-name" v-model="competencyForm.name" class="input" placeholder="例如：SAT 与局部搜索" />
        </div>
        <div class="field">
          <label class="field-label" for="competency-desc">说明</label>
          <textarea id="competency-desc" v-model="competencyForm.description" class="textarea" placeholder="这项能力具体包含什么？" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="competency-category">类别</label>
            <select id="competency-category" v-model="competencyForm.category" class="select">
              <option v-for="category in categories" :key="category" :value="category">{{ competencyCategoryLabels[category] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-parent">父能力</label>
            <select id="competency-parent" v-model="competencyForm.parentId" class="select">
              <option value="">无（顶层能力）</option>
              <option v-for="competency in parentOptions" :key="competency.id" :value="competency.id">{{ competency.name }}</option>
            </select>
          </div>
        </div>
        <div class="form-grid form-grid-3">
          <div class="field">
            <label class="field-label" for="competency-current">当前等级</label>
            <select id="competency-current" v-model="competencyForm.currentLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">{{ level }} · {{ competencyLevelLabels[level] }}</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="competency-target">目标等级</label>
            <select id="competency-target" v-model="competencyForm.targetLevel" class="select">
              <option v-for="level in levels" :key="level" :value="level">{{ level }} · {{ competencyLevelLabels[level] }}</option>
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
          <label class="field-label" for="competency-criteria">评价标准</label>
          <textarea id="competency-criteria" v-model="competencyForm.assessmentCriteria" class="textarea" placeholder="什么证据可以证明这项能力已经达到目标等级？" />
        </div>
        <div class="field">
          <span class="field-label">所属发展方向</span>
          <div class="direction-assignments">
            <label v-for="direction in activeDirections" :key="direction.id" class="assignment-row" :class="{ selected: competencyForm.selectedDirectionIds.includes(direction.id) }">
              <input
                type="checkbox"
                :checked="competencyForm.selectedDirectionIds.includes(direction.id)"
                @change="toggleDirectionAssignment(direction.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="chip-dot" :style="{ background: direction.color }" />
              <strong>{{ direction.name }}</strong>
              <template v-if="competencyForm.selectedDirectionIds.includes(direction.id)">
                <select v-model="competencyForm.requiredLevels[direction.id]" class="select compact-select" aria-label="要求等级">
                  <option v-for="level in levels" :key="level" :value="level">{{ level }}</option>
                </select>
                <select v-model="competencyForm.priorities[direction.id]" class="select compact-select" aria-label="方向内优先级">
                  <option v-for="priority in relationPriorities" :key="priority" :value="priority">{{ priorityLabels[priority] }}</option>
                </select>
              </template>
            </label>
            <p v-if="activeDirections.length === 0" class="field-hint">请先在“未来自我”中创建发展方向。</p>
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '添加能力' }}</button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="evidenceModalOpen"
      title="记录成果并评估等级"
      subtitle="成果会沉淀为能力证据，可据此更新当前等级。"
      size="md"
      @close="evidenceModalOpen = false"
    >
      <form class="form" @submit.prevent="submitEvidence">
        <div class="field">
          <label class="field-label" for="evidence-title">成果标题</label>
          <input id="evidence-title" v-model="evidenceForm.title" class="input" placeholder="例如：完成 WalkSAT 变量选择实现并通过测试" />
        </div>
        <div class="field">
          <label class="field-label" for="evidence-desc">说明</label>
          <textarea id="evidence-desc" v-model="evidenceForm.description" class="textarea" placeholder="这份成果具体证明什么？" />
        </div>
        <div class="field">
          <label class="field-label" for="evidence-level">评估等级</label>
          <select id="evidence-level" v-model="evidenceForm.assessedLevel" class="select">
            <option v-for="level in levels" :key="level" :value="level">{{ level }} · {{ competencyLevelLabels[level] }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="evidence-note">评估备注</label>
          <textarea id="evidence-note" v-model="evidenceForm.note" class="textarea" placeholder="为什么是这一等级？还有哪些差距？" />
        </div>
        <p v-if="evidenceError" class="form-error">{{ evidenceError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="evidenceModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="evidenceSaving">
            {{ evidenceSaving ? '保存中…' : '记录成果' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="milestoneModalOpen"
      :title="milestoneEditingId ? '编辑里程碑' : '添加里程碑'"
      subtitle="里程碑是发展方向上的阶段成果，目标与任务最终要支撑它。"
      @close="milestoneModalOpen = false"
    >
      <form class="form" @submit.prevent="submitMilestone">
        <div class="field">
          <label class="field-label" for="milestone-name">名称</label>
          <input id="milestone-name" v-model="milestoneForm.name" class="input" placeholder="例如：完成第一篇论文复现" />
        </div>
        <div class="field">
          <label class="field-label" for="milestone-desc">说明</label>
          <textarea id="milestone-desc" v-model="milestoneForm.description" class="textarea" placeholder="这个阶段结束时应该发生什么？" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="milestone-due">截止日期</label>
            <input id="milestone-due" v-model="milestoneForm.dueDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="milestone-status">状态</label>
            <select id="milestone-status" v-model="milestoneForm.status" class="select">
              <option v-for="status in Object.values(MilestoneStatus)" :key="status" :value="status">{{ milestoneStatusLabels[status] }}</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="milestone-importance">重要度</label>
          <select id="milestone-importance" v-model="milestoneForm.importance" class="select">
            <option v-for="importance in Object.values(Importance)" :key="importance" :value="importance">{{ importanceLabels[importance] }}</option>
          </select>
        </div>
        <p v-if="milestoneError" class="form-error">{{ milestoneError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="milestoneModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="milestoneSaving">
            {{ milestoneSaving ? '保存中…' : milestoneEditingId ? '保存修改' : '添加里程碑' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="confirmBusy" @click="runToggle">{{ confirmBusy ? '处理中…' : confirmTitle }}</button>
      </div>
    </ModalDialog>
  </div>
</template>

<style scoped>
.roadmap-flow { display: flex; align-items: center; gap: 10px; padding: 12px 16px; margin-bottom: 14px; color: var(--muted); font-size: .78rem; }
.milestone-panel { padding: 12px 14px; margin-bottom: 14px; border: 1px dashed var(--line); border-radius: var(--radius-md); background: var(--surface-muted); }
.milestone-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.milestone-main { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 8px 10px; text-align: left; border-radius: var(--radius-sm); }
.milestone-main:hover { background: var(--surface); }
.milestone-name { color: var(--ink); font-size: .82rem; font-weight: 600; }
.milestone-meta { color: var(--muted); font-size: .72rem; }
.roadmap-flow strong { color: var(--accent-strong); }
.roadmap-flow .icon { color: var(--line-strong); }
.roadmap-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.roadmap-stat { display: flex; align-items: center; gap: 11px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.roadmap-stat > div { display: grid; gap: 1px; }
.roadmap-stat strong { font-size: 1.25rem; color: var(--ink); font-variant-numeric: tabular-nums; }
.roadmap-stat > div span { color: var(--muted); font-size: .72rem; }
.roadmap-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 11px 16px; margin-bottom: 16px; }
.toolbar-leading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; min-width: 0; }
.toolbar-label { color: var(--ink); font-size: .84rem; font-weight: 600; }
.toolbar-help { color: var(--muted); font-size: .74rem; }
.toolbar-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.direction-filter { width: auto; min-width: 150px; height: 34px; padding-top: 0; padding-bottom: 0; }
.direction-card-list { display: grid; gap: 12px; }
.direction-card { overflow: hidden; }
.direction-card-head { border-bottom: 1px solid transparent; }
.direction-card:has(.direction-body) .direction-card-head { border-color: var(--line-faint); }
.direction-summary { display: grid; grid-template-columns: 7px minmax(240px, 1fr) minmax(220px, auto) minmax(150px, 190px) 20px; align-items: center; gap: 16px; width: 100%; padding: 17px 18px; text-align: left; }
.direction-summary:hover { background: color-mix(in srgb, var(--surface-muted) 50%, transparent); }
.direction-swatch { width: 7px; height: 46px; border-radius: 99px; }
.direction-copy { display: grid; gap: 4px; min-width: 0; }
.direction-copy strong { color: var(--ink); font-size: 1.04rem; }
.direction-kicker, .direction-description { color: var(--muted); font-size: .73rem; }
.direction-description { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.direction-metrics { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 14px; color: var(--muted); font-size: .73rem; }
.direction-metrics b { color: var(--ink); }
.direction-progress-box { display: grid; gap: 6px; }
.direction-progress-label { display: flex; justify-content: space-between; color: var(--muted); font-size: .71rem; }
.direction-progress-label b { color: var(--ink); }
.direction-progress-track { height: 5px; overflow: hidden; border-radius: 99px; background: var(--surface-muted); }
.direction-progress-fill { display: block; height: 100%; border-radius: inherit; }
.direction-chevron { color: var(--muted); transition: transform .18s var(--ease-out); }
.direction-chevron.open { transform: rotate(90deg); }
.direction-body { padding: 14px 18px 16px; background: color-mix(in srgb, var(--surface-muted) 30%, var(--surface)); }
.ability-heading-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 9px; color: var(--muted); font-size: .72rem; }
.ability-heading-row > span:first-child { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); font-weight: 650; }
.ability-tree { margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--line-faint); border-radius: var(--radius-sm); background: var(--surface); }
.ability-empty { padding: 22px; text-align: center; color: var(--muted); font-size: .8rem; }
.add-root-ability { margin-top: 9px; }
.ability-decompose-panel { display: grid; gap: 10px; padding: 14px; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line)); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.growth-list { display: grid; gap: 8px; }
.growth-row { display: grid; grid-template-columns: 34px 1fr; gap: 8px; padding: 9px; border: 1px solid var(--line-faint); border-radius: 7px; }
.growth-row > span { font-weight: 750; color: var(--accent-strong); }
.growth-row div { display: grid; gap: 2px; }
.growth-row strong, .growth-row small { font-size: .73rem; }
.growth-row small { color: var(--muted); }
.growth-row p { grid-column: 2; margin: 0; color: var(--muted); font-size: .73rem; }
.direction-assignments { display: grid; gap: 7px; }
.assignment-row { display: flex; align-items: center; gap: 8px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: .78rem; }
.assignment-row.selected { border-color: color-mix(in srgb, var(--accent) 32%, var(--line)); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.compact-select { width: auto; min-width: 74px; height: 28px; padding: 0 7px; margin-left: auto; font-size: .72rem; }
.compact-select + .compact-select { margin-left: 0; }
@media (max-width: 1050px) {
  .direction-summary { grid-template-columns: 7px minmax(0, 1fr) minmax(140px, 180px) 20px; }
  .direction-metrics { display: none; }
}
@media (max-width: 720px) {
  .roadmap-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .direction-summary { grid-template-columns: 7px minmax(0, 1fr) 20px; }
  .direction-progress-box { display: none; }
  .direction-body { padding-inline: 10px; }
  .ability-heading-row > span:last-child { display: none; }
  .roadmap-flow { overflow-x: auto; white-space: nowrap; }
}
</style>
