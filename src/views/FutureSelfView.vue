<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import IdentityCapabilityTree from '@/components/IdentityCapabilityTree.vue'
import { useToast } from '@/composables/useToast'
import {
  useFutureSelf,
  type FutureSelfKind,
  type IdentityInput,
  type DirectionInput,
} from '@/composables/useFutureSelf'
import {
  DirectionStatus,
  VisionStatus,
  directionStatusLabels,
  visionStatusLabels,
  type Direction,
  type Identity,
  type Vision,
} from '@/domain'
import { formatDate, formatDuration, fromDateInput, relativeDay, toDateInput } from '@/utils/date'

const { success, error: toastError } = useToast()
const route = useRoute()
const router = useRouter()

const {
  loading,
  error,
  selectedVision,
  selectedVisionId,
  visibleVisions,
  selectedIdentities,
  activeVisions,
  activeDirectionCount,
  activeIdentityCount,
  weeklyBudgetMinutes,
  archivedVisionCount,
  includeArchived,
  countDirections,
  countIdentities,
  defaultIdentityId,
  directionsForIdentity,
  capabilityTreeForIdentity,
  capabilityCountForIdentity,
  goalCountForIdentity,
  refresh,
  saveVision,
  saveIdentity,
  saveDirection,
  setArchived,
} = useFutureSelf()

interface VisionForm {
  title: string
  description: string
  timeHorizon: string
  lifeArea: string
  motivation: string
  successCriteria: string
  status: VisionStatus
  reviewDate: string
}

interface IdentityForm {
  title: string
  description: string
  identityStatement: string
}

interface DirectionForm {
  identityId: string
  name: string
  description: string
  priority: number
  startDate: string
  targetDate: string
  weeklyHours: number
  status: DirectionStatus
  color: string
  reviewFrequency: string
}

function emptyVisionForm(): VisionForm {
  return {
    title: '',
    description: '',
    timeHorizon: '',
    lifeArea: '学业与职业',
    motivation: '',
    successCriteria: '',
    status: VisionStatus.ACTIVE,
    reviewDate: '',
  }
}

function emptyIdentityForm(): IdentityForm {
  return { title: '', description: '', identityStatement: '' }
}

function emptyDirectionForm(): DirectionForm {
  return {
    identityId: '',
    name: '',
    description: '',
    priority: 1,
    startDate: '',
    targetDate: '',
    weeklyHours: 8,
    status: DirectionStatus.ACTIVE,
    color: '#3563e9',
    reviewFrequency: '每两周',
  }
}

const visionForm = reactive<VisionForm>(emptyVisionForm())
const identityForm = reactive<IdentityForm>(emptyIdentityForm())
const directionForm = reactive<DirectionForm>(emptyDirectionForm())

const modalKind = ref<'vision' | 'identity' | 'direction' | null>(null)
const editingId = ref<string | null>(null)
const formError = ref('')
const saving = ref(false)

const visionStatuses = [
  VisionStatus.DRAFT,
  VisionStatus.ACTIVE,
  VisionStatus.ADJUSTING,
  VisionStatus.COMPLETED,
]

const directionStatuses = [
  DirectionStatus.PLANNED,
  DirectionStatus.ACTIVE,
  DirectionStatus.PAUSED,
  DirectionStatus.COMPLETED,
]

const priorityOptions = [
  { value: 1, label: '主方向' },
  { value: 2, label: '重要方向' },
  { value: 3, label: '探索方向' },
]

const colorOptions = ['#3563e9', '#b26a1f', '#6b58b8', '#c04a3f', '#2f9d6b', '#5f6b80']

const selectedIdentityId = ref<string | null>(null)
const capabilityTreeExpanded = ref(true)
const capabilityTreeAllCollapsed = ref(false)
const capabilityTreeRevision = ref(0)

const selectedIdentity = computed(
  () =>
    selectedIdentities.value.find((identity) => identity.id === selectedIdentityId.value) ??
    null,
)

const identityDirections = computed(() =>
  selectedIdentity.value ? directionsForIdentity(selectedIdentity.value.id) : [],
)

const identityCapabilities = computed(() =>
  selectedIdentity.value ? capabilityTreeForIdentity(selectedIdentity.value.id) : [],
)

const identityCapabilityCount = computed(() =>
  selectedIdentity.value ? capabilityCountForIdentity(selectedIdentity.value.id) : 0,
)

const identityGoalCount = computed(() =>
  selectedIdentity.value ? goalCountForIdentity(selectedIdentity.value.id) : 0,
)

watch(
  () => selectedIdentities.value.map((identity) => identity.id).join('|'),
  () => {
    const identities = selectedIdentities.value
    if (
      !selectedIdentityId.value ||
      !identities.some((identity) => identity.id === selectedIdentityId.value)
    ) {
      selectedIdentityId.value = identities[0]?.id ?? null
    }
  },
  { immediate: true },
)

function selectIdentity(identityId: string): void {
  selectedIdentityId.value = identityId
  capabilityTreeAllCollapsed.value = false
  capabilityTreeRevision.value += 1
}

function openRoadmapForDirection(directionId: string): void {
  void router.push({ path: '/roadmap', query: { direction: directionId } })
}

function openGoalsForCompetency(competencyId: string): void {
  void router.push({ path: '/goals', query: { competency: competencyId } })
}

function toggleCapabilityTree(): void {
  capabilityTreeExpanded.value = !capabilityTreeExpanded.value
}

function toggleAllCapabilityNodes(): void {
  capabilityTreeAllCollapsed.value = !capabilityTreeAllCollapsed.value
  capabilityTreeRevision.value += 1
}

const modalTitle = computed(() => {
  if (modalKind.value === 'vision') return editingId.value ? '编辑未来愿景' : '创建未来愿景'
  if (modalKind.value === 'identity') return editingId.value ? '编辑未来身份' : '添加未来身份'
  if (modalKind.value === 'direction') return editingId.value ? '编辑发展方向' : '添加发展方向'
  return ''
})

const modalSubtitle = computed(() => {
  if (modalKind.value === 'vision') {
    return '愿景描述长期方向，不应被日常任务频繁修改。'
  }
  if (modalKind.value === 'identity') {
    return '身份是未来希望承担的角色，一个愿景可以对应多个身份。'
  }
  if (modalKind.value === 'direction') {
    return '方向归属一个未来身份，用来组织能力、训练重点与路线视图。'
  }
  return ''
})

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{
  kind: FutureSelfKind
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
  if (target.archived) {
    return `将恢复「${target.label}」，它会重新出现在默认列表中。`
  }
  return `将归档「${target.label}」。不会删除关联的身份、方向或历史记录，归档后可以随时恢复。`
})

function selectVision(vision: Vision): void {
  selectedIdentityId.value = null
  selectedVisionId.value = vision.id
  capabilityTreeExpanded.value = true
  capabilityTreeAllCollapsed.value = false
  capabilityTreeRevision.value += 1
}

function selectVisionById(visionId: string): void {
  const vision = visibleVisions.value.find((item) => item.id === visionId)
  if (vision) selectVision(vision)
}

function resetModal(): void {
  modalKind.value = null
  editingId.value = null
  formError.value = ''
}

function openVisionCreate(): void {
  editingId.value = null
  Object.assign(visionForm, emptyVisionForm())
  formError.value = ''
  modalKind.value = 'vision'
}

function openVisionEdit(vision: Vision): void {
  editingId.value = vision.id
  Object.assign(visionForm, {
    title: vision.title,
    description: vision.description,
    timeHorizon: toDateInput(vision.timeHorizon),
    lifeArea: vision.lifeArea,
    motivation: vision.motivation,
    successCriteria: vision.successCriteria,
    status: vision.status,
    reviewDate: toDateInput(vision.reviewDate),
  })
  formError.value = ''
  modalKind.value = 'vision'
}

function openIdentityCreate(): void {
  if (!selectedVision.value) return
  editingId.value = null
  Object.assign(identityForm, emptyIdentityForm())
  formError.value = ''
  modalKind.value = 'identity'
}

function openIdentityEdit(identity: Identity): void {
  editingId.value = identity.id
  Object.assign(identityForm, {
    title: identity.title,
    description: identity.description,
    identityStatement: identity.identityStatement,
  })
  formError.value = ''
  modalKind.value = 'identity'
}

function openDirectionCreate(identityId?: string): void {
  if (!selectedVision.value) return
  const targetIdentityId = identityId ?? selectedIdentityId.value ?? defaultIdentityId.value
  if (!targetIdentityId) {
    toastError('请先添加一个未来身份，再创建发展方向')
    return
  }
  editingId.value = null
  Object.assign(directionForm, emptyDirectionForm(), { identityId: targetIdentityId })
  formError.value = ''
  modalKind.value = 'direction'
}

function openDirectionEdit(direction: Direction): void {
  editingId.value = direction.id
  Object.assign(directionForm, {
    identityId: direction.identityId ?? defaultIdentityId.value ?? '',
    name: direction.name,
    description: direction.description,
    priority: direction.priority,
    startDate: toDateInput(direction.startDate),
    targetDate: toDateInput(direction.targetDate),
    weeklyHours: Math.round((direction.weeklyTimeBudget / 60) * 10) / 10,
    status: direction.status,
    color: direction.color,
    reviewFrequency: direction.reviewFrequency,
  })
  formError.value = ''
  modalKind.value = 'direction'
}

async function submitVision(): Promise<void> {
  formError.value = ''
  if (!visionForm.title.trim()) {
    formError.value = '愿景名称不能为空'
    return
  }
  saving.value = true
  try {
    await saveVision(
      {
        title: visionForm.title.trim(),
        description: visionForm.description.trim(),
        timeHorizon: fromDateInput(visionForm.timeHorizon) ?? '',
        lifeArea: visionForm.lifeArea.trim(),
        motivation: visionForm.motivation.trim(),
        successCriteria: visionForm.successCriteria.trim(),
        status: visionForm.status,
        reviewDate: fromDateInput(visionForm.reviewDate),
      },
      editingId.value ?? undefined,
    )
    const created = !editingId.value
    resetModal()
    success(created ? '愿景已创建' : '愿景已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

async function submitIdentity(): Promise<void> {
  formError.value = ''
  const vision = selectedVision.value
  if (!vision) {
    formError.value = '请先选择一个愿景'
    return
  }
  if (!identityForm.title.trim()) {
    formError.value = '身份名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: IdentityInput = {
      visionId: vision.id,
      title: identityForm.title.trim(),
      description: identityForm.description.trim(),
      identityStatement: identityForm.identityStatement.trim(),
    }
    const entity = await saveIdentity(payload, editingId.value ?? undefined)
    const created = !editingId.value
    if (created) selectedIdentityId.value = entity.id
    resetModal()
    success(created ? '未来身份已添加' : '未来身份已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

async function submitDirection(): Promise<void> {
  formError.value = ''
  const vision = selectedVision.value
  if (!vision) {
    formError.value = '请先选择一个愿景'
    return
  }
  if (!directionForm.identityId) {
    formError.value = '请选择这个方向所属的未来身份'
    return
  }
  if (!selectedIdentities.value.some((identity) => identity.id === directionForm.identityId)) {
    formError.value = '所属未来身份不存在或已归档'
    return
  }
  if (!directionForm.name.trim()) {
    formError.value = '方向名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: DirectionInput = {
      visionId: vision.id,
      identityId: directionForm.identityId,
      name: directionForm.name.trim(),
      description: directionForm.description.trim(),
      priority: Number(directionForm.priority),
      startDate: fromDateInput(directionForm.startDate),
      targetDate: fromDateInput(directionForm.targetDate),
      weeklyTimeBudget: Math.max(0, Math.round(Number(directionForm.weeklyHours || 0) * 60)),
      status: directionForm.status,
      color: directionForm.color,
      reviewFrequency: directionForm.reviewFrequency.trim(),
    }
    await saveDirection(payload, editingId.value ?? undefined)
    const created = !editingId.value
    resetModal()
    success(created ? '发展方向已添加' : '发展方向已更新')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

function askToggle(
  kind: FutureSelfKind,
  id: string,
  label: string,
  archivedAt: string | null,
): void {
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
  await refresh()
  if (String(route.query.create ?? '') === 'vision') {
    openVisionCreate()
    await router.replace('/future-self')
  }
})

</script>

<template>
  <div class="page future-self">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">方向与路线 · 愿景与身份</p>
        <h2 class="page-title">未来自我</h2>
        <p class="page-subtitle">
          愿景定义长期方向，身份提供能力树的结构。具体能力在发展路线中维护，再进入目标拆解成为可执行任务。
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-ghost"
          :class="{ 'is-on': includeArchived }"
          :aria-pressed="includeArchived"
          @click="includeArchived = !includeArchived"
        >
          <AppIcon name="archive" :size="15" />
          {{ includeArchived ? '隐藏已归档' : '显示已归档' }}
          <span v-if="archivedVisionCount" class="archive-count">{{ archivedVisionCount }}</span>
        </button>
        <button class="btn btn-primary" @click="openVisionCreate">
          <AppIcon name="plus" :size="15" />
          新建愿景
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="future-stats">
      <div class="future-stat">
        <span class="future-stat-icon"><AppIcon name="compass" :size="16" /></span>
        <div>
          <span class="future-stat-value">{{ activeVisions.length }}</span>
          <span class="future-stat-label">愿景</span>
        </div>
      </div>
      <div class="future-stat">
        <span class="future-stat-icon icon-amber"><AppIcon name="map" :size="16" /></span>
        <div>
          <span class="future-stat-value">{{ activeDirectionCount }}</span>
          <span class="future-stat-label">活跃方向</span>
        </div>
      </div>
      <div class="future-stat">
        <span class="future-stat-icon icon-violet"><AppIcon name="layers" :size="16" /></span>
        <div>
          <span class="future-stat-value">{{ activeIdentityCount }}</span>
          <span class="future-stat-label">未来身份</span>
        </div>
      </div>
      <div class="future-stat">
        <span class="future-stat-icon icon-blue"><AppIcon name="clock" :size="16" /></span>
        <div>
          <span class="future-stat-value future-stat-text">{{ formatDuration(weeklyBudgetMinutes) }}</span>
          <span class="future-stat-label">每周方向预算</span>
        </div>
      </div>
    </section>

    <div v-if="loading" class="future-layout">
      <div class="skeleton future-detail-skeleton" />
    </div>

    <div v-else-if="visibleVisions.length === 0" class="future-empty card">
      <span class="empty-mark"><AppIcon name="compass" :size="26" /></span>
      <p class="page-eyebrow">From vision to action</p>
      <h3>从一个你愿意长期靠近的方向开始</h3>
      <p>
        不需要写成口号。写下你想成为怎样的人、为什么重要，以及怎样判断自己正在接近它。
        第一版会把愿景、身份和方向分开保存，后续能力地图与目标都会引用它们。
      </p>
      <div class="empty-actions">
        <button class="btn btn-primary" @click="openVisionCreate">
          <AppIcon name="plus" :size="15" />
          创建第一个愿景
        </button>
        <button
          v-if="archivedVisionCount"
          class="btn btn-secondary"
          @click="includeArchived = true"
        >
          <AppIcon name="archive" :size="15" />
          查看已归档
        </button>
      </div>
      <p class="empty-hint">
        也可以先在「设置与数据」载入演示数据，查看完整结构。
      </p>
    </div>

    <div v-else class="future-layout">
      <section v-if="selectedVision" class="vision-detail">
        <article class="card vision-head">
          <div class="vision-head-top">
            <div class="vision-selector-block">
              <label class="vision-selector-label" for="vision-select">
                FUTURE VISION
                <span>{{ visionStatusLabels[selectedVision.status] }}</span>
              </label>
              <div class="vision-select-wrap">
                <AppIcon name="compass" :size="16" />
                <select
                  id="vision-select"
                  class="vision-select"
                  aria-label="选择未来愿景"
                  :value="selectedVision.id"
                  @change="selectVisionById(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="vision in visibleVisions" :key="vision.id" :value="vision.id">
                    {{ vision.title }} · {{ countDirections(vision.id) }} 个方向 ·
                    {{ countIdentities(vision.id) }} 个身份{{ vision.archivedAt ? '（已归档）' : '' }}
                  </option>
                </select>
                <AppIcon name="arrow-right" :size="14" class="vision-select-arrow" />
              </div>
            </div>
            <div class="vision-head-actions">
              <button
                v-if="selectedVision.archivedAt"
                class="btn btn-sm btn-secondary"
                @click="askToggle('vision', selectedVision.id, selectedVision.title, selectedVision.archivedAt)"
              >
                <AppIcon name="archive" :size="14" />
                恢复
              </button>
              <template v-else>
                <button class="btn btn-sm btn-secondary" @click="openVisionEdit(selectedVision)">
                  <AppIcon name="sliders" :size="14" />
                  编辑
                </button>
                <button
                  class="btn btn-sm btn-ghost"
                  title="归档愿景"
                  @click="askToggle('vision', selectedVision.id, selectedVision.title, selectedVision.archivedAt)"
                >
                  <AppIcon name="archive" :size="14" />
                </button>
              </template>
            </div>
          </div>

          <h3 class="vision-title">{{ selectedVision.title }}</h3>

          <div class="vision-meta">
            <span class="badge badge-accent">{{ selectedVision.lifeArea || '未设置领域' }}</span>
            <span class="badge">{{ formatDate(selectedVision.timeHorizon) }}</span>
            <span class="badge">
              下次审视 · {{ relativeDay(selectedVision.reviewDate) }}
            </span>
            <span v-if="selectedVision.archivedAt" class="badge badge-amber">已归档</span>
          </div>

          <p class="vision-description">
            {{ selectedVision.description || '还没有写愿景描述。可以补上未来想成为的样子，以及这条路径为什么重要。' }}
          </p>

          <div class="vision-notes">
            <div class="vision-note">
              <span class="note-label">
                <AppIcon name="flag" :size="13" />
                如何判断正在实现
              </span>
              <p>{{ selectedVision.successCriteria || '还没有设置成功标准。' }}</p>
            </div>
            <div class="vision-note">
              <span class="note-label">
                <AppIcon name="bulb" :size="13" />
                内在动机
              </span>
              <p>{{ selectedVision.motivation || '还没有记录动机。季度复盘时可以重新回看这里。' }}</p>
            </div>
          </div>
        </article>

        <article class="card identity-map-card">
          <div class="section-head identity-map-head">
            <div>
              <h3 class="section-title">
                <AppIcon name="layers" :size="17" />
                身份能力树
              </h3>
              <p class="section-note">
                以未来身份为根查看能力地图；在发展路线中维护能力归属，在目标拆解中把能力变成成果与任务。
              </p>
            </div>
            <div class="identity-map-actions">
              <button
                v-if="!selectedVision.archivedAt"
                class="btn btn-sm btn-secondary"
                @click="openIdentityCreate"
              >
                <AppIcon name="plus" :size="14" />
                添加身份
              </button>
              <button
                v-if="!selectedVision.archivedAt"
                class="btn btn-sm btn-ghost"
                :disabled="!selectedIdentity"
                @click="selectedIdentity && openDirectionCreate(selectedIdentity.id)"
              >
                <AppIcon name="plus" :size="14" />
                添加方向
              </button>
              <button
                v-if="selectedIdentities.length"
                class="btn btn-sm btn-ghost"
                :aria-expanded="capabilityTreeExpanded"
                @click="toggleCapabilityTree"
              >
                <AppIcon
                  name="arrow-right"
                  :size="14"
                  :class="{ 'tree-head-chevron-expanded': capabilityTreeExpanded }"
                />
                {{ capabilityTreeExpanded ? '收起能力树' : '展开能力树' }}
              </button>
            </div>
          </div>

          <div v-if="selectedIdentities.length === 0" class="capability-empty-state">
            <span class="capability-empty-icon">
              <AppIcon name="compass" :size="24" />
            </span>
            <div>
              <h4>先选择一个未来身份</h4>
              <p>
                身份是能力树的根节点。例如“软硬件全栈工程师”，再向下拆解需要掌握的工程能力与实践能力。
              </p>
            </div>
            <button
              v-if="!selectedVision.archivedAt"
              class="btn btn-sm btn-primary"
              @click="openIdentityCreate"
            >
              添加第一个身份
            </button>
          </div>

          <template v-else>
            <div class="identity-switcher" role="tablist" aria-label="切换未来身份">
              <button
                v-for="identity in selectedIdentities"
                :key="identity.id"
                type="button"
                class="identity-tab"
                :class="{ active: identity.id === selectedIdentityId }"
                role="tab"
                :aria-selected="identity.id === selectedIdentityId"
                @click="selectIdentity(identity.id)"
              >
                <span class="identity-tab-avatar">{{ identity.title.slice(0, 1) }}</span>
                <span class="identity-tab-copy">
                  <span class="identity-tab-name">{{ identity.title }}</span>
                  <span class="identity-tab-meta">
                    {{ directionsForIdentity(identity.id).length }} 个方向
                  </span>
                </span>
                <span v-if="identity.archivedAt" class="badge">已归档</span>
              </button>
            </div>

            <div
              v-if="selectedIdentity"
              v-show="capabilityTreeExpanded"
              class="identity-tree-body"
            >
              <section class="identity-root">
                <div class="identity-root-mark">
                  <span class="identity-root-avatar">{{ selectedIdentity.title.slice(0, 1) }}</span>
                  <span class="identity-root-line" aria-hidden="true" />
                </div>
                <div class="identity-root-copy">
                  <p class="identity-root-eyebrow">Future Identity · 能力树根节点</p>
                  <div class="identity-root-title-row">
                    <h4>{{ selectedIdentity.title }}</h4>
                    <div class="row-actions identity-root-actions">
                      <button
                        v-if="!selectedIdentity.archivedAt"
                        class="icon-btn"
                        title="编辑身份"
                        aria-label="编辑身份"
                        @click="openIdentityEdit(selectedIdentity)"
                      >
                        <AppIcon name="sliders" :size="15" />
                      </button>
                      <button
                        class="icon-btn"
                        :title="selectedIdentity.archivedAt ? '恢复身份' : '归档身份'"
                        :aria-label="selectedIdentity.archivedAt ? '恢复身份' : '归档身份'"
                        @click="askToggle('identity', selectedIdentity.id, selectedIdentity.title, selectedIdentity.archivedAt)"
                      >
                        <AppIcon
                          :name="selectedIdentity.archivedAt ? 'archive' : 'trash'"
                          :size="14"
                        />
                      </button>
                    </div>
                  </div>
                  <p v-if="selectedIdentity.identityStatement" class="identity-root-statement">
                    “{{ selectedIdentity.identityStatement }}”
                  </p>
                  <p v-if="selectedIdentity.description" class="identity-root-description">
                    {{ selectedIdentity.description }}
                  </p>
                  <div class="identity-root-stats">
                    <span><strong>{{ identityDirections.length }}</strong> 个发展方向</span>
                    <span><strong>{{ identityCapabilities.length }}</strong> 个根能力</span>
                    <span><strong>{{ identityCapabilityCount }}</strong> 个能力节点</span>
                    <span><strong>{{ identityGoalCount }}</strong> 个关联目标</span>
                  </div>
                  <details v-if="identityDirections.length" class="identity-direction-manage">
                    <summary>路线管理</summary>
                    <div class="identity-direction-manage-list">
                      <div
                        v-for="direction in identityDirections"
                        :key="direction.id"
                        class="identity-direction-manage-row"
                      >
                        <button type="button" class="link-btn" @click="openRoadmapForDirection(direction.id)">
                          {{ direction.name }}
                        </button>
                        <div class="row-actions">
                          <button
                            v-if="!direction.archivedAt"
                            class="icon-btn"
                            title="编辑方向"
                            aria-label="编辑方向"
                            @click="openDirectionEdit(direction)"
                          >
                            <AppIcon name="sliders" :size="13" />
                          </button>
                          <button
                            class="icon-btn"
                            :title="direction.archivedAt ? '恢复方向' : '归档方向'"
                            :aria-label="direction.archivedAt ? '恢复方向' : '归档方向'"
                            @click="askToggle('direction', direction.id, direction.name, direction.archivedAt)"
                          >
                            <AppIcon
                              :name="direction.archivedAt ? 'archive' : 'trash'"
                              :size="13"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </section>

              <section class="capability-tree-panel">
                <div class="capability-tree-head">
                  <div>
                    <span class="capability-tree-title">能力拆解</span>
                    <p>大能力可以继续拆成子能力；点击方向回到路线，点击“拆解为目标”进入执行规划。</p>
                  </div>
                  <div class="capability-tree-head-actions">
                    <span class="tree-legend">
                      <span class="legend-line" />
                      实线卡片为已关联方向的能力
                    </span>
                    <button
                      class="btn btn-sm btn-ghost"
                      :disabled="!identityCapabilities.length"
                      @click="toggleAllCapabilityNodes"
                    >
                      {{ capabilityTreeAllCollapsed ? '全部展开' : '全部收起' }}
                    </button>
                  </div>
                </div>

                <ul v-if="identityCapabilities.length" class="capability-tree-root">
                  <IdentityCapabilityTree
                    v-for="node in identityCapabilities"
                    :key="`${node.competency.id}-${capabilityTreeRevision}`"
                    :node="node"
                    :force-collapsed="capabilityTreeAllCollapsed"
                    @view-direction="openRoadmapForDirection"
                    @view-goals="openGoalsForCompetency"
                  />
                </ul>

                <div v-else class="capability-empty-state compact">
                  <span class="capability-empty-icon">
                    <AppIcon name="layers" :size="22" />
                  </span>
                  <div>
                    <h4>
                      {{ identityDirections.length ? '这个身份还没有关联能力' : '先创建一个发展方向' }}
                    </h4>
                    <p v-if="identityDirections.length">
                      到发展路线图的能力地图中新增能力，并把能力关联到该方向，它就会出现在这里。
                    </p>
                    <p v-else>
                      能力通过发展方向进入路线图。创建方向后，就能维护能力树并连接到目标拆解。
                    </p>
                  </div>
                  <button
                    v-if="identityDirections.length"
                    class="btn btn-sm btn-secondary"
                    @click="openRoadmapForDirection(identityDirections[0].id)"
                  >
                    前往能力地图
                    <AppIcon name="arrow-right" :size="14" />
                  </button>
                  <button
                    v-else-if="!selectedVision.archivedAt"
                    class="btn btn-sm btn-secondary"
                    @click="openDirectionCreate(selectedIdentity.id)"
                  >
                    添加发展方向
                  </button>
                </div>
              </section>
            </div>
          </template>
        </article>
      </section>
    </div>

    <ModalDialog
      :open="modalKind === 'vision'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitVision">
        <div class="field">
          <label class="field-label" for="vision-title">愿景名称</label>
          <input
            id="vision-title"
            v-model="visionForm.title"
            class="input"
            placeholder="例如：成为具备独立研究与工程实践能力的技术人才"
          />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="vision-area">生活领域</label>
            <input
              id="vision-area"
              v-model="visionForm.lifeArea"
              class="input"
              placeholder="学业、职业、个人成长"
            />
          </div>
          <div class="field">
            <label class="field-label" for="vision-horizon">期望实现时间</label>
            <input id="vision-horizon" v-model="visionForm.timeHorizon" class="input" type="date" />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="vision-desc">未来想成为的样子</label>
          <textarea
            id="vision-desc"
            v-model="visionForm.description"
            class="textarea"
            placeholder="描述你希望具备的能力、完成的事情，以及想过的生活方式。"
          />
        </div>

        <div class="field">
          <label class="field-label" for="vision-motivation">为什么想实现</label>
          <textarea
            id="vision-motivation"
            v-model="visionForm.motivation"
            class="textarea"
            placeholder="可以从三个角度写：为什么它对我重要？没有外部评价时我是否仍愿意做？最近一次让我感到进步的经历是什么？"
          />
          <span class="field-hint">动机不是一次性答案，季度复盘时可以回来修改。</span>
        </div>

        <div class="field">
          <label class="field-label" for="vision-success">怎样算实现</label>
          <textarea
            id="vision-success"
            v-model="visionForm.successCriteria"
            class="textarea"
            placeholder="写出可观察的判断标准，而不是模糊的口号。"
          />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="vision-status">状态</label>
            <select id="vision-status" v-model="visionForm.status" class="select">
              <option v-for="status in visionStatuses" :key="status" :value="status">
                {{ visionStatusLabels[status] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="vision-review">下次审视日期</label>
            <input id="vision-review" v-model="visionForm.reviewDate" class="input" type="date" />
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '创建愿景' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'identity'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitIdentity">
        <div class="field">
          <label class="field-label" for="identity-title">身份名称</label>
          <input
            id="identity-title"
            v-model="identityForm.title"
            class="input"
            placeholder="例如：软硬件全栈工程师 / 独立研究者"
          />
        </div>
        <div class="field">
          <label class="field-label" for="identity-statement">身份宣言</label>
          <textarea
            id="identity-statement"
            v-model="identityForm.identityStatement"
            class="textarea"
            placeholder="用第一人称写一句：我是一个……的人。"
          />
        </div>
        <div class="field">
          <label class="field-label" for="identity-desc">身份说明</label>
          <textarea
            id="identity-desc"
            v-model="identityForm.description"
            class="textarea"
            placeholder="这个身份意味着什么？它需要哪些能力与行动？"
          />
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加身份' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="modalKind === 'direction'"
      :title="modalTitle"
      :subtitle="modalSubtitle"
      size="lg"
      @close="resetModal"
    >
      <form class="form" @submit.prevent="submitDirection">
        <div class="field">
          <label class="field-label" for="direction-identity">所属未来身份</label>
          <select
            id="direction-identity"
            v-model="directionForm.identityId"
            class="select"
          >
            <option
              v-for="identity in selectedIdentities"
              :key="identity.id"
              :value="identity.id"
            >
              {{ identity.title }}
            </option>
          </select>
          <span class="field-hint">方向会挂在这棵身份能力树下面，并继承到路线图筛选。</span>
        </div>

        <div class="field">
          <label class="field-label" for="direction-name">方向名称</label>
          <input
            id="direction-name"
            v-model="directionForm.name"
            class="input"
            placeholder="例如：软硬件全栈工程 / 研究生学业与科研"
          />
        </div>

        <div class="field">
          <label class="field-label" for="direction-desc">方向描述</label>
          <textarea
            id="direction-desc"
            v-model="directionForm.description"
            class="textarea"
            placeholder="这个方向具体发展什么？与愿景的关系是什么？"
          />
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="direction-priority">优先级</label>
            <select id="direction-priority" v-model.number="directionForm.priority" class="select">
              <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="direction-status">状态</label>
            <select id="direction-status" v-model="directionForm.status" class="select">
              <option v-for="status in directionStatuses" :key="status" :value="status">
                {{ directionStatusLabels[status] }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="direction-start">开始日期</label>
            <input id="direction-start" v-model="directionForm.startDate" class="input" type="date" />
          </div>
          <div class="field">
            <label class="field-label" for="direction-target">预期完成日期</label>
            <input id="direction-target" v-model="directionForm.targetDate" class="input" type="date" />
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="direction-hours">每周时间预算（小时）</label>
            <input
              id="direction-hours"
              v-model.number="directionForm.weeklyHours"
              class="input"
              type="number"
              min="0"
              step="0.5"
            />
            <span class="field-hint">
              {{ formatDuration(Math.round(Number(directionForm.weeklyHours || 0) * 60)) }} / 周
            </span>
          </div>
          <div class="field">
            <label class="field-label" for="direction-review">审视周期</label>
            <input
              id="direction-review"
              v-model="directionForm.reviewFrequency"
              class="input"
              placeholder="每周 / 每两周 / 每月"
            />
          </div>
        </div>

        <div class="field">
          <span class="field-label">方向标识色</span>
          <div class="color-row">
            <button
              v-for="color in colorOptions"
              :key="color"
              type="button"
              class="color-dot"
              :class="{ active: directionForm.color === color }"
              :style="{ '--swatch': color }"
              :aria-label="`选择颜色 ${color}`"
              @click="directionForm.color = color"
            />
            <input v-model="directionForm.color" class="color-input" type="color" aria-label="自定义颜色" />
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resetModal">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加方向' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div v-if="confirmTarget && !confirmTarget.archived" class="alert alert-warning confirm-note">
        <AppIcon name="warning" :size="15" />
        <span>归档只影响当前对象的显示状态，不会级联删除子对象或历史记录。</span>
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

.future-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.future-stat {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.future-stat-icon {
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

.icon-violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.icon-blue {
  background: var(--blue-soft);
  color: var(--blue);
}

.future-stat > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.future-stat-value {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.future-stat-text {
  font-size: 16px;
}

.future-stat-label {
  font-size: 10.5px;
  color: var(--muted);
}

.future-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.future-detail-skeleton {
  height: 520px;
}

.vision-selector-block {
  min-width: 0;
  max-width: 760px;
  flex: 1;
}

.vision-selector-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
}

.vision-selector-label span {
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
}

.vision-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: min(600px, 100%);
  margin-top: 8px;
  color: var(--accent);
}

.vision-select-wrap > .icon:first-child {
  position: absolute;
  left: 14px;
  z-index: 1;
  pointer-events: none;
}

.vision-select {
  width: 100%;
  height: 43px;
  appearance: none;
  padding: 0 42px 0 40px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line));
  border-radius: var(--radius-md);
  outline: none;
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  cursor: pointer;
  box-shadow: var(--shadow-xs);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.vision-select:hover,
.vision-select:focus-visible {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
  box-shadow: 0 0 0 3px var(--accent-faint);
}

.vision-select-arrow {
  position: absolute;
  right: 15px;
  pointer-events: none;
  transform: rotate(90deg);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 550;
}

.link-btn:hover {
  color: var(--accent);
}

.vision-detail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.vision-head {
  padding: 26px 26px 24px;
  background:
    radial-gradient(110% 120% at 100% 0%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 52%),
    var(--surface);
}

.vision-head-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.vision-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vision-title {
  margin-top: 10px;
  max-width: 820px;
  font-family: var(--font-serif);
  font-size: 27px;
  line-height: 1.45;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.vision-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.vision-description {
  margin-top: 14px;
  max-width: 860px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.85;
}

.vision-notes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.vision-note {
  padding: 14px 15px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.note-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.vision-note p {
  margin-top: 6px;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-line;
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

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.row-actions .icon-btn {
  width: 29px;
  height: 29px;
}

.future-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 42px 38px;
  background:
    radial-gradient(90% 120% at 0% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 55%),
    var(--surface);
}

.empty-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.future-empty h3 {
  font-family: var(--font-serif);
  font-size: 23px;
  font-weight: 600;
}

.future-empty > p {
  max-width: 680px;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.8;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.empty-hint {
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--muted);
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

.form-error {
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.color-dot {
  width: 22px;
  height: 22px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 0 1px var(--line);
}

.color-dot.active {
  border-color: var(--surface);
  box-shadow: 0 0 0 2px var(--accent);
}

.color-input {
  width: 34px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--surface);
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-note {
  margin-top: 14px;
}

@media (max-width: 900px) {
  .future-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vision-notes {
    grid-template-columns: minmax(0, 1fr);
  }

  .vision-head-top {
    flex-wrap: wrap;
  }
}

@media (max-width: 620px) {
  .future-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .vision-head {
    padding: 20px;
  }

  .vision-title {
    font-size: 23px;
  }

  .vision-head-top {
    flex-direction: column;
  }

  .vision-selector-block,
  .vision-select-wrap {
    width: 100%;
    max-width: none;
  }

  .future-empty {
    padding: 28px 22px;
  }
}

.identity-map-card {
  position: relative;
  overflow: hidden;
  padding: 26px;
  background:
    radial-gradient(100% 90% at 100% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 52%),
    var(--surface);
}

.identity-map-head {
  align-items: flex-start;
  gap: 20px;
}

.identity-map-head .section-title {
  font-size: 17px;
}

.identity-map-head .section-note {
  max-width: 760px;
  margin-top: 6px;
  color: var(--ink-faint);
  font-size: 13px;
  line-height: 1.7;
}

.identity-map-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  flex-wrap: wrap;
  flex: none;
}

.tree-head-chevron-expanded {
  transform: rotate(90deg);
}

.identity-map-actions .btn .icon {
  transition: transform 0.18s var(--ease-out);
}

.identity-tree-body {
  min-width: 0;
}

.identity-switcher {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding: 6px;
  border: 1px solid var(--line-faint);
  border-radius: 16px;
  background: var(--surface-muted);
}

.identity-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  flex: 1 1 240px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--ink-soft);
  text-align: left;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.identity-tab:hover {
  background: color-mix(in srgb, var(--surface) 72%, transparent);
}

.identity-tab.active {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.identity-tab-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  background: var(--bg-deep);
  color: var(--ink-soft);
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 650;
}

.identity-tab.active .identity-tab-avatar {
  background: var(--accent);
  color: var(--on-accent);
}

.identity-tab-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.identity-tab-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-tab-meta {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.identity-root {
  display: flex;
  align-items: stretch;
  gap: 17px;
  margin-top: 16px;
  padding: 22px 24px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
  border-radius: 18px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 54%),
    var(--surface);
  box-shadow: 0 16px 44px -34px color-mix(in srgb, var(--accent) 60%, transparent);
}

.identity-root-mark {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 10px;
  width: 52px;
  flex: none;
}

.identity-root-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 650;
  box-shadow: 0 0 0 6px var(--accent-faint);
}

.identity-root-line {
  width: 2px;
  min-height: 24px;
  flex: 1;
  border-radius: var(--radius-pill);
  background: linear-gradient(var(--accent), var(--line-strong));
}

.identity-root-copy {
  flex: 1;
  min-width: 0;
}

.identity-root-eyebrow {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.identity-root-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 4px;
}

.identity-root-actions {
  margin-left: 2px;
}

.identity-root-title-row h4 {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.identity-root-statement {
  margin-top: 8px;
  color: var(--accent-ink);
  font-family: var(--font-serif);
  font-size: 15.5px;
  line-height: 1.75;
}

.identity-root-description {
  max-width: 850px;
  margin-top: 6px;
  color: var(--ink-faint);
  font-size: 13.5px;
  line-height: 1.75;
}

.identity-root-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line-faint);
  color: var(--muted);
  font-size: 12.5px;
}

.identity-root-stats strong {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 650;
}

.identity-direction-manage {
  width: fit-content;
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}

.identity-direction-manage summary {
  width: fit-content;
  cursor: pointer;
  color: var(--ink-faint);
  font-weight: 600;
  list-style-position: inside;
}

.identity-direction-manage summary:hover {
  color: var(--accent);
}

.identity-direction-manage-list {
  display: grid;
  gap: 5px;
  min-width: min(420px, 100%);
  margin-top: 8px;
  padding: 7px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.identity-direction-manage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.identity-direction-manage-row .link-btn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-direction-summary {
  position: relative;
  margin: 14px 0 0 52px;
  padding-left: 25px;
}

.identity-direction-summary::before {
  content: '';
  position: absolute;
  top: 17px;
  left: 0;
  width: 17px;
  border-top: 1px solid var(--line-strong);
}

.direction-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.direction-summary-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 650;
}

.direction-summary-title .icon {
  color: var(--accent);
}

.identity-direction-pills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 8px;
}

.identity-direction-item {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 2px 4px 2px 0;
  border: 1px solid color-mix(in srgb, var(--direction-color) 24%, var(--line));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--direction-color) 5%, var(--surface));
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    transform 0.16s ease;
}

.identity-direction-item:hover {
  border-color: var(--direction-color);
  background: color-mix(in srgb, var(--direction-color) 9%, var(--surface));
  transform: translateY(-1px);
}

.identity-direction-pill {
  display: grid;
  flex: 1;
  width: 100%;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 1px 10px;
  padding: 11px 13px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-soft);
  text-align: left;
}

.identity-direction-dot {
  grid-row: 1 / span 2;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--direction-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--direction-color) 12%, transparent);
}

.identity-direction-name {
  grid-column: 2;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.identity-direction-meta {
  grid-column: 2;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.identity-direction-pill > .icon {
  grid-column: 3;
  grid-row: 1 / span 2;
  color: var(--direction-color);
}

.identity-direction-actions {
  opacity: 0.62;
  transition: opacity 0.16s ease;
}

.identity-direction-item:hover .identity-direction-actions,
.identity-direction-actions:focus-within {
  opacity: 1;
}

.direction-summary-empty {
  padding: 13px 14px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.65;
}

.capability-tree-panel {
  position: relative;
  margin: 15px 0 0 52px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-muted) 62%, var(--surface));
}

.capability-tree-panel::before {
  content: '';
  position: absolute;
  top: -15px;
  left: 0;
  height: 15px;
  border-left: 1px solid var(--line-strong);
}

.capability-tree-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.capability-tree-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
}

.capability-tree-title {
  color: var(--ink);
  font-size: 16px;
  font-weight: 650;
}

.capability-tree-head p {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.65;
}

.tree-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding-top: 3px;
  color: var(--muted);
  font-size: 11.5px;
}

.legend-line {
  width: 18px;
  border-top: 1px solid var(--line-strong);
}

.capability-tree-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.capability-empty-state {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 16px;
  padding: 22px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.capability-empty-state.compact {
  margin-top: 16px;
}

.capability-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.capability-empty-state > div {
  flex: 1;
  min-width: 0;
}

.capability-empty-state h4 {
  color: var(--ink);
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 650;
  line-height: 1.45;
}

.capability-empty-state p {
  max-width: 760px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
}

@media (max-width: 1180px) {
  .identity-map-card {
    padding: 23px;
  }

  .identity-direction-pills {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .identity-map-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .identity-map-actions {
    justify-content: flex-start;
  }

  .capability-tree-head-actions {
    justify-content: flex-start;
  }

  .identity-root {
    padding: 19px;
  }

  .identity-direction-summary,
  .capability-tree-panel {
    margin-left: 0;
    padding-left: 0;
  }

  .identity-direction-summary {
    padding-top: 4px;
  }

  .identity-direction-summary::before,
  .capability-tree-panel::before {
    display: none;
  }

  .capability-tree-panel {
    padding: 17px;
  }
}

@media (max-width: 620px) {
  .identity-map-card {
    padding: 16px;
  }

  .identity-switcher {
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .identity-tab {
    min-width: 220px;
    flex: none;
  }

  .identity-root {
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  .identity-root-mark {
    width: 42px;
  }

  .identity-root-avatar {
    width: 42px;
    height: 42px;
    font-size: 18px;
    box-shadow: 0 0 0 4px var(--accent-faint);
  }

  .identity-root-title-row h4 {
    font-size: 21px;
  }

  .identity-root-title-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .identity-root-statement {
    font-size: 14.5px;
  }

  .identity-root-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .capability-tree-head,
  .capability-empty-state {
    align-items: flex-start;
    flex-direction: column;
  }

  .capability-tree-head-actions {
    width: 100%;
  }

  .tree-legend {
    display: none;
  }

  .capability-empty-state {
    padding: 17px;
  }
}
</style>
