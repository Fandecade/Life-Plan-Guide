<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useToast } from '@/composables/useToast'
import {
  nextReviewInterval,
  useLearning,
  type KnowledgeInput,
  type LearningRecordInput,
  type ResourceInput,
  type WorkflowInput,
} from '@/composables/useLearning'
import { WORKFLOW_PRESETS, type WorkflowPreset } from '@/data/learningPresets'
import {
  LearningRecordType,
  MasteryLevel,
  ResourceType,
  ReviewScheduleStatus,
  SessionStatus,
  TaskType,
  learningRecordTypeLabels,
  masteryLevelLabels,
  resourceTypeLabels,
  reviewScheduleStatusLabels,
  sessionStatusLabels,
  taskTypeLabels,
  type KnowledgeItem,
  type LearningRecord,
  type LearningSession,
  type Resource,
  type ReviewSchedule,
  type Workflow,
  type WorkflowStage,
} from '@/domain'
import { addDays, formatDate, formatDateTime, formatDuration, formatShortDate, nowIso, relativeDay, toDateInput } from '@/utils/date'

const { success, error: toastError } = useToast()

const {
  loading,
  error,
  workflows,
  sessions,
  knowledgeItems,
  reviewSchedules,
  resources,
  includeArchived,
  activeWorkflows,
  activeKnowledge,
  activeResources,
  availableTasks,
  activeSession,
  activeWorkflow,
  activeStage,
  activeStageIndex,
  activeSessionRecords,
  activeSessionKnowledgeIds,
  elapsedMinutes,
  taskById,
  workflowById,
  knowledgeById,
  recordsBySession,
  knowledgeIdsBySession,
  dueReviews,
  upcomingReviews,
  completedReviews,
  stats,
  startClock,
  stopClock,
  refresh,
  saveWorkflow,
  setWorkflowArchived,
  startSession,
  setStage,
  finishSession,
  saveRecord,
  syncSessionKnowledge,
  saveKnowledge,
  setKnowledgeArchived,
  saveReviewSchedule,
  completeReview,
  skipReview,
  saveResource,
  setResourceArchived,
} = useLearning()

type LearningView = 'workbench' | 'workflows' | 'knowledge' | 'reviews' | 'resources'
const activeView = ref<LearningView>('workbench')

const recordTypes = Object.values(LearningRecordType)
const masteryLevels = Object.values(MasteryLevel)
const resourceTypes = Object.values(ResourceType)
const taskTypeOptions = Object.values(TaskType)

const predictionOptions = [
  { value: 0, label: '完全陌生' },
  { value: 1, label: '只听过名字' },
  { value: 2, label: '能说一点' },
  { value: 3, label: '基本理解' },
  { value: 4, label: '非常熟悉' },
]

const recallOptions = [
  { value: 0, label: '0 · 无法回忆' },
  { value: 1, label: '1 · 零散回忆' },
  { value: 2, label: '2 · 能解释核心' },
  { value: 3, label: '3 · 独立应用' },
  { value: 4, label: '4 · 迁移新问题' },
]

const startTaskId = ref('')
const startWorkflowId = ref('')
const startIntention = ref('')
const startPrediction = ref(2)
const starting = ref(false)

const recentSessions = computed(() =>
  [...sessions.value]
    .filter((session) => !session.archivedAt)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 8),
)

const sessionStatusClass = (status: SessionStatus): string =>
  `session-${status.toLowerCase()}`

function initStartDefaults(): void {
  if (!startTaskId.value) startTaskId.value = availableTasks.value[0]?.id ?? ''
  if (!startWorkflowId.value) startWorkflowId.value = activeWorkflows.value[0]?.id ?? ''
}

async function submitStartSession(): Promise<void> {
  if (!startTaskId.value) {
    toastError('请选择一个任务')
    return
  }
  if (!startWorkflowId.value) {
    toastError('请选择一个学习流程')
    return
  }
  starting.value = true
  try {
    await startSession({
      taskId: startTaskId.value,
      workflowId: startWorkflowId.value,
      learningIntention: startIntention.value.trim(),
      selfPrediction: startPrediction.value,
    })
    startIntention.value = ''
    completionOutcome.value = null
    startClock()
    success('学习会话已开始，按照阶段推进即可')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    starting.value = false
  }
}

function taskTitle(taskId: string | null): string {
  if (!taskId) return '未关联任务'
  return taskById.value[taskId]?.title ?? '任务已不存在'
}

function workflowName(workflowId: string | null): string {
  if (!workflowId) return '未选择流程'
  return workflowById.value[workflowId]?.name ?? '流程已不存在'
}


async function goStage(index: number): Promise<void> {
  const session = activeSession.value
  const workflow = activeWorkflow.value
  if (!session || !workflow) return
  const stage = workflow.stages[index]
  if (!stage) return
  try {
    await setStage(session.id, stage.key)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function prevStage(): Promise<void> {
  if (activeStageIndex.value > 0) await goStage(activeStageIndex.value - 1)
}

async function nextStage(): Promise<void> {
  if (!activeWorkflow.value) return
  if (activeStageIndex.value < activeWorkflow.value.stages.length - 1) {
    await goStage(activeStageIndex.value + 1)
  }
}

function askSkipStage(): void {
  const stage = activeStage.value
  const session = activeSession.value
  if (!stage || !session || !activeWorkflow.value) return
  if (activeStageIndex.value >= activeWorkflow.value.stages.length - 1) {
    toastError('当前已是最后一个阶段，可以完成或中断会话')
    return
  }
  confirmTarget.value = {
    kind: 'skip-stage',
    id: stage.key,
    label: stage.name,
    archived: false,
  }
  confirmOpen.value = true
}

function resourceUrl(tool: string | null): string {
  if (!tool) return ''
  const keyword = tool.toLowerCase()
  const resource = activeResources.value.find((item) => {
    const typeLabel = resourceTypeLabels[item.resourceType].toLowerCase()
    return (
      item.title.toLowerCase().includes(keyword) ||
      item.source.toLowerCase().includes(keyword) ||
      typeLabel.includes(keyword)
    )
  })
  return resource?.externalUrl ?? ''
}

function defaultRecordType(stageKey: string | null): LearningRecordType {
  const key = stageKey ?? ''
  if (key.includes('input') || key.includes('preview')) return LearningRecordType.INPUT
  if (
    key.includes('feedback') ||
    key.includes('test') ||
    key.includes('recall') ||
    key.includes('check')
  ) {
    return LearningRecordType.FEEDBACK
  }
  if (key.includes('reflect')) return LearningRecordType.REFLECTION
  if (key.includes('relearn')) return LearningRecordType.RELEARNING
  return LearningRecordType.OUTPUT
}

interface RecordForm {
  recordType: LearningRecordType
  title: string
  content: string
  externalUrl: string
  selfAssessment: number
}

const recordForm = reactive<RecordForm>({
  recordType: LearningRecordType.OUTPUT,
  title: '',
  content: '',
  externalUrl: '',
  selfAssessment: 2,
})
const recordEditingId = ref<string | null>(null)
const recordModalOpen = ref(false)
const formError = ref('')
const saving = ref(false)

function openRecordCreate(): void {
  recordEditingId.value = null
  Object.assign(recordForm, {
    recordType: defaultRecordType(activeStage.value?.key ?? null),
    title: '',
    content: '',
    externalUrl: '',
    selfAssessment: 2,
  })
  formError.value = ''
  recordModalOpen.value = true
}

function openRecordEdit(record: LearningRecord): void {
  recordEditingId.value = record.id
  Object.assign(recordForm, {
    recordType: record.recordType,
    title: record.title,
    content: record.content,
    externalUrl: record.externalUrl,
    selfAssessment: record.selfAssessment ?? 2,
  })
  formError.value = ''
  recordModalOpen.value = true
}

async function submitRecord(): Promise<void> {
  formError.value = ''
  if (!activeSession.value) {
    formError.value = '当前没有进行中的学习会话'
    return
  }
  if (!recordForm.title.trim() && !recordForm.content.trim()) {
    formError.value = '标题和内容至少填写一项'
    return
  }
  saving.value = true
  try {
    const payload: LearningRecordInput = {
      sessionId: activeSession.value.id,
      taskId: activeSession.value.taskId,
      recordType: recordForm.recordType,
      title: recordForm.title.trim() || '学习记录',
      content: recordForm.content.trim(),
      externalUrl: recordForm.externalUrl.trim(),
      occurredAt:
        recordEditingId.value
          ? activeSessionRecords.value.find((row) => row.id === recordEditingId.value)
              ?.occurredAt ?? nowIso()
          : nowIso(),
      selfAssessment: recordForm.selfAssessment,
    }
    await saveRecord(payload, recordEditingId.value ?? undefined)
    recordModalOpen.value = false
    success(recordEditingId.value ? '记录已更新' : '记录已保存')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

async function toggleKnowledge(knowledgeId: string, event: Event): Promise<void> {
  const session = activeSession.value
  if (!session) return
  const checked = (event.target as HTMLInputElement).checked
  const ids = [...activeSessionKnowledgeIds.value]
  const next = checked
    ? [...ids, ...(ids.includes(knowledgeId) ? [] : [knowledgeId])]
    : ids.filter((id) => id !== knowledgeId)
  try {
    await syncSessionKnowledge(session.id, next)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const finishOpen = ref(false)
const finishForm = reactive({ actualAssessment: 2, reflection: '' })
const finishing = ref(false)

interface CompletionOutcome {
  session: LearningSession
  taskTitle: string
  workflowName: string
  intention: string
  reflection: string
  duration: number
  assessment: number
  outputs: LearningRecord[]
  issues: LearningRecord[]
  knowledge: KnowledgeItem[]
  reviewKnowledge: KnowledgeItem[]
  evidence: LearningRecord[]
}

const completionOutcome = ref<CompletionOutcome | null>(null)

function openFinish(): void {
  finishForm.actualAssessment = 2
  finishForm.reflection = ''
  finishOpen.value = true
}

async function submitFinish(): Promise<void> {
  const session = activeSession.value
  if (!session) return
  const outcomeTaskTitle = taskTitle(session.taskId)
  const outcomeWorkflowName = workflowName(session.workflowId)
  const outcomeKnowledge = activeSessionKnowledgeIds.value
    .map((id) => knowledgeById.value[id])
    .filter((item): item is KnowledgeItem => Boolean(item))
  const outcomeRecords = [...activeSessionRecords.value]
  const outcomeReflection = finishForm.reflection.trim()
  finishing.value = true
  try {
    const entity = await finishSession(session.id, {
      status: SessionStatus.COMPLETED,
      actualAssessment: finishForm.actualAssessment,
      reflection: finishForm.reflection,
    })
    finishOpen.value = false
    stopClock()
    initStartDefaults()
    completionOutcome.value = {
      session: entity ?? session,
      taskTitle: outcomeTaskTitle,
      workflowName: outcomeWorkflowName,
      intention: session.learningIntention,
      reflection: outcomeReflection,
      duration: entity?.actualDuration ?? 0,
      assessment: finishForm.actualAssessment,
      outputs: outcomeRecords.filter((record) =>
        new Set<LearningRecordType>([
          LearningRecordType.OUTPUT,
          LearningRecordType.INPUT,
          LearningRecordType.RELEARNING,
        ]).has(record.recordType),
      ),
      issues: outcomeRecords.filter((record) =>
        new Set<LearningRecordType>([
          LearningRecordType.FEEDBACK,
          LearningRecordType.REFLECTION,
        ]).has(record.recordType),
      ),
      knowledge: outcomeKnowledge,
      reviewKnowledge: outcomeKnowledge.filter((item) =>
        new Set<MasteryLevel>([
          MasteryLevel.L0,
          MasteryLevel.L1,
          MasteryLevel.L2,
        ]).has(item.masteryLevel),
      ),
      evidence: outcomeRecords.filter(
        (record) =>
          record.recordType === LearningRecordType.EVIDENCE || Boolean(record.externalUrl),
      ),
    }
    success(`学习会话已完成 · ${formatDuration(entity?.actualDuration ?? 0)}`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    finishing.value = false
  }
}

function openInterrupt(): void {
  const session = activeSession.value
  if (!session) return
  confirmTarget.value = {
    kind: 'interrupt',
    id: session.id,
    label: taskTitle(session.taskId),
    archived: false,
  }
  confirmOpen.value = true
}

const detailSession = ref<LearningSession | null>(null)

function openSessionDetail(session: LearningSession): void {
  detailSession.value = session
}

const detailRecords = computed(() =>
  detailSession.value
    ? (recordsBySession.value[detailSession.value.id] ?? []).filter((row) => !row.archivedAt)
    : [],
)

const detailKnowledge = computed(() =>
  detailSession.value
    ? (knowledgeIdsBySession.value[detailSession.value.id] ?? [])
        .map((id) => knowledgeById.value[id])
        .filter((item): item is KnowledgeItem => Boolean(item))
    : [],
)

const workflowForm = reactive({
  name: '',
  description: '',
  defaultDuration: 60,
  applicableTaskTypes: [TaskType.LEARNING] as TaskType[],
  outputRequirements: '',
  feedbackRequirements: '',
  externalTools: '',
  stages: [] as WorkflowStage[],
})
const workflowEditingId = ref<string | null>(null)
const workflowModalOpen = ref(false)
const presetKey = ref('')

function newStage(index: number): WorkflowStage {
  return {
    key: `stage-${Date.now()}-${index}`,
    name: '',
    goal: '',
    prompt: '',
    suggestedMinutes: 15,
    required: true,
    needsRecord: true,
    externalTool: null,
  }
}

function emptyWorkflowForm(): void {
  Object.assign(workflowForm, {
    name: '',
    description: '',
    defaultDuration: 60,
    applicableTaskTypes: [TaskType.LEARNING],
    outputRequirements: '',
    feedbackRequirements: '',
    externalTools: '',
    stages: [],
  })
  presetKey.value = ''
  workflowEditingId.value = null
}

function openWorkflowCreate(): void {
  emptyWorkflowForm()
  workflowForm.stages.push(newStage(0), newStage(1))
  formError.value = ''
  workflowModalOpen.value = true
}

function applyPreset(key: string): void {
  const preset: WorkflowPreset | undefined = WORKFLOW_PRESETS.find(
    (item) => item.key === key,
  )
  if (!preset) return
  Object.assign(workflowForm, {
    name: preset.name,
    description: preset.description,
    defaultDuration: preset.defaultDuration,
    applicableTaskTypes: [...preset.applicableTaskTypes],
    outputRequirements: preset.outputRequirements,
    feedbackRequirements: preset.feedbackRequirements,
    externalTools: preset.externalToolSuggestions.join('、'),
    stages: preset.stages.map((stage) => ({ ...stage })),
  })
}

function onPresetChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  presetKey.value = value
  applyPreset(value)
}

function openWorkflowEdit(workflow: Workflow): void {
  workflowEditingId.value = workflow.id
  Object.assign(workflowForm, {
    name: workflow.name,
    description: workflow.description,
    defaultDuration: workflow.defaultDuration,
    applicableTaskTypes: [...workflow.applicableTaskTypes],
    outputRequirements: workflow.outputRequirements,
    feedbackRequirements: workflow.feedbackRequirements,
    externalTools: workflow.externalToolSuggestions.join('、'),
    stages: workflow.stages.map((stage) => ({ ...stage })),
  })
  presetKey.value = ''
  formError.value = ''
  workflowModalOpen.value = true
}

function addStage(): void {
  workflowForm.stages.push(newStage(workflowForm.stages.length))
}

function removeStage(index: number): void {
  workflowForm.stages.splice(index, 1)
}

function toggleWorkflowTaskType(type: TaskType, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    if (!workflowForm.applicableTaskTypes.includes(type)) {
      workflowForm.applicableTaskTypes.push(type)
    }
  } else {
    workflowForm.applicableTaskTypes = workflowForm.applicableTaskTypes.filter(
      (item) => item !== type,
    )
  }
}

async function submitWorkflow(): Promise<void> {
  formError.value = ''
  if (!workflowForm.name.trim()) {
    formError.value = '流程名称不能为空'
    return
  }
  if (workflowForm.stages.length === 0) {
    formError.value = '至少需要一个学习阶段'
    return
  }
  if (workflowForm.stages.some((stage) => !stage.name.trim())) {
    formError.value = '每个阶段都需要名称'
    return
  }
  saving.value = true
  try {
    const stages = workflowForm.stages.map((stage, index) => ({
      ...stage,
      key: stage.key || `stage-${Date.now()}-${index}`,
      name: stage.name.trim(),
      goal: stage.goal.trim(),
      prompt: stage.prompt.trim(),
      suggestedMinutes: Math.max(0, Number(stage.suggestedMinutes) || 0),
      externalTool: stage.externalTool?.trim() ? stage.externalTool.trim() : null,
    }))
    const payload: WorkflowInput = {
      name: workflowForm.name.trim(),
      description: workflowForm.description.trim(),
      stages,
      applicableTaskTypes: [...workflowForm.applicableTaskTypes],
      defaultDuration: Math.max(0, Number(workflowForm.defaultDuration) || 0),
      outputRequirements: workflowForm.outputRequirements.trim(),
      feedbackRequirements: workflowForm.feedbackRequirements.trim(),
      externalToolSuggestions: workflowForm.externalTools
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
    }
    await saveWorkflow(payload, workflowEditingId.value ?? undefined)
    workflowModalOpen.value = false
    initStartDefaults()
    success(workflowEditingId.value ? '学习流程已更新' : '学习流程已创建')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const knowledgeForm = reactive({
  title: '',
  description: '',
  source: '',
  masteryLevel: MasteryLevel.L1,
  lastReviewedAt: null as string | null,
})
const knowledgeEditingId = ref<string | null>(null)
const knowledgeModalOpen = ref(false)

function openKnowledgeCreate(): void {
  knowledgeEditingId.value = null
  Object.assign(knowledgeForm, {
    title: '',
    description: '',
    source: '',
    masteryLevel: MasteryLevel.L1,
    lastReviewedAt: null,
  })
  formError.value = ''
  knowledgeModalOpen.value = true
}

function openKnowledgeEdit(item: KnowledgeItem): void {
  knowledgeEditingId.value = item.id
  Object.assign(knowledgeForm, {
    title: item.title,
    description: item.description,
    source: item.source,
    masteryLevel: item.masteryLevel,
    lastReviewedAt: item.lastReviewedAt,
  })
  formError.value = ''
  knowledgeModalOpen.value = true
}

async function submitKnowledge(): Promise<void> {
  formError.value = ''
  if (!knowledgeForm.title.trim()) {
    formError.value = '知识点名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: KnowledgeInput = {
      title: knowledgeForm.title.trim(),
      description: knowledgeForm.description.trim(),
      source: knowledgeForm.source.trim(),
      masteryLevel: knowledgeForm.masteryLevel,
      lastReviewedAt: knowledgeForm.lastReviewedAt,
    }
    await saveKnowledge(payload, knowledgeEditingId.value ?? undefined)
    knowledgeModalOpen.value = false
    success(knowledgeEditingId.value ? '知识点已更新' : '知识点已创建')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const scheduleForm = reactive({
  knowledgeItemId: '',
  scheduledDate: '',
  externalTool: '',
  externalUrl: '',
})
const scheduleModalOpen = ref(false)

function tomorrowKey(): string {
  return toDateInput(addDays(nowIso(), 1))
}

function scheduledAtFromDate(value: string): string {
  return new Date(`${value}T20:00:00`).toISOString()
}

function openScheduleCreate(knowledge?: KnowledgeItem): void {
  scheduleForm.knowledgeItemId = knowledge?.id ?? activeKnowledge.value[0]?.id ?? ''
  scheduleForm.scheduledDate = tomorrowKey()
  scheduleForm.externalTool = 'Anki'
  scheduleForm.externalUrl = ''
  formError.value = ''
  scheduleModalOpen.value = true
}

async function submitSchedule(): Promise<void> {
  formError.value = ''
  if (!scheduleForm.knowledgeItemId) {
    formError.value = '请选择知识点'
    return
  }
  if (!scheduleForm.scheduledDate) {
    formError.value = '请选择复习日期'
    return
  }
  saving.value = true
  try {
    await saveReviewSchedule({
      knowledgeItemId: scheduleForm.knowledgeItemId,
      scheduledAt: scheduledAtFromDate(scheduleForm.scheduledDate),
      completedAt: null,
      recallResult: null,
      difficulty: null,
      nextReviewAt: null,
      externalTool: scheduleForm.externalTool.trim(),
      externalUrl: scheduleForm.externalUrl.trim(),
      status: ReviewScheduleStatus.PENDING,
    })
    scheduleModalOpen.value = false
    success('复习已安排')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const reviewTarget = ref<ReviewSchedule | null>(null)
const reviewModalOpen = ref(false)
const reviewForm = reactive({ recall: 2, difficulty: 2 })
const recallDraft = ref('')
const recallRevealed = ref(false)
const reviewing = ref(false)

const reviewKnowledgeItem = computed(() =>
  reviewTarget.value ? knowledgeById.value[reviewTarget.value.knowledgeItemId] ?? null : null,
)

function openReview(schedule: ReviewSchedule): void {
  reviewTarget.value = schedule
  reviewForm.recall = 2
  reviewForm.difficulty = 2
  recallDraft.value = ''
  recallRevealed.value = false
  formError.value = ''
  reviewModalOpen.value = true
}

function revealRecallReference(): void {
  recallRevealed.value = true
}

const nextReviewPreview = computed(() => {
  const days = nextReviewInterval(reviewForm.recall)
  return formatShortDate(addDays(nowIso(), days))
})

async function submitReview(): Promise<void> {
  const target = reviewTarget.value
  if (!target) return
  if (!recallRevealed.value) {
    toastError('请先完成主动回忆并显示参考内容，再记录结果')
    return
  }
  reviewing.value = true
  try {
    const next = await completeReview(target, reviewForm.recall, reviewForm.difficulty)
    reviewModalOpen.value = false
    success(`复习已记录，下次复习：${formatShortDate(next.toISOString())}`)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    reviewing.value = false
  }
}

async function handleSkipReview(schedule: ReviewSchedule): Promise<void> {
  try {
    await skipReview(schedule.id)
    success('本次复习已跳过，知识点本身不会改变掌握等级')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const resourceForm = reactive({
  title: '',
  resourceType: ResourceType.OBSIDIAN,
  externalUrl: '',
  description: '',
  source: '',
})
const resourceEditingId = ref<string | null>(null)
const resourceModalOpen = ref(false)

function openResourceCreate(): void {
  resourceEditingId.value = null
  Object.assign(resourceForm, {
    title: '',
    resourceType: ResourceType.OBSIDIAN,
    externalUrl: '',
    description: '',
    source: '',
  })
  formError.value = ''
  resourceModalOpen.value = true
}

function openResourceEdit(item: Resource): void {
  resourceEditingId.value = item.id
  Object.assign(resourceForm, {
    title: item.title,
    resourceType: item.resourceType,
    externalUrl: item.externalUrl,
    description: item.description,
    source: item.source,
  })
  formError.value = ''
  resourceModalOpen.value = true
}

async function submitResource(): Promise<void> {
  formError.value = ''
  if (!resourceForm.title.trim()) {
    formError.value = '资源名称不能为空'
    return
  }
  saving.value = true
  try {
    const payload: ResourceInput = {
      title: resourceForm.title.trim(),
      resourceType: resourceForm.resourceType,
      externalUrl: resourceForm.externalUrl.trim(),
      description: resourceForm.description.trim(),
      source: resourceForm.source.trim(),
    }
    await saveResource(payload, resourceEditingId.value ?? undefined)
    resourceModalOpen.value = false
    success(resourceEditingId.value ? '资源已更新' : '资源已添加')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

const confirmOpen = ref(false)
const confirmBusy = ref(false)
const confirmTarget = ref<{
  kind: 'workflow' | 'knowledge' | 'resource' | 'interrupt' | 'skip-stage'
  id: string
  label: string
  archived: boolean
} | null>(null)

const confirmTitle = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') return '中断学习会话'
  if (target.kind === 'skip-stage') return '跳过当前阶段'
  return target.archived ? '恢复内容' : '归档内容'
})

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') {
    return `将中断当前学习会话「${target.label}」。已记录的内容会保留，会话时长会按实际时间记录。`
  }
  if (target.kind === 'skip-stage') {
    return `将跳过「${target.label}」。已记录的内容不会删除，之后仍可从阶段进度返回该阶段。`
  }
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在默认列表中。`
  return `将归档「${target.label}」。不会删除历史记录，归档后可以随时恢复。`
})

const confirmActionLabel = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') return '确认中断'
  if (target.kind === 'skip-stage') return '确认跳过'
  return target.archived ? '确认恢复' : '确认归档'
})

function askArchive(
  kind: 'workflow' | 'knowledge' | 'resource',
  id: string,
  label: string,
  archivedAt: string | null,
): void {
  confirmTarget.value = { kind, id, label, archived: Boolean(archivedAt) }
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  confirmBusy.value = true
  try {
    if (target.kind === 'interrupt') {
      await finishSession(target.id, {
        status: SessionStatus.INTERRUPTED,
        actualAssessment: null,
        reflection: '',
      })
      stopClock()
      initStartDefaults()
      success('学习会话已中断，记录已保留')
    } else if (target.kind === 'skip-stage') {
      await nextStage()
      success(`已跳过「${target.label}」，可以继续当前阶段`)
    } else if (target.kind === 'workflow') {
      await setWorkflowArchived(target.id, !target.archived)
      success(target.archived ? '已恢复' : '已归档，可随时恢复')
    } else if (target.kind === 'knowledge') {
      await setKnowledgeArchived(target.id, !target.archived)
      success(target.archived ? '已恢复' : '已归档，可随时恢复')
    } else {
      await setResourceArchived(target.id, !target.archived)
      success(target.archived ? '已恢复' : '已归档，可随时恢复')
    }
    confirmOpen.value = false
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    confirmBusy.value = false
  }
}

const visibleWorkflows = computed(() =>
  workflows.value.filter((workflow) => includeArchived.value || !workflow.archivedAt),
)

const visibleKnowledge = computed(() =>
  knowledgeItems.value.filter((item) => includeArchived.value || !item.archivedAt),
)

const visibleResources = computed(() =>
  resources.value.filter((item) => includeArchived.value || !item.archivedAt),
)

function sessionRecordsCount(sessionId: string): number {
  return (recordsBySession.value[sessionId] ?? []).filter((row) => !row.archivedAt).length
}

function predictionLabel(value: number): string {
  return predictionOptions.find((option) => option.value === value)?.label ?? `${value}`
}

function masteryClass(level: MasteryLevel): string {
  return `mastery-${level.toLowerCase()}`
}

function knowledgeTitle(id: string): string {
  return knowledgeById.value[id]?.title ?? '未知知识点'
}

function recordUrl(url: string): string {
  return url
}

async function bootstrap(): Promise<void> {
  await refresh()
  initStartDefaults()
  startClock()
}

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  await bootstrap()
  const reviewParam = String(route.query.review ?? '')
  if (reviewParam) {
    const schedule = reviewSchedules.value.find((item) => item.id === reviewParam)
    if (schedule) {
      activeView.value = 'knowledge'
      openReview(schedule)
    } else {
      toastError('这条复习记录不存在或已经失效')
    }
    await router.replace('/learning')
  }
  const taskParam = String(route.query.task ?? '')
  if (taskParam) {
    const task = availableTasks.value.find((item) => item.id === taskParam)
    if (task) {
      activeView.value = 'workbench'
      startTaskId.value = task.id
    } else {
      toastError('这个任务当前不可开始学习')
    }
    await router.replace('/learning')
  }
  if (String(route.query.create ?? '') === 'knowledge') {
    activeView.value = 'knowledge'
    openKnowledgeCreate()
    await router.replace('/learning')
  }
})

onUnmounted(() => {
  stopClock()
})
</script>

<template>
  <div class="page learning">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">执行与学习 · 学习工作台</p>
        <h2 class="page-title">学习系统</h2>
        <p class="page-subtitle">
          不只记录学习时长。用可配置流程推动输入、输出、反馈与反思，把成果和知识点留下来，并安排下一轮学习。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="activeView = 'workflows'; openWorkflowCreate()">
          <AppIcon name="layers" :size="15" />
          新建学习流程
        </button>
        <button class="btn btn-primary" @click="activeView = 'knowledge'; openKnowledgeCreate()">
          <AppIcon name="bulb" :size="15" />
          记录知识点
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">
      <AppIcon name="warning" :size="15" />
      <span>读取数据失败：{{ error }}</span>
      <button class="btn btn-sm btn-secondary" @click="refresh">重试</button>
    </div>

    <section class="learning-stats">
      <div class="learning-stat">
        <span class="stat-icon"><AppIcon name="play" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.sessions }}</span>
          <span class="stat-caption">学习会话</span>
        </div>
      </div>
      <div class="learning-stat">
        <span class="stat-icon icon-blue"><AppIcon name="clock" :size="16" /></span>
        <div>
          <span class="stat-number stat-small">{{ formatDuration(stats.weekMinutes) }}</span>
          <span class="stat-caption">本周学习时长</span>
        </div>
      </div>
      <div class="learning-stat">
        <span class="stat-icon icon-amber"><AppIcon name="bulb" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.knowledge }}</span>
          <span class="stat-caption">知识点</span>
        </div>
      </div>
      <div class="learning-stat">
        <span class="stat-icon icon-danger"><AppIcon name="refresh" :size="16" /></span>
        <div>
          <span class="stat-number">{{ stats.dueReviews }}</span>
          <span class="stat-caption">待复习</span>
        </div>
      </div>
    </section>

    <section class="card view-toolbar">
      <div class="view-tabs" role="tablist" aria-label="学习视图">
        <button
          v-for="tab in [
            { key: 'workbench', label: '工作台', icon: 'play' },
            { key: 'workflows', label: '学习流程', icon: 'layers' },
            { key: 'knowledge', label: '知识点', icon: 'bulb' },
            { key: 'reviews', label: '复习', icon: 'refresh' },
            { key: 'resources', label: '资源与工具', icon: 'book' },
          ] as const"
          :key="tab.key"
          class="view-tab"
          :class="{ active: activeView === tab.key }"
          role="tab"
          :aria-selected="activeView === tab.key"
          @click="activeView = tab.key"
        >
          <AppIcon :name="tab.icon" :size="15" />
          {{ tab.label }}
          <span v-if="tab.key === 'workflows'" class="tab-count">{{ visibleWorkflows.length }}</span>
          <span v-else-if="tab.key === 'knowledge'" class="tab-count">{{ visibleKnowledge.length }}</span>
          <span v-else-if="tab.key === 'reviews'" class="tab-count">{{ dueReviews.length }}</span>
          <span v-else-if="tab.key === 'resources'" class="tab-count">{{ visibleResources.length }}</span>
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

    <div v-if="loading" class="skeleton learning-loading" />

    <template v-else>
      <section v-if="activeView === 'workbench'" class="workbench">
        <article v-if="activeSession" class="card session-shell">
          <header class="session-head">
            <div class="session-heading">
              <div class="session-badges">
                <span class="badge badge-accent">进行中</span>
                <span class="badge">{{ workflowName(activeSession.workflowId) }}</span>
                <span v-if="activeSession.taskId" class="badge">
                  {{ taskTitle(activeSession.taskId) }}
                </span>
              </div>
              <h3>{{ activeSession.learningIntention || '按流程推进本次学习' }}</h3>
              <p class="session-started">
                开始于 {{ formatDateTime(activeSession.startedAt) }} · 学习前自评
                {{ predictionLabel(activeSession.selfPrediction) }}
              </p>
            </div>
            <div class="session-timer">
              <span class="timer-label">Elapsed</span>
              <strong>{{ formatDuration(elapsedMinutes) }}</strong>
            </div>
          </header>

          <div class="session-grid">
            <aside class="session-rail" aria-label="学习流程与会话信息">
              <section class="rail-block">
                <div class="rail-heading">
                  <span>学习流程</span>
                  <span class="rail-count">{{ activeWorkflow?.stages.length ?? 0 }} 阶段</span>
                </div>
                <div v-if="activeWorkflow" class="stage-progress stage-progress-rail">
                  <button
                    v-for="(stage, index) in activeWorkflow.stages"
                    :key="stage.key"
                    class="stage-step"
                    :class="{
                      active: index === activeStageIndex,
                      passed: index < activeStageIndex,
                    }"
                    :aria-current="index === activeStageIndex ? 'step' : undefined"
                    @click="goStage(index)"
                  >
                    <span class="stage-index">{{ index + 1 }}</span>
                    <span class="stage-name">{{ stage.name }}</span>
                  </button>
                </div>
                <p v-else class="rail-empty">当前流程没有阶段。</p>
              </section>

              <section class="rail-block">
                <div class="rail-heading"><span>Session 信息</span></div>
                <dl class="session-facts">
                  <div>
                    <dt>开始时间</dt>
                    <dd>{{ formatDateTime(activeSession.startedAt) }}</dd>
                  </div>
                  <div>
                    <dt>已用时间</dt>
                    <dd class="fact-accent">{{ formatDuration(elapsedMinutes) }}</dd>
                  </div>
                  <div>
                    <dt>学习前自评</dt>
                    <dd>{{ predictionLabel(activeSession.selfPrediction) }}</dd>
                  </div>
                </dl>
              </section>

              <section class="rail-block">
                <div class="rail-heading"><span>当前学习任务</span></div>
                <p class="rail-task">{{ taskTitle(activeSession.taskId) }}</p>
                <p v-if="activeSession.taskId && taskById[activeSession.taskId]" class="rail-meta">
                  预计 {{ formatDuration(taskById[activeSession.taskId].estimatedDuration) }} ·
                  已完成 {{ formatDuration(taskById[activeSession.taskId].actualDuration) }}
                </p>
                <p class="rail-prompt">
                  {{ activeSession.learningIntention || '还没有写下本次学习意图。' }}
                </p>
              </section>
            </aside>

            <div class="session-main">
              <div v-if="activeStage" class="stage-card">
                <div class="stage-card-head">
                  <div>
                    <p class="stage-eyebrow">
                      Stage {{ activeStageIndex + 1 }} / {{ activeWorkflow?.stages.length }} ·
                      {{ activeStage.required ? '必需阶段' : '可选阶段' }}
                    </p>
                    <h4>{{ activeStage.name }}</h4>
                  </div>
                  <span class="stage-time">
                    <AppIcon name="clock" :size="13" />
                    {{ formatDuration(activeStage.suggestedMinutes) }}
                  </span>
                </div>
                <p class="stage-goal">{{ activeStage.goal }}</p>
                <p class="stage-prompt">{{ activeStage.prompt }}</p>
                <div class="stage-tools">
                  <span v-if="activeStage.externalTool" class="badge">
                    <AppIcon name="external" :size="11" />
                    {{ activeStage.externalTool }}
                  </span>
                  <a
                    v-if="resourceUrl(activeStage.externalTool)"
                    :href="resourceUrl(activeStage.externalTool)"
                    class="stage-link"
                    target="_blank"
                    rel="noopener"
                  >
                    打开外部工具
                    <AppIcon name="external" :size="12" />
                  </a>
                  <span v-if="activeStage.needsRecord" class="badge badge-amber">
                    本阶段建议留下记录
                  </span>
                </div>
              </div>

              <div v-else class="empty-stage">
                当前流程没有阶段，请先在“学习流程”中补充阶段。
              </div>

              <div class="session-actions">
                <button class="btn btn-secondary" :disabled="activeStageIndex === 0" @click="prevStage">
                  <AppIcon name="arrow-right" :size="14" class="flip" />
                  上一阶段
                </button>
                <button
                  class="btn btn-secondary"
                  :disabled="!activeWorkflow || activeStageIndex >= activeWorkflow.stages.length - 1"
                  @click="nextStage"
                >
                  下一阶段
                  <AppIcon name="arrow-right" :size="14" />
                </button>
                <button
                  class="btn btn-ghost"
                  :disabled="!activeWorkflow || activeStageIndex >= activeWorkflow.stages.length - 1"
                  @click="askSkipStage"
                >
                  跳过当前阶段
                </button>
                <button class="btn btn-primary" @click="openRecordCreate">
                  <AppIcon name="plus" :size="14" />
                  添加本阶段记录
                </button>
                <button class="btn btn-ghost" @click="openFinish">
                  <AppIcon name="check" :size="14" />
                  完成会话
                </button>
                <button class="btn btn-ghost session-interrupt" @click="openInterrupt">
                  中断
                </button>
              </div>

              <div class="session-records">
                <div class="section-head">
                  <h4 class="record-title">
                    <AppIcon name="inbox" :size="15" />
                    本次记录
                    <span class="count-pill">{{ activeSessionRecords.length }}</span>
                  </h4>
                  <span class="section-note">输出比“看过了”更接近真正掌握</span>
                </div>
                <div v-if="activeSessionRecords.length === 0" class="record-empty">
                  写下一段主动回忆、一个例子或一个仍然不懂的问题。
                </div>
                <article v-for="record in activeSessionRecords" :key="record.id" class="record-item">
                  <div class="record-head">
                    <span class="record-type">{{ learningRecordTypeLabels[record.recordType] }}</span>
                    <span class="record-time">{{ formatDateTime(record.occurredAt) }}</span>
                    <button class="icon-btn record-edit" title="编辑记录" aria-label="编辑记录" @click="openRecordEdit(record)">
                      <AppIcon name="sliders" :size="13" />
                    </button>
                  </div>
                  <p class="record-name">{{ record.title }}</p>
                  <p class="record-content">{{ record.content }}</p>
                  <a
                    v-if="record.externalUrl"
                    :href="recordUrl(record.externalUrl)"
                    class="record-link"
                    target="_blank"
                    rel="noopener"
                  >
                    查看外部记录
                    <AppIcon name="external" :size="11" />
                  </a>
                </article>
              </div>
            </div>

            <aside class="session-side" aria-label="关联知识与历史记录">
              <div class="side-block">
                <h4 class="side-title">
                  <AppIcon name="bulb" :size="14" />
                  关联知识点
                </h4>
                <p class="side-hint">关联后才能进入复习调度；复习到期不等于已经遗忘。</p>
                <div v-if="activeKnowledge.length === 0" class="record-empty">
                  还没有知识点，可以在知识点页创建。
                </div>
                <div v-else class="knowledge-link-list">
                  <label
                    v-for="item in activeKnowledge"
                    :key="item.id"
                    class="knowledge-link"
                    :class="{ selected: activeSessionKnowledgeIds.includes(item.id) }"
                  >
                    <input
                      type="checkbox"
                      :checked="activeSessionKnowledgeIds.includes(item.id)"
                      @change="toggleKnowledge(item.id, $event)"
                    />
                    <span>{{ item.title }}</span>
                    <span class="knowledge-link-level">{{ item.masteryLevel }}</span>
                  </label>
                </div>
              </div>

              <div class="side-block">
                <h4 class="side-title">
                  <AppIcon name="book" :size="14" />
                  资料与工具
                </h4>
                <div v-if="activeResources.length === 0" class="record-empty">
                  还没有登记资源，可以在“资源与工具”中添加。
                </div>
                <ul v-else class="side-resource-list">
                  <li v-for="item in activeResources.slice(0, 4)" :key="item.id">
                    <a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener">
                      <span>{{ item.title }}</span>
                      <AppIcon name="external" :size="11" />
                    </a>
                    <span v-else>{{ item.title }}</span>
                    <small>{{ resourceTypeLabels[item.resourceType] }}</small>
                  </li>
                </ul>
              </div>

              <div class="side-block">
                <h4 class="side-title">
                  <AppIcon name="clock" :size="14" />
                  最近学习记录
                </h4>
                <div v-if="recentSessions.filter((row) => row.id !== activeSession?.id).length === 0" class="record-empty">
                  完成更多会话后，这里会显示最近记录。
                </div>
                <ul v-else class="side-session-list">
                  <li
                    v-for="row in recentSessions.filter((session) => session.id !== activeSession?.id).slice(0, 4)"
                    :key="row.id"
                  >
                    <button @click="openSessionDetail(row)">
                      <span>{{ taskTitle(row.taskId) }}</span>
                      <small>{{ formatShortDate(row.startedAt) }} · {{ formatDuration(row.actualDuration) }}</small>
                    </button>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </article>

        <article v-if="completionOutcome && !activeSession" class="card outcome-card">
          <header class="outcome-head">
            <div>
              <p class="page-eyebrow">Session complete</p>
              <h3>本次学习成果</h3>
              <p>{{ completionOutcome.taskTitle }} · {{ completionOutcome.workflowName }}</p>
            </div>
            <div class="outcome-summary">
              <span><strong>{{ formatDuration(completionOutcome.duration) }}</strong> 学习时长</span>
              <span><strong>{{ recallOptions[completionOutcome.assessment]?.label ?? '未评价' }}</strong> 实际表现</span>
              <button class="icon-btn" title="关闭成果卡片" aria-label="关闭成果卡片" @click="completionOutcome = null">
                <AppIcon name="close" :size="15" />
              </button>
            </div>
          </header>
          <div class="outcome-grid">
            <section>
              <h4>学习了什么</h4>
              <p v-if="completionOutcome.intention">{{ completionOutcome.intention }}</p>
              <p v-else class="outcome-empty">本次没有记录学习意图。</p>
              <ul v-if="completionOutcome.outputs.length">
                <li v-for="record in completionOutcome.outputs" :key="record.id">{{ record.title }}</li>
              </ul>
            </section>
            <section>
              <h4>输出了什么</h4>
              <div v-if="completionOutcome.outputs.length" class="outcome-list">
                <article v-for="record in completionOutcome.outputs" :key="record.id">
                  <span class="record-type">{{ learningRecordTypeLabels[record.recordType] }}</span>
                  <strong>{{ record.title }}</strong>
                  <p v-if="record.content">{{ record.content }}</p>
                </article>
              </div>
              <p v-else class="outcome-empty">本次没有记录输出。</p>
            </section>
            <section>
              <h4>发现的问题</h4>
              <div v-if="completionOutcome.issues.length || completionOutcome.reflection" class="outcome-list">
                <article v-for="record in completionOutcome.issues" :key="record.id">
                  <span class="record-type">{{ learningRecordTypeLabels[record.recordType] }}</span>
                  <strong>{{ record.title }}</strong>
                  <p v-if="record.content">{{ record.content }}</p>
                </article>
                <article v-if="completionOutcome.reflection">
                  <span class="record-type">会话反思</span>
                  <p>{{ completionOutcome.reflection }}</p>
                </article>
              </div>
              <p v-else class="outcome-empty">本次没有记录问题或反思。</p>
            </section>
            <section>
              <h4>关联知识点</h4>
              <div v-if="completionOutcome.knowledge.length" class="outcome-tags">
                <span v-for="item in completionOutcome.knowledge" :key="item.id">
                  <span class="level-pill">{{ item.masteryLevel }}</span>{{ item.title }}
                </span>
              </div>
              <p v-else class="outcome-empty">本次没有关联知识点。</p>
            </section>
            <section>
              <h4>待复习知识点</h4>
              <div v-if="completionOutcome.reviewKnowledge.length" class="outcome-tags">
                <span v-for="item in completionOutcome.reviewKnowledge" :key="item.id">
                  <span class="level-pill">{{ item.masteryLevel }}</span>{{ item.title }}
                </span>
              </div>
              <p v-else-if="completionOutcome.knowledge.length" class="outcome-empty">关联知识点均已达到 L3 以上，可继续安排间隔复习。</p>
              <p v-else class="outcome-empty">本次没有待复习知识点。</p>
            </section>
            <section>
              <h4>能力证据</h4>
              <div v-if="completionOutcome.evidence.length" class="outcome-list">
                <article v-for="record in completionOutcome.evidence" :key="record.id">
                  <strong>{{ record.title }}</strong>
                  <a v-if="record.externalUrl" :href="record.externalUrl" target="_blank" rel="noopener">查看证据</a>
                </article>
              </div>
              <p v-else class="outcome-empty">本次没有可归档的能力证据。</p>
            </section>
          </div>
        </article>

        <article v-if="!activeSession && !completionOutcome" class="card start-card">
          <div class="start-copy">
            <p class="page-eyebrow">Start a session</p>
            <h3>开始一次学习会话</h3>
            <p>
              选择一个任务和一个学习流程。系统会按阶段提醒你输入、输出和反馈，而不是只记录“学了多久”。
            </p>
          </div>

          <div v-if="availableTasks.length === 0" class="start-empty">
            <EmptyState
              title="没有可学习的任务"
              description="先到“目标与任务”创建一个未完成的任务，再回来开始学习。"
            >
              <RouterLink to="/goals" class="btn btn-sm btn-secondary">去创建任务</RouterLink>
            </EmptyState>
          </div>
          <div v-else-if="activeWorkflows.length === 0" class="start-empty">
            <EmptyState
              title="还没有学习流程"
              description="学习流程定义输入、输出、反馈和反思的阶段。可以先从预设创建一个。"
            >
              <button class="btn btn-sm btn-secondary" @click="activeView = 'workflows'; openWorkflowCreate()">
                创建学习流程
              </button>
            </EmptyState>
          </div>

          <form v-else class="start-form" @submit.prevent="submitStartSession">
            <div class="start-grid">
              <div class="field">
                <label class="field-label" for="start-task">学习任务</label>
                <select id="start-task" v-model="startTaskId" class="select">
                  <option v-for="task in availableTasks" :key="task.id" :value="task.id">
                    {{ task.title }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="start-workflow">学习流程</label>
                <select id="start-workflow" v-model="startWorkflowId" class="select">
                  <option v-for="workflow in activeWorkflows" :key="workflow.id" :value="workflow.id">
                    {{ workflow.name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="field">
              <label class="field-label" for="start-intention">这次想弄懂什么</label>
              <input
                id="start-intention"
                v-model="startIntention"
                class="input"
                placeholder="例如：理解 WalkSAT 的变量选择机制，并独立写出算法流程。"
              />
            </div>
            <div class="form-grid">
              <div class="field">
                <label class="field-label" for="start-prediction">学习前自评</label>
                <select id="start-prediction" v-model.number="startPrediction" class="select">
                  <option v-for="option in predictionOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="field start-submit-field">
                <span class="field-label">准备好了吗</span>
                <button class="btn btn-primary btn-lg" type="submit" :disabled="starting">
                  <AppIcon name="play" :size="15" />
                  {{ starting ? '正在开始…' : '开始学习' }}
                </button>
              </div>
            </div>
          </form>
        </article>

        <article class="card card-pad recent-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="inbox" :size="16" />
              最近学习会话
            </h3>
            <span class="section-note">点击查看记录与知识点</span>
          </div>
          <EmptyState
            v-if="recentSessions.length === 0"
            title="还没有学习会话"
            description="完成一次会话后，记录、时长和关联知识点都会出现在这里。"
          />
          <ul v-else class="session-list">
            <li v-for="session in recentSessions" :key="session.id" class="session-list-item">
              <button class="session-list-main" @click="openSessionDetail(session)">
                <span class="session-status-dot" :class="sessionStatusClass(session.status)" />
                <span class="session-list-copy">
                  <span class="session-list-title">
                    {{ taskTitle(session.taskId) }}
                    <span class="session-intent">{{ session.learningIntention }}</span>
                  </span>
                  <span class="session-list-meta">
                    {{ workflowName(session.workflowId) }} ·
                    {{ formatDateTime(session.startedAt) }} ·
                    {{ sessionRecordsCount(session.id) }} 条记录
                  </span>
                </span>
                <span class="session-list-side">
                  <span class="badge">{{ sessionStatusLabels[session.status] }}</span>
                  <span class="session-duration">{{ formatDuration(session.actualDuration) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </article>
      </section>

      <section v-else-if="activeView === 'workflows'" class="workflow-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="layers" :size="16" />
              学习流程模板
            </h3>
            <p class="section-note">流程定义阶段，不规定你必须在某个工具里写完所有内容。</p>
          </div>
          <button class="btn btn-sm btn-secondary" @click="openWorkflowCreate">
            <AppIcon name="plus" :size="14" />
            新建流程
          </button>
        </div>

        <EmptyState
          v-if="visibleWorkflows.length === 0"
          title="还没有学习流程"
          description="可以从“论文阅读”或“费曼学习”预设开始，再调整阶段。"
        >
          <button class="btn btn-sm btn-secondary" @click="openWorkflowCreate">创建流程</button>
        </EmptyState>

        <div v-else class="workflow-grid">
          <article
            v-for="workflow in visibleWorkflows"
            :key="workflow.id"
            class="workflow-card card"
            :class="{ archived: workflow.archivedAt }"
          >
            <div class="workflow-top">
              <div class="workflow-title-line">
                <span class="workflow-mark"><AppIcon name="layers" :size="15" /></span>
                <h4>{{ workflow.name }}</h4>
              </div>
              <div class="row-actions">
                <button
                  v-if="!workflow.archivedAt"
                  class="icon-btn"
                  title="编辑流程"
                  aria-label="编辑流程"
                  @click="openWorkflowEdit(workflow)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="workflow.archivedAt ? '恢复流程' : '归档流程'"
                  :aria-label="workflow.archivedAt ? '恢复流程' : '归档流程'"
                  @click="askArchive('workflow', workflow.id, workflow.name, workflow.archivedAt)"
                >
                  <AppIcon :name="workflow.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>
            <p class="workflow-desc">{{ workflow.description || '还没有流程说明。' }}</p>
            <div class="workflow-meta">
              <span class="badge">{{ workflow.stages.length }} 个阶段</span>
              <span class="badge">{{ formatDuration(workflow.defaultDuration) }}</span>
              <span v-if="workflow.archivedAt" class="badge badge-amber">已归档</span>
            </div>
            <div class="workflow-stages">
              <span v-for="(stage, index) in workflow.stages" :key="stage.key" class="workflow-stage">
                <span class="ws-index">{{ index + 1 }}</span>
                {{ stage.name }}
              </span>
            </div>
            <p class="workflow-types">
              {{ workflow.applicableTaskTypes.map((type) => taskTypeLabels[type]).join(' / ') }}
            </p>
            <p v-if="workflow.externalToolSuggestions.length" class="workflow-tools">
              外部工具：{{ workflow.externalToolSuggestions.join('、') }}
            </p>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'knowledge'" class="card card-pad knowledge-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="bulb" :size="16" />
              知识点
            </h3>
            <p class="section-note">掌握程度与复习状态分开：复习到期不等于已经遗忘。</p>
          </div>
          <button class="btn btn-sm btn-secondary" @click="openKnowledgeCreate">
            <AppIcon name="plus" :size="14" />
            新建知识点
          </button>
        </div>

        <EmptyState
          v-if="visibleKnowledge.length === 0"
          title="还没有知识点"
          description="知识点来自学习输出。不要为每一次阅读创建闪卡，只保留值得反复回忆的内容。"
        >
          <button class="btn btn-sm btn-secondary" @click="openKnowledgeCreate">创建知识点</button>
        </EmptyState>

        <ul v-else class="knowledge-list">
          <li v-for="item in visibleKnowledge" :key="item.id" class="knowledge-row">
            <div class="knowledge-level" :class="masteryClass(item.masteryLevel)">
              {{ item.masteryLevel }}
            </div>
            <div class="knowledge-main">
              <div class="knowledge-head">
                <span class="knowledge-name">{{ item.title }}</span>
                <span class="badge">{{ masteryLevelLabels[item.masteryLevel] }}</span>
                <span v-if="item.archivedAt" class="badge badge-amber">已归档</span>
              </div>
              <p class="knowledge-desc">{{ item.description || '还没有补充说明。' }}</p>
              <div class="knowledge-meta">
                <span v-if="item.source">来源：{{ item.source }}</span>
                <span>上次复习：{{ item.lastReviewedAt ? relativeDay(item.lastReviewedAt) : '尚未复习' }}</span>
              </div>
            </div>
            <div class="knowledge-actions">
              <button
                class="btn btn-sm btn-secondary"
                @click="openScheduleCreate(item)"
              >
                安排复习
              </button>
              <button
                v-if="!item.archivedAt"
                class="icon-btn"
                title="编辑知识点"
                aria-label="编辑知识点"
                @click="openKnowledgeEdit(item)"
              >
                <AppIcon name="sliders" :size="14" />
              </button>
              <button
                class="icon-btn"
                :title="item.archivedAt ? '恢复知识点' : '归档知识点'"
                :aria-label="item.archivedAt ? '恢复知识点' : '归档知识点'"
                @click="askArchive('knowledge', item.id, item.title, item.archivedAt)"
              >
                <AppIcon :name="item.archivedAt ? 'archive' : 'trash'" :size="14" />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section v-else-if="activeView === 'reviews'" class="review-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="refresh" :size="16" />
              间隔复习
            </h3>
            <p class="section-note">主动回忆后记录表现，再决定下一次复习日期。默认间隔会随回忆结果调整。</p>
          </div>
          <button class="btn btn-sm btn-secondary" @click="openScheduleCreate()">
            <AppIcon name="plus" :size="14" />
            安排复习
          </button>
        </div>

        <article class="card card-pad due-card">
          <div class="section-head">
            <h4 class="section-title">
              <AppIcon name="clock" :size="15" />
              待复习
              <span class="count-pill count-danger">{{ dueReviews.length }}</span>
            </h4>
          </div>
          <EmptyState
            v-if="dueReviews.length === 0"
            title="没有到期的复习"
            description="复习到期只表示建议做一次主动回忆，不代表知识点已经遗忘。"
          />
          <ul v-else class="review-list">
            <li v-for="row in dueReviews" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ knowledgeTitle(row.knowledgeItemId) }}</span>
                <div class="review-meta">
                  <span>{{ formatShortDate(row.scheduledAt) }} 到期（{{ relativeDay(row.scheduledAt) }}）</span>
                  <span v-if="row.externalTool">外部工具：{{ row.externalTool }}</span>
                </div>
              </div>
              <div class="review-actions">
                <a
                  v-if="row.externalUrl"
                  :href="row.externalUrl"
                  class="btn btn-sm btn-ghost"
                  target="_blank"
                  rel="noopener"
                >
                  打开工具
                  <AppIcon name="external" :size="12" />
                </a>
                <button class="btn btn-sm btn-secondary" @click="handleSkipReview(row)">跳过</button>
                <button class="btn btn-sm btn-primary" @click="openReview(row)">开始复习</button>
              </div>
            </li>
          </ul>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h4 class="section-title">
              <AppIcon name="calendar" :size="15" />
              后续安排
              <span class="count-pill">{{ upcomingReviews.length }}</span>
            </h4>
          </div>
          <EmptyState
            v-if="upcomingReviews.length === 0"
            title="没有后续复习安排"
            description="可以为知识点安排复习，或在会话中关联知识点后创建。"
          />
          <ul v-else class="review-list compact">
            <li v-for="row in upcomingReviews.slice(0, 6)" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ knowledgeTitle(row.knowledgeItemId) }}</span>
                <div class="review-meta">
                  <span>{{ formatDate(row.scheduledAt) }}（{{ relativeDay(row.scheduledAt) }}）</span>
                  <span v-if="row.externalTool">{{ row.externalTool }}</span>
                </div>
              </div>
              <span class="badge">{{ reviewScheduleStatusLabels[row.status] }}</span>
            </li>
          </ul>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h4 class="section-title">
              <AppIcon name="check" :size="15" />
              已完成复习
            </h4>
          </div>
          <EmptyState v-if="completedReviews.length === 0" title="还没有复习记录" description="完成一次复习后，这里会保留历史表现。" />
          <ul v-else class="review-list compact">
            <li v-for="row in completedReviews.slice(0, 8)" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ knowledgeTitle(row.knowledgeItemId) }}</span>
                <div class="review-meta">
                  <span>{{ formatDateTime(row.completedAt) }}</span>
                  <span>回忆 {{ row.recallResult }}/4 · 难度 {{ row.difficulty }}/5</span>
                  <span v-if="row.nextReviewAt">下次 {{ formatShortDate(row.nextReviewAt) }}</span>
                </div>
              </div>
              <span class="badge badge-accent">完成</span>
            </li>
          </ul>
        </article>
      </section>

      <section v-else class="card card-pad resource-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="book" :size="16" />
              资源与外部工具
            </h3>
            <p class="section-note">系统只保存链接和元数据，不重复开发笔记、闪卡或文献管理器。</p>
          </div>
          <button class="btn btn-sm btn-secondary" @click="openResourceCreate">
            <AppIcon name="plus" :size="14" />
            添加资源
          </button>
        </div>

        <EmptyState
          v-if="visibleResources.length === 0"
          title="还没有外部资源"
          description="可以添加 Anki、Obsidian、Zotero、GitHub 或课程链接。"
        >
          <button class="btn btn-sm btn-secondary" @click="openResourceCreate">添加第一个资源</button>
        </EmptyState>

        <div v-else class="resource-grid">
          <article
            v-for="item in visibleResources"
            :key="item.id"
            class="resource-card"
            :class="{ archived: item.archivedAt }"
          >
            <div class="resource-top">
              <span class="resource-type">{{ resourceTypeLabels[item.resourceType] }}</span>
              <div class="row-actions">
                <button
                  v-if="!item.archivedAt"
                  class="icon-btn"
                  title="编辑资源"
                  aria-label="编辑资源"
                  @click="openResourceEdit(item)"
                >
                  <AppIcon name="sliders" :size="14" />
                </button>
                <button
                  class="icon-btn"
                  :title="item.archivedAt ? '恢复资源' : '归档资源'"
                  :aria-label="item.archivedAt ? '恢复资源' : '归档资源'"
                  @click="askArchive('resource', item.id, item.title, item.archivedAt)"
                >
                  <AppIcon :name="item.archivedAt ? 'archive' : 'trash'" :size="14" />
                </button>
              </div>
            </div>
            <h4 class="resource-name">{{ item.title }}</h4>
            <p class="resource-desc">{{ item.description || '还没有说明。' }}</p>
            <div class="resource-foot">
              <span class="resource-source">{{ item.source || resourceTypeLabels[item.resourceType] }}</span>
              <a
                v-if="item.externalUrl"
                :href="item.externalUrl"
                class="resource-link"
                target="_blank"
                rel="noopener"
              >
                打开
                <AppIcon name="external" :size="12" />
              </a>
            </div>
          </article>
        </div>
      </section>
    </template>

    <ModalDialog :open="recordModalOpen" :title="recordEditingId ? '编辑学习记录' : '添加学习记录'" subtitle="记录会保留在本次学习会话中，并成为后续复盘的依据。" size="lg" @close="recordModalOpen = false">
      <form class="form" @submit.prevent="submitRecord">
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="record-type">记录类型</label>
            <select id="record-type" v-model="recordForm.recordType" class="select">
              <option v-for="type in recordTypes" :key="type" :value="type">
                {{ learningRecordTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="record-assessment">自评（0—4）</label>
            <select id="record-assessment" v-model.number="recordForm.selfAssessment" class="select">
              <option v-for="option in recallOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="record-title">标题</label>
          <input id="record-title" v-model="recordForm.title" class="input" placeholder="例如：WalkSAT 执行流程草图" />
        </div>
        <div class="field">
          <label class="field-label" for="record-content">内容</label>
          <textarea id="record-content" v-model="recordForm.content" class="textarea" placeholder="用自己的语言写，不要直接复制原文。" />
        </div>
        <div class="field">
          <label class="field-label" for="record-url">外部记录链接</label>
          <input id="record-url" v-model="recordForm.externalUrl" class="input" placeholder="Obsidian、GitHub 或其他工具链接（可选）" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="recordModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : recordEditingId ? '保存修改' : '保存记录' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="finishOpen" title="完成学习会话" subtitle="记录本次实际表现和一句反思，下一次学习可以据此调整。" @close="finishOpen = false">
      <div class="form">
        <div class="field">
          <label class="field-label" for="finish-assessment">本次实际表现</label>
          <select id="finish-assessment" v-model.number="finishForm.actualAssessment" class="select">
            <option v-for="option in recallOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="finish-reflection">反思（可选）</label>
          <textarea id="finish-reflection" v-model="finishForm.reflection" class="textarea" placeholder="哪些内容不能独立回忆？发现了什么知识盲区？" />
          <span class="field-hint">如果填写，会生成一条“反思”学习记录。</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="finishOpen = false">继续学习</button>
          <button class="btn btn-primary" :disabled="finishing" @click="submitFinish">
            {{ finishing ? '保存中…' : '完成并保存' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="workflowModalOpen" :title="workflowEditingId ? '编辑学习流程' : '创建学习流程'" subtitle="阶段可以增删。系统负责提醒输出和保存证据，不替你在外部工具里完成内容。" size="lg" @close="workflowModalOpen = false">
      <form class="form" @submit.prevent="submitWorkflow">
        <div v-if="!workflowEditingId" class="field">
          <label class="field-label" for="workflow-preset">从预设开始</label>
          <select id="workflow-preset" v-model="presetKey" class="select" @change="onPresetChange">
            <option value="">自定义流程</option>
            <option v-for="preset in WORKFLOW_PRESETS" :key="preset.key" :value="preset.key">
              {{ preset.name }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="workflow-name">流程名称</label>
          <input id="workflow-name" v-model="workflowForm.name" class="input" placeholder="例如：论文阅读 · 预习到批判" />
        </div>
        <div class="field">
          <label class="field-label" for="workflow-desc">流程说明</label>
          <textarea id="workflow-desc" v-model="workflowForm.description" class="textarea" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="workflow-duration">默认时长（分钟）</label>
            <input id="workflow-duration" v-model.number="workflowForm.defaultDuration" class="input" type="number" min="0" step="5" />
          </div>
          <div class="field">
            <label class="field-label" for="workflow-tools">建议外部工具</label>
            <input id="workflow-tools" v-model="workflowForm.externalTools" class="input" placeholder="用逗号分隔，例如：Zotero, Obsidian" />
          </div>
        </div>
        <div class="field">
          <span class="field-label">适用任务类型</span>
          <div class="chip-check-list">
            <label v-for="type in taskTypeOptions" :key="type" class="chip-check" :class="{ selected: workflowForm.applicableTaskTypes.includes(type) }">
              <input type="checkbox" :checked="workflowForm.applicableTaskTypes.includes(type)" @change="toggleWorkflowTaskType(type, $event)" />
              {{ taskTypeLabels[type] }}
            </label>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="workflow-output">输出要求</label>
            <textarea id="workflow-output" v-model="workflowForm.outputRequirements" class="textarea" />
          </div>
          <div class="field">
            <label class="field-label" for="workflow-feedback">反馈要求</label>
            <textarea id="workflow-feedback" v-model="workflowForm.feedbackRequirements" class="textarea" />
          </div>
        </div>

        <div class="field">
          <div class="stage-editor-head">
            <span class="field-label">学习阶段（{{ workflowForm.stages.length }}）</span>
            <button type="button" class="btn btn-sm btn-secondary" @click="addStage">
              <AppIcon name="plus" :size="13" />
              添加阶段
            </button>
          </div>
          <div class="stage-editor-list">
            <div v-for="(stage, index) in workflowForm.stages" :key="stage.key || index" class="stage-editor">
              <div class="stage-editor-title">
                <span class="stage-editor-index">{{ index + 1 }}</span>
                <input v-model="stage.name" class="input" placeholder="阶段名称" />
                <button type="button" class="icon-btn" title="删除阶段" aria-label="删除阶段" @click="removeStage(index)">
                  <AppIcon name="close" :size="14" />
                </button>
              </div>
              <div class="form-grid">
                <div class="field">
                  <span class="field-label">阶段目标</span>
                  <input v-model="stage.goal" class="input" placeholder="这个阶段要达成什么？" />
                </div>
                <div class="field">
                  <span class="field-label">建议分钟</span>
                  <input v-model.number="stage.suggestedMinutes" class="input" type="number" min="0" step="5" />
                </div>
              </div>
              <div class="field">
                <span class="field-label">阶段提示</span>
                <textarea v-model="stage.prompt" class="textarea" placeholder="告诉学习者具体做什么，例如“关闭论文，用自己的语言写出算法流程”。" />
              </div>
              <div class="stage-editor-foot">
                <input v-model="stage.externalTool" class="input stage-tool-input" placeholder="外部工具（可选）" />
                <label class="inline-check">
                  <input v-model="stage.required" type="checkbox" />
                  必需阶段
                </label>
                <label class="inline-check">
                  <input v-model="stage.needsRecord" type="checkbox" />
                  建议留记录
                </label>
              </div>
            </div>
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="workflowModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : workflowEditingId ? '保存修改' : '创建流程' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="knowledgeModalOpen" :title="knowledgeEditingId ? '编辑知识点' : '新建知识点'" subtitle="知识点是值得复习的最小单位。不要把所有句子都变成闪卡。" @close="knowledgeModalOpen = false">
      <form class="form" @submit.prevent="submitKnowledge">
        <div class="field">
          <label class="field-label" for="knowledge-title">名称</label>
          <input id="knowledge-title" v-model="knowledgeForm.title" class="input" placeholder="例如：WalkSAT 变量选择" />
        </div>
        <div class="field">
          <label class="field-label" for="knowledge-desc">说明</label>
          <textarea id="knowledge-desc" v-model="knowledgeForm.description" class="textarea" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="knowledge-source">来源</label>
            <input id="knowledge-source" v-model="knowledgeForm.source" class="input" placeholder="论文、课程、项目" />
          </div>
          <div class="field">
            <label class="field-label" for="knowledge-mastery">掌握程度</label>
            <select id="knowledge-mastery" v-model="knowledgeForm.masteryLevel" class="select">
              <option v-for="level in masteryLevels" :key="level" :value="level">
                {{ masteryLevelLabels[level] }}
              </option>
            </select>
          </div>
        </div>
        <p class="field-hint">掌握程度用于描述理解状态；复习到期是调度状态，两者不混在一起。</p>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="knowledgeModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : knowledgeEditingId ? '保存修改' : '创建知识点' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="scheduleModalOpen" title="安排复习" subtitle="默认在晚上 20:00 到期，可以稍后根据回忆表现调整下一次日期。" @close="scheduleModalOpen = false">
      <form class="form" @submit.prevent="submitSchedule">
        <div class="field">
          <label class="field-label" for="schedule-knowledge">知识点</label>
          <select id="schedule-knowledge" v-model="scheduleForm.knowledgeItemId" class="select">
            <option value="" disabled>请选择知识点</option>
            <option v-for="item in activeKnowledge" :key="item.id" :value="item.id">
              {{ item.title }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="schedule-date">复习日期</label>
          <input id="schedule-date" v-model="scheduleForm.scheduledDate" class="input" type="date" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="schedule-tool">外部工具</label>
            <input id="schedule-tool" v-model="scheduleForm.externalTool" class="input" placeholder="Anki / 纸质笔记" />
          </div>
          <div class="field">
            <label class="field-label" for="schedule-url">工具链接</label>
            <input id="schedule-url" v-model="scheduleForm.externalUrl" class="input" placeholder="可选" />
          </div>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="scheduleModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : '安排复习' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="reviewModalOpen" :title="`复习 · ${reviewTarget ? knowledgeTitle(reviewTarget.knowledgeItemId) : ''}`" subtitle="先主动回忆，再看结果。回忆表现会影响下一次间隔。" @close="reviewModalOpen = false">
      <div class="form">
        <div class="recall-prompt">
          <span class="recall-prompt-label">只看名称，先试着解释</span>
          <strong>{{ reviewKnowledgeItem?.title ?? '知识点' }}</strong>
          <span>不要先展开答案。用自己的语言写下核心概念、步骤或一个例子。</span>
        </div>
        <div class="field">
          <label class="field-label" for="review-recall-draft">我的解释</label>
          <textarea
            id="review-recall-draft"
            v-model="recallDraft"
            class="textarea"
            placeholder="例如：WalkSAT 每次从当前未满足子句中选择一个变量，再按概率随机翻转或选择使满足子句最多的变量……"
          />
        </div>
        <button v-if="!recallRevealed" type="button" class="btn btn-secondary recall-reveal" @click="revealRecallReference">
          <AppIcon name="bulb" :size="14" />
          显示参考内容
        </button>
        <div v-else class="recall-reference">
          <div class="recall-reference-head">
            <span>参考内容</span>
            <span v-if="reviewKnowledgeItem?.masteryLevel" class="badge">{{ reviewKnowledgeItem.masteryLevel }}</span>
          </div>
          <p>{{ reviewKnowledgeItem?.description || '这个知识点还没有填写说明，请结合来源自行核对回忆内容。' }}</p>
          <small v-if="reviewKnowledgeItem?.source">来源：{{ reviewKnowledgeItem.source }}</small>
        </div>
        <div class="field">
          <label class="field-label" for="review-recall">回忆结果</label>
          <select id="review-recall" v-model.number="reviewForm.recall" class="select" :disabled="!recallRevealed">
            <option v-for="option in recallOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <span v-if="!recallRevealed" class="field-hint">显示参考内容后，再根据实际回忆情况选择结果。</span>
        </div>
        <div class="field">
          <label class="field-label" for="review-difficulty">本次难度（1—5）</label>
          <input id="review-difficulty" v-model.number="reviewForm.difficulty" class="input" type="number" min="1" max="5" :disabled="!recallRevealed" />
        </div>
        <div v-if="recallRevealed" class="next-review">
          <AppIcon name="calendar" :size="15" />
          <span>下次复习建议：<strong>{{ nextReviewPreview }}</strong>（约 {{ nextReviewInterval(reviewForm.recall) }} 天后）</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="reviewModalOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="reviewing || !recallRevealed" @click="submitReview">
            {{ reviewing ? '保存中…' : '记录复习结果' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="detailSession !== null" :title="detailSession ? taskTitle(detailSession.taskId) : '学习会话'" :subtitle="detailSession ? workflowName(detailSession.workflowId) : ''" size="lg" @close="detailSession = null">
      <div v-if="detailSession" class="session-detail">
        <div class="detail-meta">
          <span class="badge" :class="`status-${detailSession.status.toLowerCase()}`">{{ sessionStatusLabels[detailSession.status] }}</span>
          <span>{{ formatDateTime(detailSession.startedAt) }}</span>
          <span v-if="detailSession.endedAt">→ {{ formatDateTime(detailSession.endedAt) }}</span>
          <span class="detail-duration">{{ formatDuration(detailSession.actualDuration) }}</span>
        </div>
        <div class="detail-grid">
          <div>
            <span class="detail-label">学习意图</span>
            <p>{{ detailSession.learningIntention || '未记录' }}</p>
          </div>
          <div>
            <span class="detail-label">自评</span>
            <p>学习前：{{ predictionLabel(detailSession.selfPrediction) }}<br />学习后：{{ detailSession.actualAssessment !== null ? recallOptions[detailSession.actualAssessment]?.label ?? '未记录' : '未记录' }}</p>
          </div>
        </div>
        <div class="divider" />
        <p class="detail-label">学习记录（{{ detailRecords.length }}）</p>
        <div v-if="detailRecords.length === 0" class="record-empty">这次会话没有留下记录。</div>
        <article v-for="record in detailRecords" :key="record.id" class="record-item">
          <div class="record-head">
            <span class="record-type">{{ learningRecordTypeLabels[record.recordType] }}</span>
            <span class="record-time">{{ formatDateTime(record.occurredAt) }}</span>
          </div>
          <p class="record-name">{{ record.title }}</p>
          <p class="record-content">{{ record.content }}</p>
          <a v-if="record.externalUrl" :href="record.externalUrl" class="record-link" target="_blank" rel="noopener">
            查看外部记录
            <AppIcon name="external" :size="11" />
          </a>
        </article>
        <div v-if="detailKnowledge.length" class="detail-knowledge">
          <p class="detail-label">关联知识点</p>
          <div class="detail-tags">
            <span v-for="item in detailKnowledge" :key="item.id" class="detail-tag">
              <span class="level-pill">{{ item.masteryLevel }}</span>
              {{ item.title }}
            </span>
          </div>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="resourceModalOpen" :title="resourceEditingId ? '编辑资源' : '添加资源'" subtitle="只保存名称、类型、链接和说明，内容留在原来的工具里。" @close="resourceModalOpen = false">
      <form class="form" @submit.prevent="submitResource">
        <div class="field">
          <label class="field-label" for="resource-title">名称</label>
          <input id="resource-title" v-model="resourceForm.title" class="input" placeholder="例如：研究笔记库" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="resource-type">类型</label>
            <select id="resource-type" v-model="resourceForm.resourceType" class="select">
              <option v-for="type in resourceTypes" :key="type" :value="type">
                {{ resourceTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="resource-source">来源</label>
            <input id="resource-source" v-model="resourceForm.source" class="input" placeholder="Obsidian / Anki / 课程名" />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="resource-url">外部链接</label>
          <input id="resource-url" v-model="resourceForm.externalUrl" class="input" placeholder="https:// 或 obsidian://、anki://" />
        </div>
        <div class="field">
          <label class="field-label" for="resource-desc">说明</label>
          <textarea id="resource-desc" v-model="resourceForm.description" class="textarea" />
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="resourceModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : resourceEditingId ? '保存修改' : '添加资源' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div
        v-if="confirmTarget && !confirmTarget.archived && ['workflow', 'knowledge', 'resource'].includes(confirmTarget.kind)"
        class="alert alert-warning confirm-note"
      >
        <AppIcon name="warning" :size="15" />
        <span>归档不会删除历史会话、记录、复习记录或关联关系。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button class="btn btn-primary" :disabled="confirmBusy" @click="runConfirm">
          {{ confirmBusy ? '处理中…' : confirmActionLabel }}
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

.learning-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.learning-stat {
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

.icon-danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.learning-stat > div {
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
  padding: 0 11px;
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

.learning-loading {
  height: 380px;
}

.workbench {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.session-shell {
  overflow: hidden;
}

.session-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 26px 18px;
  background:
    radial-gradient(100% 130% at 100% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 55%),
    var(--surface);
  border-bottom: 1px solid var(--line-faint);
}

.session-heading {
  min-width: 0;
}

.session-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.session-heading h3 {
  margin-top: 9px;
  font-family: var(--font-serif);
  font-size: 21px;
  font-weight: 600;
  line-height: 1.5;
}

.session-started {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10.5px;
}

.session-timer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: none;
}

.timer-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.session-timer strong {
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 600;
  color: var(--accent);
}

.stage-progress {
  display: flex;
  gap: 0;
  padding: 0 26px;
  border-bottom: 1px solid var(--line-faint);
  overflow-x: auto;
}

.stage-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 16px 10px 0;
  color: var(--muted);
  font-size: 10.5px;
  white-space: nowrap;
}

.stage-step::after {
  content: '';
  width: 22px;
  height: 1px;
  margin-left: 4px;
  background: var(--line-strong);
}

.stage-step:last-child::after {
  display: none;
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.stage-step.active {
  color: var(--accent-ink);
  font-weight: 600;
}

.stage-step.active .stage-index {
  background: var(--accent);
  color: var(--on-accent);
}

.stage-step.passed .stage-index {
  background: var(--accent-soft);
  color: var(--accent);
}

.session-grid {
  display: grid;
  grid-template-columns:
    minmax(180px, 0.68fr)
    minmax(0, 1.7fr)
    minmax(230px, 0.82fr);
}

.session-rail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  padding: 20px 16px;
  border-right: 1px solid var(--line-faint);
  background: color-mix(in srgb, var(--surface-muted) 48%, transparent);
}

.rail-block {
  min-width: 0;
}

.rail-block + .rail-block {
  padding-top: 16px;
  border-top: 1px solid var(--line-faint);
}

.rail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.rail-count {
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: 0;
}

.stage-progress-rail {
  flex-direction: column;
  gap: 4px;
  margin-top: 9px;
  padding: 0;
  border-bottom: none;
  overflow: visible;
}

.stage-progress-rail .stage-step {
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.stage-progress-rail .stage-step::after {
  display: none;
}

.stage-progress-rail .stage-step:hover {
  background: var(--surface);
}

.stage-progress-rail .stage-step.active {
  background: var(--accent-soft);
}

.stage-progress-rail .stage-step.passed {
  color: var(--ink-soft);
}

.session-facts {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 9px;
}

.session-facts > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.session-facts dt {
  color: var(--muted);
  font-size: 9.5px;
}

.session-facts dd {
  color: var(--ink-soft);
  font-size: 9.5px;
  text-align: right;
}

.session-facts .fact-accent {
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 600;
}

.rail-task {
  margin-top: 7px;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.55;
}

.rail-meta,
.rail-empty {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.55;
}

.rail-prompt {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--line);
  color: var(--ink-soft);
  font-size: 10.5px;
  line-height: 1.65;
}

.session-main {
  padding: 20px 22px 22px;
  min-width: 0;
}

.stage-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.stage-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-eyebrow {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.stage-card h4 {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
}

.stage-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

.stage-goal {
  margin-top: 9px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-soft);
}

.stage-prompt {
  margin-top: 4px;
  color: var(--ink-soft);
  font-size: 12.5px;
  line-height: 1.75;
}

.stage-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
}

.stage-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
}

.empty-stage,
.record-empty {
  padding: 16px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 11.5px;
}

.session-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 13px;
}

.flip {
  transform: rotate(180deg);
}

.session-interrupt {
  color: var(--danger);
  margin-left: auto;
}

.session-records {
  margin-top: 22px;
}

.record-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
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

.count-danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.record-item {
  padding: 11px 0;
  border-top: 1px solid var(--line-faint);
}

.record-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.record-type {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 9px;
  font-weight: 550;
}

.record-time {
  font-size: 9.5px;
  color: var(--muted);
}

.record-edit {
  margin-left: auto;
  width: 26px;
  height: 26px;
}

.record-name {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}

.record-content {
  margin-top: 2px;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-line;
}

.record-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  font-size: 10px;
}

.session-side {
  padding: 20px;
  border-left: 1px solid var(--line-faint);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.side-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
}

.side-hint {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.6;
}

.knowledge-link-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.knowledge-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 10.5px;
  color: var(--ink-soft);
  cursor: pointer;
}

.knowledge-link.selected {
  border-color: var(--accent);
  background: var(--accent-faint);
  color: var(--accent-ink);
}

.knowledge-link input {
  accent-color: var(--accent);
}

.knowledge-link-level {
  margin-left: auto;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.side-resource-list,
.side-session-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
}

.side-resource-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--line-faint);
}

.side-resource-list li:first-child,
.side-session-list li:first-child {
  border-top: none;
}

.side-resource-list a,
.side-resource-list li > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-resource-list small,
.side-session-list small {
  flex: none;
  color: var(--muted);
  font-size: 8.5px;
}

.side-session-list li {
  border-top: 1px solid var(--line-faint);
}

.side-session-list button {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 7px 0;
  text-align: left;
}

.side-session-list button > span {
  overflow: hidden;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outcome-card {
  overflow: hidden;
  border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
  box-shadow: 0 12px 34px color-mix(in srgb, var(--accent) 8%, transparent);
}

.outcome-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--line-faint);
  background:
    radial-gradient(110% 150% at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%),
    var(--surface);
}

.outcome-head h3 {
  margin-top: 5px;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
}

.outcome-head p:last-child {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10.5px;
}

.outcome-summary {
  display: flex;
  align-items: center;
  gap: 14px;
}

.outcome-summary > span {
  display: flex;
  flex-direction: column;
  color: var(--muted);
  font-size: 8.5px;
  text-align: right;
}

.outcome-summary strong {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.outcome-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.outcome-grid > section {
  min-width: 0;
  padding: 18px 20px;
  border-top: 1px solid var(--line-faint);
  border-right: 1px solid var(--line-faint);
}

.outcome-grid > section:nth-child(-n + 3) {
  border-top: none;
}

.outcome-grid > section:nth-child(3n) {
  border-right: none;
}

.outcome-grid h4 {
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.outcome-grid p,
.outcome-grid li,
.outcome-grid a {
  color: var(--ink-soft);
  font-size: 10.5px;
  line-height: 1.65;
}

.outcome-grid ul {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  padding-left: 15px;
  list-style: disc;
}

.outcome-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.outcome-list article {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.outcome-list a {
  color: var(--accent);
  font-weight: 600;
}

.outcome-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.outcome-tags > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  color: var(--ink-soft);
  font-size: 9.5px;
}

.outcome-empty {
  color: var(--muted) !important;
  font-style: italic;
}

.side-prompt {
  margin-top: 5px;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
}

.side-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 10px;
}

.start-card {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.3fr);
  gap: 28px;
  padding: 26px;
  background:
    radial-gradient(100% 140% at 0% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 55%),
    var(--surface);
}

.start-copy h3 {
  margin-top: 7px;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
}

.start-copy p {
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 11.5px;
  line-height: 1.75;
}

.start-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.start-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.start-submit-field {
  justify-content: flex-end;
}

.start-submit-field .btn {
  width: 100%;
}

.start-empty {
  align-self: center;
}

.recent-card {
  padding-top: 18px;
}

.session-list {
  display: flex;
  flex-direction: column;
}

.session-list-item {
  border-top: 1px solid var(--line-faint);
}

.session-list-item:first-child {
  border-top: none;
}

.session-list-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 0;
  text-align: left;
}

.session-status-dot {
  width: 6px;
  height: 6px;
  flex: none;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--muted);
}

.session-completed {
  background: var(--success);
}

.session-interrupted {
  background: var(--danger);
}

.session-in_progress {
  background: var(--amber);
}

.session-list-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-list-title {
  font-size: 12px;
  font-weight: 600;
}

.session-intent {
  margin-left: 6px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 400;
}

.session-list-meta {
  color: var(--muted);
  font-size: 10px;
}

.session-list-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.session-duration {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.workflow-card {
  padding: 16px;
}

.workflow-card.archived {
  opacity: 0.65;
}

.workflow-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.workflow-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workflow-mark {
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

.workflow-title-line h4 {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.45;
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

.workflow-desc {
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.65;
}

.workflow-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 9px;
}

.workflow-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-faint);
}

.workflow-stage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 9.5px;
}

.ws-index {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--accent);
}

.workflow-types,
.workflow-tools {
  margin-top: 7px;
  color: var(--muted);
  font-size: 9.5px;
}

.knowledge-list {
  display: flex;
  flex-direction: column;
}

.knowledge-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 0;
  border-top: 1px solid var(--line-faint);
}

.knowledge-row:first-child {
  border-top: none;
}

.knowledge-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-muted);
  color: var(--ink-faint);
}

.mastery-l0,
.mastery-l1 {
  background: var(--surface-muted);
  color: var(--muted);
}

.mastery-l2 {
  background: var(--blue-soft);
  color: var(--blue);
}

.mastery-l3 {
  background: var(--accent-soft);
  color: var(--accent);
}

.mastery-l4 {
  background: var(--violet-soft);
  color: var(--violet);
}

.knowledge-main {
  flex: 1;
  min-width: 0;
}

.knowledge-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.knowledge-name {
  font-size: 12.5px;
  font-weight: 600;
}

.knowledge-desc {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.knowledge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 9.5px;
}

.knowledge-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.review-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-list {
  display: flex;
  flex-direction: column;
}

.review-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line-faint);
}

.review-row:first-child {
  border-top: none;
}

.review-main {
  flex: 1;
  min-width: 0;
}

.review-name {
  font-size: 12px;
  font-weight: 600;
}

.review-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 12px;
  margin-top: 2px;
  color: var(--muted);
  font-size: 9.5px;
}

.review-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}

.review-list.compact .review-row {
  padding: 8px 0;
}

.due-card {
  border-left: 3px solid var(--amber);
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.resource-card {
  display: flex;
  flex-direction: column;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.resource-card.archived {
  opacity: 0.65;
}

.resource-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.resource-type {
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-faint);
  font-size: 9px;
}

.resource-name {
  margin-top: 8px;
  font-size: 12.5px;
  font-weight: 600;
}

.resource-desc {
  margin-top: 3px;
  min-height: 34px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.resource-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--line-faint);
}

.resource-source {
  color: var(--muted);
  font-size: 9.5px;
}

.resource-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
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

.stage-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
}

.stage-editor-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stage-editor {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.stage-editor-title {
  display: flex;
  align-items: center;
  gap: 7px;
}

.stage-editor-title .input {
  font-weight: 600;
}

.stage-editor-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.stage-editor .form-grid {
  margin-top: 8px;
}

.stage-editor > .field {
  margin-top: 8px;
}

.stage-editor-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.stage-tool-input {
  flex: 1;
  min-width: 140px;
}

.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-soft);
  font-size: 10.5px;
  cursor: pointer;
  white-space: nowrap;
}

.inline-check input {
  accent-color: var(--accent);
}

.next-review {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 11.5px;
}

.next-review strong {
  font-family: var(--font-mono);
  font-size: 11px;
}

.recall-prompt {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background:
    radial-gradient(100% 160% at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 65%),
    var(--accent-faint);
}

.recall-prompt-label {
  color: var(--accent);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.recall-prompt strong {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
}

.recall-prompt > span:last-child {
  color: var(--ink-soft);
  font-size: 10.5px;
  line-height: 1.65;
}

.recall-reveal {
  align-self: flex-start;
}

.recall-reference {
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.recall-reference-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.recall-reference p {
  margin-top: 6px;
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-line;
}

.recall-reference small {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 9.5px;
}

.session-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 10.5px;
}

.status-completed {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.status-interrupted {
  background: var(--danger-soft);
  color: var(--danger);
}

.detail-duration {
  margin-left: auto;
  font-family: var(--font-mono);
  color: var(--ink-soft);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.detail-label {
  display: block;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.detail-grid p {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.65;
}

.detail-knowledge {
  padding-top: 8px;
  border-top: 1px solid var(--line-faint);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.detail-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  font-size: 10px;
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-note {
  margin-top: 14px;
}

@media (max-width: 1120px) {
  .session-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .session-rail {
    border-right: none;
    border-bottom: 1px solid var(--line-faint);
  }

  .session-side {
    border-left: none;
    border-top: 1px solid var(--line-faint);
  }

  .outcome-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .outcome-grid > section:nth-child(3n) {
    border-right: 1px solid var(--line-faint);
  }

  .outcome-grid > section:nth-child(2n) {
    border-right: none;
  }

  .outcome-grid > section:nth-child(-n + 3) {
    border-top: 1px solid var(--line-faint);
  }

  .outcome-grid > section:nth-child(-n + 2) {
    border-top: none;
  }

  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .learning-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workflow-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .start-card {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 620px) {
  .learning-stats {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid,
  .start-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .session-head {
    flex-direction: column;
  }

  .session-timer {
    align-items: flex-start;
  }

  .session-main {
    padding: 16px;
  }

  .session-side {
    padding: 16px;
  }

  .session-rail {
    padding: 16px;
  }

  .outcome-head {
    flex-direction: column;
  }

  .outcome-summary {
    width: 100%;
    justify-content: space-between;
  }

  .outcome-summary > span {
    text-align: left;
  }

  .outcome-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .outcome-grid > section,
  .outcome-grid > section:nth-child(2n),
  .outcome-grid > section:nth-child(3n) {
    border-top: 1px solid var(--line-faint);
    border-right: none;
  }

  .outcome-grid > section:first-child {
    border-top: none;
  }

  .resource-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .review-row {
    flex-wrap: wrap;
  }

  .review-actions {
    margin-left: auto;
  }

  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .session-interrupt {
    margin-left: 0;
  }
}
</style>
