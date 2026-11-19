<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import ModalDialog from './ModalDialog.vue'
import DetailDrawer from './DetailDrawer.vue'
import { useToast } from '@/composables/useToast'
import {
  useBehaviorMap,
  type BehaviorCandidateInput,
} from '@/composables/useBehaviorMap'
import {
  AnchorType,
  BehaviorCandidateStatus,
  BehaviorSourceType,
  PromptStatus,
  anchorTypeLabels,
  behaviorCandidateStatusLabels,
  behaviorSourceTypeLabels,
  promptStatusLabels,
  type BehaviorCandidate,
  type BehaviorSourceType as BehaviorSourceTypeValue,
} from '@/domain'

const emit = defineEmits<{ habitCreated: [] }>()

const { success, error: toastError } = useToast()

const {
  loading,
  error,
  candidates,
  directions,
  activeCandidates,
  goldenCandidates,
  designedCount,
  directionMap,
  goals,
  tasks,
  refresh,
  saveCandidate,
  updateScore,
  archiveCandidate,
  designHabit,
  sourceObjectLabel,
  removeCandidate,
  batchArchive,
  markForDesign,
} = useBehaviorMap()

type StatusFilter = 'ALL' | BehaviorCandidateStatus

const statusFilter = ref<StatusFilter>('ALL')
const directionFilter = ref('all')
const sourceFilter = ref<'ALL' | BehaviorSourceTypeValue>('ALL')
const selectedIds = ref<string[]>([])
const batchBusy = ref(false)
const deleteConfirmOpen = ref(false)

const statusOptions = [
  { value: 'ALL', label: '全部候选' },
  { value: BehaviorCandidateStatus.CANDIDATE, label: '待设计' },
  { value: BehaviorCandidateStatus.DESIGNED, label: '已设计为习惯' },
  { value: BehaviorCandidateStatus.ARCHIVED, label: '已归档' },
]

const directionOptions = computed(() =>
  directions.value.filter((direction) => !direction.archivedAt),
)

const candidateSourceOptions = Object.values(BehaviorSourceType)

const sourceFilterOptions = [
  { value: 'ALL', label: '全部来源类型' },
  { value: BehaviorSourceType.DIRECTION, label: '方向' },
  { value: BehaviorSourceType.GOAL, label: '目标' },
  { value: BehaviorSourceType.TASK, label: '任务' },
  { value: BehaviorSourceType.CUSTOM, label: '自选' },
]

const filteredCandidates = computed(() =>
  candidates.value
    .filter((candidate) => {
      if (statusFilter.value === 'ALL') {
        return (
          candidate.status !== BehaviorCandidateStatus.ARCHIVED && !candidate.archivedAt
        )
      }
      return candidate.status === statusFilter.value
    })
    .filter(
      (candidate) =>
        directionFilter.value === 'all' ||
        candidate.directionId === directionFilter.value,
    )
    .filter(
      (candidate) =>
        sourceFilter.value === 'ALL' || candidate.sourceType === sourceFilter.value,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
)

const unscoredCandidates = computed(() =>
  filteredCandidates.value.filter(
    (candidate) => candidate.impact <= 0 || candidate.ease <= 0,
  ),
)

const scoredCandidates = computed(() =>
  filteredCandidates.value.filter(
    (candidate) => candidate.impact > 0 && candidate.ease > 0,
  ),
)

const selectedCandidates = computed(() =>
  candidates.value.filter((candidate) => selectedIds.value.includes(candidate.id)),
)

const allVisibleSelected = computed(
  () =>
    filteredCandidates.value.length > 0 &&
    filteredCandidates.value.every((candidate) => selectedIds.value.includes(candidate.id)),
)

function toggleSelection(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleSelectAll(): void {
  const visibleIds = filteredCandidates.value.map((candidate) => candidate.id)
  if (allVisibleSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !visibleIds.includes(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])]
  }
}

async function runBatchArchive(): Promise<void> {
  const ids = selectedCandidates.value.map((candidate) => candidate.id)
  if (ids.length === 0) return
  batchBusy.value = true
  try {
    await batchArchive(ids, true)
    success(`已归档 ${ids.length} 个候选行为`)
    selectedIds.value = []
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    batchBusy.value = false
  }
}

async function runBatchDesign(): Promise<void> {
  const ids = selectedCandidates.value.map((candidate) => candidate.id)
  if (ids.length === 0) return
  batchBusy.value = true
  try {
    const count = await markForDesign(ids)
    success(
      count > 0
        ? `${count} 个候选已加入待设计并重置评分`
        : '选中的候选都已是已设计状态，无需重复加入',
    )
    selectedIds.value = []
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    batchBusy.value = false
  }
}

async function runBatchDelete(): Promise<void> {
  const ids = selectedCandidates.value.map((candidate) => candidate.id)
  if (ids.length === 0) return
  batchBusy.value = true
  try {
    let deleted = 0
    let skipped = 0
    for (const id of ids) {
      const candidate = candidates.value.find((row) => row.id === id)
      if (candidate?.habitId || candidate?.status === BehaviorCandidateStatus.DESIGNED) {
        skipped += 1
        continue
      }
      await removeCandidate(id)
      deleted += 1
    }
    success(
      skipped > 0
        ? `已删除 ${deleted} 个候选；${skipped} 个已设计候选已保留，请改用归档。`
        : `已删除 ${deleted} 个候选行为`,
    )
    selectedIds.value = []
    deleteConfirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    batchBusy.value = false
  }
}

interface QuadrantDefinition {
  key: string
  code: string
  title: string
  subtitle: string
  tone: string
  candidates: BehaviorCandidate[]
}

const quadrants = computed<QuadrantDefinition[]>(() => {
  const list = scoredCandidates.value
  return [
    {
      key: 'high-impact-hard',
      code: 'HIGH IMPACT',
      title: '高影响 · 较难',
      subtitle: '先缩小行为',
      tone: 'hard',
      candidates: list.filter(
        (candidate) => candidate.impact >= 3 && candidate.ease < 3,
      ),
    },
    {
      key: 'golden',
      code: 'GOLDEN',
      title: '高影响 · 容易',
      subtitle: '优先设计',
      tone: 'golden',
      candidates: list.filter(
        (candidate) => candidate.impact >= 3 && candidate.ease >= 3,
      ),
    },
    {
      key: 'low-impact-hard',
      code: 'LOW IMPACT',
      title: '低影响 · 较难',
      subtitle: '暂不投入',
      tone: 'muted',
      candidates: list.filter(
        (candidate) => candidate.impact < 3 && candidate.ease < 3,
      ),
    },
    {
      key: 'low-impact-easy',
      code: 'LOW IMPACT',
      title: '低影响 · 容易',
      subtitle: '可以保留观察',
      tone: 'easy',
      candidates: list.filter(
        (candidate) => candidate.impact < 3 && candidate.ease >= 3,
      ),
    },
  ]
})

const quadrantScores: Record<string, { impact: number; ease: number }> = {
  'high-impact-hard': { impact: 4, ease: 2 },
  golden: { impact: 4, ease: 4 },
  'low-impact-hard': { impact: 2, ease: 2 },
  'low-impact-easy': { impact: 2, ease: 4 },
}

const draggedId = ref<string | null>(null)

function onDragStart(candidate: BehaviorCandidate): void {
  draggedId.value = candidate.id
}

async function dropToQuadrant(key: string): Promise<void> {
  const id = draggedId.value
  draggedId.value = null
  if (!id) return
  const score = quadrantScores[key]
  if (!score) return
  try {
    await updateScore(id, score.impact, score.ease)
    success('评分已更新，行为已移动到对应区域')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const scoringId = ref<string | null>(null)
const scoringCandidate = computed(
  () => candidates.value.find((candidate) => candidate.id === scoringId.value) ?? null,
)
const scoreImpact = ref(3)
const scoreEase = ref(3)
const drawerOpen = computed(() => scoringCandidate.value !== null)

watch(scoringId, () => {
  const candidate = scoringCandidate.value
  if (!candidate) return
  scoreImpact.value = candidate.impact > 0 ? candidate.impact : 3
  scoreEase.value = candidate.ease > 0 ? candidate.ease : 3
})

const scorePreview = computed(() => {
  const highImpact = scoreImpact.value >= 3
  const highEase = scoreEase.value >= 3
  if (highImpact && highEase) return { label: 'Golden · 高影响且容易', tone: 'golden' }
  if (highImpact) return { label: '高影响 · 较难', tone: 'hard' }
  if (highEase) return { label: '低影响 · 容易', tone: 'easy' }
  return { label: '低影响 · 较难', tone: 'muted' }
})

function openScore(candidate: BehaviorCandidate): void {
  scoringId.value = candidate.id
}

function closeScore(): void {
  scoringId.value = null
}

async function saveScore(): Promise<void> {
  const candidate = scoringCandidate.value
  if (!candidate) return
  try {
    await updateScore(candidate.id, scoreImpact.value, scoreEase.value)
    success('评分已保存')
    closeScore()
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const candidateModalOpen = ref(false)
const candidateEditingId = ref<string | null>(null)
const candidateForm = reactive({
  title: '',
  description: '',
  sourceType: BehaviorSourceType.CUSTOM as BehaviorSourceTypeValue,
  sourceId: '',
  directionId: '',
  note: '',
})
const formError = ref('')
const saving = ref(false)

function openCandidateCreate(): void {
  candidateEditingId.value = null
  Object.assign(candidateForm, {
    title: '',
    description: '',
    sourceType: BehaviorSourceType.CUSTOM,
    sourceId: '',
    directionId: '',
    note: '',
  })
  formError.value = ''
  candidateModalOpen.value = true
}

function openCandidateEdit(candidate: BehaviorCandidate): void {
  scoringId.value = null
  candidateEditingId.value = candidate.id
  Object.assign(candidateForm, {
    title: candidate.title,
    description: candidate.description,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId ?? '',
    directionId: candidate.directionId ?? '',
    note: candidate.note,
  })
  formError.value = ''
  candidateModalOpen.value = true
}

async function submitCandidate(): Promise<void> {
  formError.value = ''
  if (!candidateForm.title.trim()) {
    formError.value = '候选行为名称不能为空'
    return
  }
  if (candidateForm.sourceType === BehaviorSourceType.DIRECTION && !candidateForm.directionId) {
    formError.value = '来源为发展方向时，请选择对应方向'
    return
  }
  if (
    (candidateForm.sourceType === BehaviorSourceType.GOAL ||
      candidateForm.sourceType === BehaviorSourceType.TASK) &&
    !candidateForm.sourceId
  ) {
    formError.value = '请选择候选行为对应的目标或任务'
    return
  }
  saving.value = true
  try {
    const existing = candidateEditingId.value
      ? candidates.value.find((candidate) => candidate.id === candidateEditingId.value)
      : null
    const payload: BehaviorCandidateInput = {
      title: candidateForm.title.trim(),
      description: candidateForm.description.trim(),
      sourceType: candidateForm.sourceType,
      sourceId:
        candidateForm.sourceType === BehaviorSourceType.DIRECTION
          ? candidateForm.directionId || null
          : candidateForm.sourceType === BehaviorSourceType.GOAL ||
              candidateForm.sourceType === BehaviorSourceType.TASK
            ? candidateForm.sourceId || null
            : null,
      directionId: candidateForm.directionId || null,
      impact: existing?.impact ?? 0,
      ease: existing?.ease ?? 0,
      status: existing?.status ?? BehaviorCandidateStatus.CANDIDATE,
      habitId: existing?.habitId ?? null,
      note: candidateForm.note.trim(),
    }
    const entity = await saveCandidate(payload, candidateEditingId.value ?? undefined)
    candidateModalOpen.value = false
    success(candidateEditingId.value ? '候选行为已更新' : '候选行为已添加，先给它评分')
    if (!candidateEditingId.value) scoringId.value = entity.id
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

async function handleArchiveCandidate(candidate: BehaviorCandidate): Promise<void> {
  try {
    const archived = candidate.status === BehaviorCandidateStatus.ARCHIVED
    await archiveCandidate(candidate.id, !archived)
    success(archived ? '候选行为已恢复' : '候选行为已归档')
    closeScore()
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const designerOpen = ref(false)
const designerCandidate = ref<BehaviorCandidate | null>(null)
const designerStep = ref(1)
const designerError = ref('')
const creatingHabit = ref(false)

const designerForm = reactive({
  name: '',
  anchorType: AnchorType.EVENT,
  anchorDescription: '',
  tinyBehavior: '',
  celebration: '',
  motivationLevel: 4,
  abilityLevel: 3,
  promptStatus: PromptStatus.CLEAR,
  frequency: '每天',
})

const designerPreview = computed(
  () =>
    `${designerForm.anchorDescription || '［某个已有行为之后］'}，我就 ${
      designerForm.tinyBehavior || '［一个足够小的行为］'
    }，然后 ${designerForm.celebration || '［给自己一个即时庆祝］'}。`,
)

function openDesigner(candidate: BehaviorCandidate): void {
  if (candidate.impact <= 0 || candidate.ease <= 0) {
    toastError('请先完成 Impact 与 Ease 评分')
    return
  }
  if (candidate.status === BehaviorCandidateStatus.DESIGNED) {
    toastError('这个候选行为已经转化为习惯')
    return
  }
  scoringId.value = null
  designerCandidate.value = candidate
  designerStep.value = 1
  designerError.value = ''
  Object.assign(designerForm, {
    name: candidate.title,
    anchorType: AnchorType.EVENT,
    anchorDescription: '',
    tinyBehavior: candidate.title,
    celebration: '对自己说：很好，我已经开始了。',
    motivationLevel: Math.max(1, Math.min(5, candidate.impact)),
    abilityLevel: Math.max(1, Math.min(5, candidate.ease)),
    promptStatus: PromptStatus.PARTIAL,
    frequency: '每天',
  })
  designerOpen.value = true
}

function validateDesignerStep(): boolean {
  designerError.value = ''
  if (designerStep.value === 1) {
    if (!designerForm.name.trim()) {
      designerError.value = '习惯名称不能为空'
      return false
    }
    if (!designerForm.anchorDescription.trim()) {
      designerError.value = '请写清楚提示：在什么已有行为之后开始'
      return false
    }
  }
  if (designerStep.value === 2) {
    if (!designerForm.tinyBehavior.trim()) {
      designerError.value = '请写清楚一个足够小的微行为'
      return false
    }
  }
  return true
}

function nextDesignerStep(): void {
  if (!validateDesignerStep()) return
  designerStep.value = Math.min(3, designerStep.value + 1)
}

function prevDesignerStep(): void {
  designerError.value = ''
  designerStep.value = Math.max(1, designerStep.value - 1)
}

function testRecipe(): void {
  if (!designerForm.anchorDescription.trim() || !designerForm.tinyBehavior.trim()) {
    designerError.value = '锚点和微行为都写清楚后，才能检查配方'
    return
  }
  success(
    `配方检查通过：锚点明确，微行为「${designerForm.tinyBehavior}」应能在低精力时启动。`,
  )
}

async function createHabitFromCandidate(): Promise<void> {
  const candidate = designerCandidate.value
  if (!candidate) return
  if (!validateDesignerStep()) return
  creatingHabit.value = true
  try {
    await designHabit(candidate, {
      name: designerForm.name,
      anchorType: designerForm.anchorType,
      anchorDescription: designerForm.anchorDescription,
      tinyBehavior: designerForm.tinyBehavior,
      celebration: designerForm.celebration,
      motivationLevel: designerForm.motivationLevel,
      abilityLevel: designerForm.abilityLevel,
      promptStatus: designerForm.promptStatus,
      frequency: designerForm.frequency,
    })
    designerOpen.value = false
    emit('habitCreated')
    success('行为配方已生成，习惯已加入今日打卡')
  } catch (caught) {
    designerError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    creatingHabit.value = false
  }
}

function dropoutPreviewClass(candidate: BehaviorCandidate): string {
  return candidate.status === BehaviorCandidateStatus.DESIGNED ? 'designed' : ''
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="focus-map">
    <section class="focus-intro">
      <div>
        <p class="page-eyebrow">Behavior Design · Focus Mapping</p>
        <h3>焦点地图</h3>
        <p>
          先列出可能的行为，再根据影响力（Impact）和容易程度（Ease）筛选。
          高影响且容易执行的行为，才优先进入行为设计。
        </p>
      </div>
      <div class="focus-stats">
        <div class="focus-stat">
          <strong>{{ activeCandidates.length }}</strong>
          <span>候选行为</span>
        </div>
        <div class="focus-stat focus-stat-golden">
          <strong>{{ goldenCandidates.length }}</strong>
          <span>Golden</span>
        </div>
        <div class="focus-stat">
          <strong>{{ designedCount }}</strong>
          <span>已设计为习惯</span>
        </div>
      </div>
    </section>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取行为候选失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="focus-toolbar card">
      <div class="focus-filters">
        <select v-model="statusFilter" class="select filter-select" aria-label="筛选候选行为状态">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <select v-model="directionFilter" class="select filter-select" aria-label="筛选发展方向">
          <option value="all">全部方向</option>
          <option v-for="direction in directionOptions" :key="direction.id" :value="direction.id">
            {{ direction.name }}
          </option>
        </select>
        <select v-model="sourceFilter" class="select filter-select" aria-label="筛选行为来源类型">
          <option v-for="option in sourceFilterOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button class="btn btn-sm btn-ghost" @click="toggleSelectAll">
          {{ allVisibleSelected ? '取消全选' : '全选当前结果' }}
        </button>
        <span class="filter-hint">评分 1–5，≥ 3 为高</span>
      </div>
      <button class="btn btn-sm btn-primary" @click="openCandidateCreate">
        <AppIcon name="plus" :size="14" />
        新增候选行为
      </button>
    </section>

    <section v-if="selectedIds.length > 0" class="batch-bar card" aria-label="候选行为批量操作">
      <div>
        <strong>已选择 {{ selectedIds.length }} 项</strong>
        <span>批量操作不会删除已经设计为习惯的行为。</span>
      </div>
      <div class="batch-actions">
        <button class="btn btn-sm btn-secondary" :disabled="batchBusy" @click="runBatchDesign">
          <AppIcon name="sliders" :size="13" />
          加入待设计
        </button>
        <button class="btn btn-sm btn-secondary" :disabled="batchBusy" @click="runBatchArchive">
          <AppIcon name="archive" :size="13" />
          批量归档
        </button>
        <button class="btn btn-sm btn-danger" :disabled="batchBusy" @click="deleteConfirmOpen = true">
          <AppIcon name="trash" :size="13" />
          批量删除
        </button>
        <button class="btn btn-sm btn-ghost" :disabled="batchBusy" @click="selectedIds = []">
          清除选择
        </button>
      </div>
    </section>

    <div v-if="loading" class="skeleton focus-loading" />

    <EmptyState
      v-else-if="candidates.length === 0"
      title="先列出你希望养成的行为"
      description="候选行为不是习惯，它只是待评估的选项。先写下来，再从影响力和容易程度两个角度筛选。"
    >
      <button class="btn btn-sm btn-secondary" @click="openCandidateCreate">
        添加第一个候选行为
      </button>
    </EmptyState>

    <div v-else class="focus-layout">
      <aside class="candidate-pool card">
        <div class="section-head">
          <h4 class="pool-title">
            <AppIcon name="layers" :size="15" />
            候选池
            <span class="count-pill">{{ unscoredCandidates.length }}</span>
          </h4>
          <button class="icon-btn" aria-label="新增候选行为" title="新增候选行为" @click="openCandidateCreate">
            <AppIcon name="plus" :size="15" />
          </button>
        </div>
        <p class="pool-hint">未评分的行为先留在这里。点击卡片评分，或直接拖到右侧矩阵。</p>

        <div v-if="unscoredCandidates.length === 0" class="pool-empty">
          <span class="pool-empty-icon"><AppIcon name="check" :size="16" /></span>
          <p>所有候选都已完成评分</p>
          <span>可以拖动矩阵中的卡片调整区域，或继续添加新候选。</span>
        </div>

        <div v-else class="pool-list">
          <article
            v-for="candidate in unscoredCandidates"
            :key="candidate.id"
            class="candidate-card pool-card"
            :class="{ selected: selectedIds.includes(candidate.id) }"
            draggable="true"
            @dragstart="onDragStart(candidate)"
            @click="openScore(candidate)"
          >
            <div class="candidate-top">
              <label class="candidate-check" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(candidate.id)"
                  :aria-label="`选择 ${candidate.title}`"
                  @change="toggleSelection(candidate.id)"
                />
              </label>
              <span class="candidate-title">{{ candidate.title }}</span>
              <span class="score-unrated">未评分</span>
            </div>
            <p v-if="candidate.description" class="candidate-desc">{{ candidate.description }}</p>
            <div class="candidate-meta">
              <span v-if="candidate.directionId" class="direction-tag">
                <span
                  class="direction-dot"
                  :style="{ background: directionMap[candidate.directionId]?.color ?? '#2f6049' }"
                />
                {{ directionMap[candidate.directionId]?.name ?? '未知方向' }}
              </span>
              <span class="badge">{{ behaviorSourceTypeLabels[candidate.sourceType] }}</span>
              <span class="source-object">{{ sourceObjectLabel(candidate) }}</span>
            </div>
            <span class="drag-hint">点击评分 · 可拖入矩阵</span>
          </article>
        </div>
      </aside>

      <section class="matrix-card card">
        <div class="matrix-caption">
          <span class="axis-label-y">Impact 影响力 ↑</span>
          <span class="axis-label-x">Ease 容易程度 →</span>
        </div>

        <div class="matrix-grid">
          <section
            v-for="quadrant in quadrants"
            :key="quadrant.key"
            class="quadrant"
            :class="`quadrant-${quadrant.tone}`"
            @dragover.prevent
            @drop.prevent="dropToQuadrant(quadrant.key)"
          >
            <header class="quadrant-head">
              <div>
                <span class="quadrant-code">{{ quadrant.code }}</span>
                <h4>{{ quadrant.title }}</h4>
              </div>
              <span class="quadrant-count">{{ quadrant.candidates.length }}</span>
            </header>
            <p class="quadrant-sub">{{ quadrant.subtitle }}</p>

            <div v-if="quadrant.candidates.length === 0" class="quadrant-empty">
              <span>把卡片拖到这里，或点击候选评分</span>
            </div>
            <div v-else class="quadrant-list">
              <article
                v-for="candidate in quadrant.candidates"
                :key="candidate.id"
                class="candidate-card"
                :class="[dropoutPreviewClass(candidate), { selected: selectedIds.includes(candidate.id) }]"
                draggable="true"
                @dragstart="onDragStart(candidate)"
                @click="openScore(candidate)"
              >
                <div class="candidate-top">
                  <label class="candidate-check" @click.stop>
                    <input
                      type="checkbox"
                      :checked="selectedIds.includes(candidate.id)"
                      :aria-label="`选择 ${candidate.title}`"
                      @change="toggleSelection(candidate.id)"
                    />
                  </label>
                  <span class="candidate-title">{{ candidate.title }}</span>
                  <span class="candidate-score">
                    I{{ candidate.impact }} · E{{ candidate.ease }}
                  </span>
                </div>
                <div class="candidate-meta">
                  <span v-if="candidate.status === 'DESIGNED'" class="badge badge-accent">已转化为习惯</span>
                  <span v-if="candidate.directionId" class="direction-tag">
                    <span
                      class="direction-dot"
                      :style="{ background: directionMap[candidate.directionId]?.color ?? '#2f6049' }"
                    />
                    {{ directionMap[candidate.directionId]?.name ?? '未知方向' }}
                  </span>
                  <span class="source-object">{{ sourceObjectLabel(candidate) }}</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <footer class="matrix-foot">
          <span><AppIcon name="layers" :size="12" /> 拖拽卡片到其他象限会自动更新评分</span>
          <span><AppIcon name="sliders" :size="12" /> 点击卡片可精确评分</span>
          <span><AppIcon name="check" :size="12" /> 勾选后可批量归档、删除或加入待设计</span>
        </footer>
      </section>
    </div>

    <DetailDrawer
      :open="drawerOpen"
      :title="scoringCandidate?.title ?? '候选行为'"
      :subtitle="scoringCandidate ? behaviorCandidateStatusLabels[scoringCandidate.status] : ''"
      @close="closeScore"
    >
      <div v-if="scoringCandidate" class="score-drawer">
        <p class="score-desc">
          {{ scoringCandidate.description || '还没有补充说明。' }}
        </p>
        <div v-if="scoringCandidate.directionId" class="score-direction">
          <span
            class="direction-dot"
            :style="{ background: directionMap[scoringCandidate.directionId]?.color ?? '#2f6049' }"
          />
          {{ directionMap[scoringCandidate.directionId]?.name ?? '未知方向' }}
        </div>

        <div class="score-block">
          <div class="score-head">
            <span class="field-label">Impact · 对长期方向的影响</span>
            <strong>{{ scoreImpact }}</strong>
          </div>
          <input v-model.number="scoreImpact" type="range" min="1" max="5" step="1" class="slider" />
          <div class="score-scale"><span>低</span><span>高</span></div>
        </div>

        <div class="score-block">
          <div class="score-head">
            <span class="field-label">Ease · 当前条件下执行的容易程度</span>
            <strong>{{ scoreEase }}</strong>
          </div>
          <input v-model.number="scoreEase" type="range" min="1" max="5" step="1" class="slider" />
          <div class="score-scale"><span>难</span><span>容易</span></div>
        </div>

        <div class="score-preview" :class="`score-${scorePreview.tone}`">
          <span class="score-preview-dot" />
          {{ scorePreview.label }}
        </div>

        <p class="score-note">
          先判断影响力，再判断在当前条件下是否容易执行。不要用“应该做”代替可行性。
        </p>

        <div v-if="scoringCandidate.note" class="score-note-box">
          {{ scoringCandidate.note }}
        </div>
      </div>

      <template #footer>
        <div v-if="scoringCandidate" class="drawer-actions">
          <button
            class="btn btn-sm btn-ghost drawer-archive"
            @click="handleArchiveCandidate(scoringCandidate)"
          >
            {{ scoringCandidate.status === 'ARCHIVED' ? '恢复候选' : '归档候选' }}
          </button>
          <button class="btn btn-sm btn-secondary" @click="openCandidateEdit(scoringCandidate)">
            编辑信息
          </button>
          <button class="btn btn-sm btn-secondary" @click="saveScore">
            保存评分
          </button>
          <button
            v-if="scoringCandidate.status !== 'DESIGNED'"
            class="btn btn-sm btn-primary"
            @click="openDesigner(scoringCandidate)"
          >
            进入行为设计
          </button>
        </div>
      </template>
    </DetailDrawer>

    <ModalDialog
      :open="candidateModalOpen"
      :title="candidateEditingId ? '编辑候选行为' : '新增候选行为'"
      subtitle="候选行为只是待评估选项。先描述它，再评估 Impact 与 Ease。"
      @close="candidateModalOpen = false"
    >
      <form class="form" @submit.prevent="submitCandidate">
        <div class="field">
          <label class="field-label" for="candidate-title">候选行为</label>
          <input
            id="candidate-title"
            v-model="candidateForm.title"
            class="input"
            placeholder="例如：每天阅读论文 5 分钟"
          />
        </div>
        <div class="field">
          <label class="field-label" for="candidate-desc">说明</label>
          <textarea
            id="candidate-desc"
            v-model="candidateForm.description"
            class="textarea"
            placeholder="这个行为具体做什么？为什么值得考虑？"
          />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="candidate-source">来源类型</label>
            <select id="candidate-source" v-model="candidateForm.sourceType" class="select">
              <option
                v-for="type in candidateSourceOptions"
                :key="type"
                :value="type"
              >
                {{ behaviorSourceTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="candidate-direction">关联方向</label>
            <select id="candidate-direction" v-model="candidateForm.directionId" class="select">
              <option value="">不关联方向</option>
              <option v-for="direction in directionOptions" :key="direction.id" :value="direction.id">
                {{ direction.name }}
              </option>
            </select>
          </div>
        </div>
        <div v-if="candidateForm.sourceType === BehaviorSourceType.GOAL" class="field">
          <label class="field-label" for="candidate-goal-source">来源目标</label>
          <select id="candidate-goal-source" v-model="candidateForm.sourceId" class="select">
            <option value="">请选择目标</option>
            <option v-for="goal in goals.filter((row) => !row.archivedAt)" :key="goal.id" :value="goal.id">
              {{ goal.title }}
            </option>
          </select>
        </div>
        <div v-if="candidateForm.sourceType === BehaviorSourceType.TASK" class="field">
          <label class="field-label" for="candidate-task-source">来源任务</label>
          <select id="candidate-task-source" v-model="candidateForm.sourceId" class="select">
            <option value="">请选择任务</option>
            <option v-for="task in tasks.filter((row) => !row.archivedAt)" :key="task.id" :value="task.id">
              {{ task.title }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="candidate-note">备注</label>
          <input id="candidate-note" v-model="candidateForm.note" class="input" placeholder="可选" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="candidateModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : candidateEditingId ? '保存修改' : '添加候选' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="designerOpen"
      title="Behavior Designer"
      :subtitle="designerCandidate ? `第 ${designerStep} / 3 步 · ${designerCandidate.title}` : ''"
      size="lg"
      @close="designerOpen = false"
    >
      <div class="designer">
        <div class="designer-steps">
          <span class="designer-step" :class="{ active: designerStep === 1, done: designerStep > 1 }">
            <span>1</span> Prompt
          </span>
          <span class="designer-line" />
          <span class="designer-step" :class="{ active: designerStep === 2, done: designerStep > 2 }">
            <span>2</span> Tiny
          </span>
          <span class="designer-line" />
          <span class="designer-step" :class="{ active: designerStep === 3, done: designerStep > 3 }">
            <span>3</span> Celebration
          </span>
        </div>

        <div v-if="designerStep === 1" class="designer-section">
          <div class="designer-copy">
            <h4>Prompt · 找到锚点</h4>
            <p>在什么已有行为之后提醒自己？固定时间往往不如已有事件稳定。</p>
          </div>
          <div class="field">
            <label class="field-label" for="designer-name">习惯名称</label>
            <input id="designer-name" v-model="designerForm.name" class="input" />
          </div>
          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="designer-anchor-type">锚点类型</label>
              <select id="designer-anchor-type" v-model="designerForm.anchorType" class="select">
                <option v-for="type in AnchorType" :key="type" :value="type">
                  {{ anchorTypeLabels[type] }}
                </option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="designer-anchor">锚点描述</label>
              <input
                id="designer-anchor"
                v-model="designerForm.anchorDescription"
                class="input"
                placeholder="例如：每天早上坐到书桌前"
              />
            </div>
          </div>
          <p class="designer-hint">
            常用锚点：打开电脑、坐到书桌前、吃完晚饭、关灯前、打开学习工作台。
          </p>
        </div>

        <div v-else-if="designerStep === 2" class="designer-section">
          <div class="designer-copy">
            <h4>Tiny Behavior · 把行为缩小</h4>
            <p>小到即使状态不好也能完成。微行为不是任务目标，而是启动动作。</p>
          </div>
          <div class="field">
            <label class="field-label" for="designer-tiny">微行为</label>
            <input
              id="designer-tiny"
              v-model="designerForm.tinyBehavior"
              class="input"
              placeholder="例如：打开论文阅读一个自然段"
            />
          </div>
          <div class="field">
            <label class="field-label" for="designer-ability">当前容易程度</label>
            <select id="designer-ability" v-model.number="designerForm.abilityLevel" class="select">
              <option :value="1">1 · 非常难</option>
              <option :value="2">2 · 偏难</option>
              <option :value="3">3 · 一般</option>
              <option :value="4">4 · 容易</option>
              <option :value="5">5 · 非常容易</option>
            </select>
          </div>
          <div class="designer-tip">
            <AppIcon name="warning" :size="14" />
            如果这个行为仍需要意志力才能开始，继续缩小：读一段、写一行、打开文件一次。
          </div>
        </div>

        <div v-else class="designer-section">
          <div class="designer-copy">
            <h4>Celebration · 立即庆祝</h4>
            <p>完成后立刻给自己积极反馈，让大脑更愿意重复这个行为。</p>
          </div>
          <div class="field">
            <label class="field-label" for="designer-celebration">庆祝方式</label>
            <input
              id="designer-celebration"
              v-model="designerForm.celebration"
              class="input"
              placeholder="对自己说：很好，我已经开始了。"
            />
          </div>
          <div class="form-grid form-grid-3">
            <div class="field">
              <label class="field-label" for="designer-motivation">动机自评</label>
              <select id="designer-motivation" v-model.number="designerForm.motivationLevel" class="select">
                <option v-for="value in [1, 2, 3, 4, 5]" :key="value" :value="value">
                  {{ value }} / 5
                </option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="designer-prompt">提示状态</label>
              <select id="designer-prompt" v-model="designerForm.promptStatus" class="select">
                <option v-for="status in PromptStatus" :key="status" :value="status">
                  {{ promptStatusLabels[status] }}
                </option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="designer-frequency">频率</label>
              <input id="designer-frequency" v-model="designerForm.frequency" class="input" />
            </div>
          </div>
          <div class="recipe-preview">
            <span class="preview-label">行为配方预览</span>
            <p>{{ designerPreview }}</p>
          </div>
          <button type="button" class="btn btn-sm btn-secondary designer-test" @click="testRecipe">
            <AppIcon name="check" :size="13" />
            模拟检查一次
          </button>
        </div>

        <p v-if="designerError" class="form-error">{{ designerError }}</p>

        <div class="modal-actions designer-actions">
          <button v-if="designerStep > 1" type="button" class="btn btn-secondary" @click="prevDesignerStep">
            上一步
          </button>
          <button
            v-if="designerStep < 3"
            type="button"
            class="btn btn-primary"
            @click="nextDesignerStep"
          >
            下一步
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="creatingHabit"
            @click="createHabitFromCandidate"
          >
            {{ creatingHabit ? '创建中…' : '创建习惯' }}
          </button>
        </div>
      </div>
    </ModalDialog>
  </div>

  <ModalDialog
    :open="deleteConfirmOpen"
    title="删除候选行为"
    subtitle="删除后无法恢复。已经设计为习惯的候选会自动跳过，建议改为归档。"
    @close="deleteConfirmOpen = false"
  >
    <div class="delete-confirm">
      <p>将删除当前选中的 {{ selectedIds.length }} 个候选。此操作不会影响已有的习惯和历史记录。</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="deleteConfirmOpen = false">取消</button>
        <button class="btn btn-danger" :disabled="batchBusy" @click="runBatchDelete">
          {{ batchBusy ? '删除中…' : '确认删除' }}
        </button>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.focus-map {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.focus-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(100% 140% at 0% 0%, color-mix(in srgb, var(--accent) 7.5%, transparent), transparent 55%),
    var(--surface);
}

.focus-intro h3 {
  margin-top: 5px;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
}

.focus-intro p:last-child {
  max-width: 620px;
  margin-top: 6px;
  color: var(--ink-faint);
  font-size: 11.5px;
  line-height: 1.75;
}

.focus-stats {
  display: flex;
  gap: 8px;
  flex: none;
}

.focus-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 74px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.focus-stat strong {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.2;
}

.focus-stat span {
  color: var(--muted);
  font-size: 8.5px;
  white-space: nowrap;
}

.focus-stat-golden {
  background: var(--amber-soft);
}

.focus-stat-golden strong {
  color: var(--amber);
}

.focus-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 12px;
  flex-wrap: wrap;
}

.focus-filters {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.filter-select {
  width: auto;
  min-width: 132px;
  height: 33px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 11px;
}

.filter-hint {
  color: var(--muted);
  font-size: 9.5px;
}

.focus-loading {
  height: 420px;
}

.focus-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.candidate-pool {
  padding: 15px;
  position: sticky;
  top: calc(var(--topbar-height) + 18px);
}

.pool-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.count-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 9px;
}

.pool-hint {
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.pool-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 24px 12px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  text-align: center;
}

.pool-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.pool-empty p {
  font-size: 10.5px;
  font-weight: 600;
}

.pool-empty span {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.5;
}

.pool-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.candidate-card {
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
  cursor: grab;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.candidate-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.candidate-card.designed {
  border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  background: var(--accent-faint);
}

.pool-card {
  width: 100%;
}

.candidate-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 7px;
}

.candidate-title {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
}

.score-unrated {
  flex: none;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8px;
}

.candidate-score {
  flex: none;
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--accent);
}

.candidate-desc {
  margin-top: 3px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.candidate-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.direction-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 8.5px;
  color: var(--muted);
}

.direction-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
}

.drag-hint {
  display: block;
  margin-top: 6px;
  color: var(--line-strong);
  font-size: 8px;
}

.matrix-card {
  padding: 14px;
}

.matrix-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 0 4px;
  color: var(--muted);
  font-size: 8.5px;
}

.axis-label-y {
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}

.axis-label-x {
  font-family: var(--font-mono);
}

.matrix-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.quadrant {
  min-height: 190px;
  display: flex;
  flex-direction: column;
  padding: 11px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.quadrant:hover {
  border-color: var(--line-strong);
}

.quadrant-golden {
  border-color: rgba(154, 101, 32, 0.25);
  background:
    radial-gradient(90% 110% at 100% 0%, rgba(154, 101, 32, 0.1), transparent 55%),
    var(--surface);
}

.quadrant-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.quadrant-code {
  font-family: var(--font-mono);
  font-size: 7.5px;
  letter-spacing: 0.1em;
  color: var(--muted);
}

.quadrant-golden .quadrant-code {
  color: var(--amber);
}

.quadrant-head h4 {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
}

.quadrant-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.quadrant-sub {
  margin-top: 1px;
  color: var(--muted);
  font-size: 8.5px;
}

.quadrant-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.quadrant-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  margin-top: 8px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--line-strong);
  font-size: 8.5px;
  text-align: center;
}

.matrix-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--line-faint);
  color: var(--muted);
  font-size: 8.5px;
}

.matrix-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.score-drawer {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.score-desc {
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.score-direction {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 10px;
}

.score-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.score-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.score-head strong {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent);
}

.slider {
  width: 100%;
  accent-color: var(--accent);
}

.score-scale {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-size: 8.5px;
}

.score-preview {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  font-size: 11px;
  font-weight: 600;
}

.score-preview-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}

.score-golden {
  background: var(--amber-soft);
  color: var(--amber-ink);
}

.score-golden .score-preview-dot {
  background: var(--amber);
}

.score-note {
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.65;
}

.score-note-box {
  padding: 9px 11px;
  border-left: 2px solid var(--amber);
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 9.5px;
  line-height: 1.65;
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.drawer-archive {
  margin-right: auto;
  color: var(--muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
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

.designer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.designer-steps {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-faint);
}

.designer-step {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 9.5px;
}

.designer-step > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-muted);
  font-family: var(--font-mono);
  font-size: 8px;
}

.designer-step.active {
  color: var(--accent-ink);
  font-weight: 600;
}

.designer-step.active > span {
  background: var(--accent);
  color: var(--on-accent);
}

.designer-step.done > span {
  background: var(--accent-soft);
  color: var(--accent);
}

.designer-line {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.designer-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.designer-copy h4 {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
}

.designer-copy p {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.65;
}

.designer-hint {
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.6;
}

.designer-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--amber-soft);
  color: var(--amber-ink);
  font-size: 9.5px;
  line-height: 1.6;
}

.designer-tip .icon {
  flex: none;
  margin-top: 1px;
}

.recipe-preview {
  padding: 12px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
}

.preview-label {
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

.recipe-preview p {
  margin-top: 3px;
  font-family: var(--font-serif);
  font-size: 12.5px;
  line-height: 1.7;
}

.designer-test {
  align-self: flex-start;
}

.designer-actions {
  justify-content: flex-end;
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-color: color-mix(in srgb, var(--danger) 24%, var(--line-faint));
  background: color-mix(in srgb, var(--danger) 4%, var(--surface));
  flex-wrap: wrap;
}

.batch-bar > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.batch-bar strong {
  font-size: 11px;
}

.batch-bar span {
  color: var(--muted);
  font-size: 9px;
}

.batch-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.candidate-card.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.candidate-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
}

.candidate-check input {
  width: 13px;
  height: 13px;
  accent-color: var(--accent);
}

.candidate-top .candidate-title {
  flex: 1;
}

.source-object {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 8.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-confirm p {
  margin-bottom: 16px;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1000px) {
  .focus-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .candidate-pool {
    position: static;
  }

  .pool-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .focus-intro {
    flex-direction: column;
    align-items: flex-start;
  }

  .focus-stats {
    width: 100%;
  }

  .focus-stat {
    flex: 1;
  }

  .matrix-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid,
  .form-grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 520px) {
  .pool-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .focus-stats {
    flex-wrap: wrap;
  }
}
</style>