<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import { useToast } from '@/composables/useToast'
import {
  useLearning,
  type LearningRecordInput,
  type ResourceInput,
  type WorkflowInput,
} from '@/composables/useLearning'
import { WORKFLOW_PRESETS, type WorkflowPreset } from '@/data/learningPresets'
import {
  LearningRecordType,
  ResourceType,
  SessionStatus,
  TaskType,
  learningRecordTypeLabels,
  resourceTypeLabels,
  reviewScheduleStatusLabels,
  sessionStatusLabels,
  taskTypeLabels,
  type LearningRecord,
  type LearningSession,
  type Resource,
  type ReviewSchedule,
  type Task,
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
  resources,
  includeArchived,
  activeWorkflows,
  activeResources,
  availableTasks,
  activeSession,
  activeWorkflow,
  activeStage,
  activeStageIndex,
  activeSessionRecords,
  elapsedMinutes,
  taskById,
  workflowById,
  recordsBySession,
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
  completeStage,
  toggleChecklistItem,
  finishSession,
  saveRecord,
  saveTaskReview,
  completeReview,
  revertReview,
  skipReview,
  saveResource,
  setResourceArchived,
} = useLearning()

type LearningView = 'workbench' | 'workflows' | 'reviews' | 'resources'
const activeView = ref<LearningView>('workbench')

const recordTypes = Object.values(LearningRecordType)
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

const currentStageIndex = computed(() => {
  const session = activeSession.value
  const workflow = activeWorkflow.value
  if (!session || !workflow) return 0
  const index = workflow.stages.findIndex((stage) => stage.key === session.currentStage)
  return index < 0 ? 0 : index
})

const activeStageCompleted = computed(() => {
  const session = activeSession.value
  const stage = activeStage.value
  if (!session || !stage) return false
  return (session.completedStages ?? []).includes(stage.key)
})

const activeChecklistDone = computed(() => {
  const session = activeSession.value
  const stage = activeStage.value
  if (!session || !stage) return []
  return session.checklistProgress?.[stage.key] ?? []
})

const activeChecklistComplete = computed(() => {
  const items = activeStage.value?.checklist ?? []
  if (items.length === 0) return true
  return items.every((item) => activeChecklistDone.value.includes(item))
})

const activeChecklistRemaining = computed(() =>
  Math.max(0, (activeStage.value?.checklist?.length ?? 0) - activeChecklistDone.value.length),
)

function checklistItemDone(item: string): boolean {
  return activeChecklistDone.value.includes(item)
}

async function toggleChecklist(item: string, event: Event): Promise<void> {
  const session = activeSession.value
  const stage = activeStage.value
  if (!session || !stage) return
  const checked = (event.target as HTMLInputElement).checked
  try {
    await toggleChecklistItem(session.id, stage.key, item, checked)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

const isLastStage = computed(() => {
  const workflow = activeWorkflow.value
  if (!workflow) return false
  return activeStageIndex.value >= workflow.stages.length - 1
})

function stageIsDone(stage: WorkflowStage): boolean {
  return (activeSession.value?.completedStages ?? []).includes(stage.key)
}

function stageIsCurrent(index: number): boolean {
  return index === currentStageIndex.value
}

function stageIsReachable(index: number): boolean {
  const workflow = activeWorkflow.value
  if (!workflow) return false
  const stage = workflow.stages[index]
  return Boolean(stage) && (stageIsDone(stage) || index <= currentStageIndex.value)
}

async function goStage(index: number): Promise<void> {
  const session = activeSession.value
  const workflow = activeWorkflow.value
  if (!session || !workflow) return
  const stage = workflow.stages[index]
  if (!stage || !stageIsReachable(index)) return
  try {
    await setStage(session.id, stage.key)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function completeCurrentStage(): Promise<void> {
  const session = activeSession.value
  const workflow = activeWorkflow.value
  const stage = activeStage.value
  if (!session || !workflow || !stage) return
  if (activeStageCompleted.value) return
  if (!activeChecklistComplete.value) {
    toastError('先完成本阶段清单，再进入下一阶段')
    return
  }
  const last = activeStageIndex.value >= workflow.stages.length - 1
  try {
    await completeStage(session.id, stage.key, last ? null : workflow.stages[activeStageIndex.value + 1]?.key ?? null)
    if (last) {
      openFinish()
    } else {
      success(`「${stage.name}」已完成`)
    }
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function returnToCurrentStage(): Promise<void> {
  await goStage(currentStageIndex.value)
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
    checklist: [],
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
    stages: preset.stages.map((stage) => ({
      ...stage,
      checklist: [...(stage.checklist ?? [])],
    })),
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
    stages: workflow.stages.map((stage) => ({
      ...stage,
      checklist: [...(stage.checklist ?? [])],
    })),
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

function addChecklistItem(stageIndex: number): void {
  const stage = workflowForm.stages[stageIndex]
  if (!stage) return
  if (!stage.checklist) stage.checklist = []
  stage.checklist.push('')
}

function removeChecklistItem(stageIndex: number, itemIndex: number): void {
  workflowForm.stages[stageIndex]?.checklist?.splice(itemIndex, 1)
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
      checklist: (stage.checklist ?? []).map((item) => item.trim()).filter(Boolean),
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


const scheduleForm = reactive({
  taskId: '',
  scheduledDate: '',
})
const scheduleModalOpen = ref(false)

function tomorrowKey(): string {
  return toDateInput(addDays(nowIso(), 1))
}

function scheduledAtFromDate(value: string): string {
  return new Date(`${value}T20:00:00`).toISOString()
}

function openScheduleCreate(task?: Task): void {
  scheduleForm.taskId = task?.id ?? availableTasks.value[0]?.id ?? ''
  scheduleForm.scheduledDate = tomorrowKey()
  formError.value = ''
  scheduleModalOpen.value = true
}

async function submitSchedule(): Promise<void> {
  formError.value = ''
  if (!scheduleForm.taskId) {
    formError.value = '请选择任务'
    return
  }
  if (!scheduleForm.scheduledDate) {
    formError.value = '请选择复习日期'
    return
  }
  saving.value = true
  try {
    await saveTaskReview(scheduleForm.taskId, scheduledAtFromDate(scheduleForm.scheduledDate))
    scheduleModalOpen.value = false
    success('复习提醒已安排，时间盒已同步')
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    saving.value = false
  }
}

async function handleCompleteReview(schedule: ReviewSchedule): Promise<void> {
  try {
    await completeReview(schedule)
    success('复习已完成，任务已标记完成')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function handleRevertReview(schedule: ReviewSchedule): Promise<void> {
  try {
    await revertReview(schedule)
    success('任务已恢复为未完成，复习记录保留')
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
}

async function handleSkipReview(schedule: ReviewSchedule): Promise<void> {
  try {
    await skipReview(schedule.id)
    success('复习提醒已取消，对应时间盒已移除')
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
  kind: 'workflow' | 'resource' | 'interrupt'
  id: string
  label: string
  archived: boolean
} | null>(null)

const confirmTitle = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') return '中断学习会话'
  return target.archived ? '恢复内容' : '归档内容'
})

const confirmText = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') {
    return `将中断当前学习会话「${target.label}」。已记录的内容会保留，会话时长会按实际时间记录。`
  }
  if (target.archived) return `将恢复「${target.label}」，它会重新出现在默认列表中。`
  return `将归档「${target.label}」。不会删除历史记录，归档后可以随时恢复。`
})

const confirmActionLabel = computed(() => {
  const target = confirmTarget.value
  if (!target) return ''
  if (target.kind === 'interrupt') return '确认中断'
  return target.archived ? '确认恢复' : '确认归档'
})

function askArchive(
  kind: 'workflow' | 'resource',
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

    } else if (target.kind === 'workflow') {
      await setWorkflowArchived(target.id, !target.archived)
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


const visibleResources = computed(() =>
  resources.value.filter((item) => includeArchived.value || !item.archivedAt),
)

function sessionRecordsCount(sessionId: string): number {
  return (recordsBySession.value[sessionId] ?? []).filter((row) => !row.archivedAt).length
}

function predictionLabel(value: number): string {
  return predictionOptions.find((option) => option.value === value)?.label ?? `${value}`
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
    activeView.value = 'reviews'
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
          不只记录学习时长。用可配置流程推动输入、输出、反馈与反思，完成后自动生成任务复习提醒。
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="activeView = 'workflows'; openWorkflowCreate()">
          <AppIcon name="layers" :size="15" />
          新建学习流程
        </button>
        <button class="btn btn-primary" @click="activeView = 'reviews'; openScheduleCreate()">
          <AppIcon name="refresh" :size="15" />
          安排复习
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
        <span class="stat-icon icon-amber"><AppIcon name="check" :size="16" /></span>
        <div>
          <span class="stat-number">{{ completedReviews.length }}</span>
          <span class="stat-caption">已完成复习</span>
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

          <nav class="flow-track" aria-label="学习流程">
            <ol>
              <li
                v-for="(stage, index) in activeWorkflow?.stages ?? []"
                :key="stage.key"
                :class="{
                  done: stageIsDone(stage),
                  current: stageIsCurrent(index),
                  locked: !stageIsReachable(index),
                }"
              >
                <button
                  type="button"
                  :disabled="!stageIsReachable(index)"
                  :aria-current="stageIsCurrent(index) ? 'step' : undefined"
                  @click="goStage(index)"
                >
                  <span class="flow-dot">
                    <AppIcon v-if="stageIsDone(stage)" name="check" :size="12" />
                    <span v-else>{{ index + 1 }}</span>
                  </span>
                  <span class="flow-copy">
                    <span class="flow-name">{{ stage.name }}</span>
                    <span class="flow-meta">{{ stage.suggestedMinutes }} 分钟</span>
                  </span>
                </button>
              </li>
            </ol>
          </nav>

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
                <div v-if="activeStage.checklist?.length" class="stage-checklist-head">
                  <span>本阶段要完成</span>
                  <span class="checklist-progress">
                    {{ activeChecklistDone.length }}/{{ activeStage.checklist.length }}
                  </span>
                </div>
                <ul v-if="activeStage.checklist?.length" class="stage-checklist">
                  <li v-for="(item, itemIndex) in activeStage.checklist" :key="itemIndex">
                    <label class="checklist-item" :class="{ done: checklistItemDone(item) }">
                      <input
                        type="checkbox"
                        :checked="checklistItemDone(item)"
                        @change="toggleChecklist(item, $event)"
                      />
                      <span class="checklist-index">{{ itemIndex + 1 }}</span>
                      <span class="checklist-text">{{ item }}</span>
                    </label>
                  </li>
                </ul>
                <p v-if="!activeStage.checklist?.length" class="stage-prompt">{{ activeStage.prompt }}</p>
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
                <button class="btn btn-primary" @click="openRecordCreate">
                  <AppIcon name="plus" :size="14" />
                  添加本阶段记录
                </button>
                <button
                  v-if="!activeStageCompleted"
                  class="btn btn-secondary"
                  :disabled="!activeChecklistComplete"
                  @click="completeCurrentStage"
                >
                  <AppIcon name="check" :size="14" />
                  {{ isLastStage ? '完成会话' : '完成本阶段' }}
                </button>
                <span
                  v-if="activeChecklistRemaining > 0"
                  class="session-actions-hint"
                >
                  还有 {{ activeChecklistRemaining }} 项未完成
                </span>
                <button v-if="activeStageCompleted" class="btn btn-secondary" @click="returnToCurrentStage">
                  <AppIcon name="arrow-right" :size="14" />
                  回到当前阶段
                </button>
                <button
                  v-if="!isLastStage && !activeStageCompleted"
                  class="btn btn-ghost"
                  @click="openFinish"
                >
                  提前完成会话
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


            <div class="session-aux">

              <details class="aux-block">
                <summary>
                  <AppIcon name="book" :size="14" />
                  资料与工具
                  <span class="aux-count">{{ activeResources.length }}</span>
                </summary>
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
              </details>
            </div>
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
                    {{ task.title }}{{ task.status === 'COMPLETED' ? '（已完成）' : '' }}
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


      <section v-else-if="activeView === 'reviews'" class="review-view">
        <div class="section-head">
          <div>
            <h3 class="section-title">
              <AppIcon name="refresh" :size="16" />
              任务复习提醒
            </h3>
            <p class="section-note">每次完成学习会自动生成一次提醒；到期只用于提醒，完成复习会把对应任务标记完成。</p>
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
            description="完成一次学习后，会自动为对应任务生成复习提醒。"
          />
          <ul v-else class="review-list">
            <li v-for="row in dueReviews" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ taskTitle(row.taskId ?? null) }}</span>
                <div class="review-meta">
                  <span>{{ formatShortDate(row.scheduledAt) }} 到期（{{ relativeDay(row.scheduledAt) }}）</span>
                  <span>完成后会把任务标记为完成</span>
                </div>
              </div>
              <div class="review-actions">
                <button class="btn btn-sm btn-ghost" @click="handleSkipReview(row)">取消提醒</button>
                <button class="btn btn-sm btn-primary" @click="handleCompleteReview(row)">完成复习</button>
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
            description="完成学习会自动生成提醒，也可以手动给任务安排一次。"
          />
          <ul v-else class="review-list compact">
            <li v-for="row in upcomingReviews.slice(0, 6)" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ taskTitle(row.taskId ?? null) }}</span>
                <div class="review-meta">
                  <span>{{ formatDate(row.scheduledAt) }}（{{ relativeDay(row.scheduledAt) }}）</span>
                </div>
              </div>
              <div class="review-actions">
                <button class="btn btn-sm btn-ghost" @click="handleSkipReview(row)">取消</button>
                <span class="badge">{{ reviewScheduleStatusLabels[row.status] }}</span>
              </div>
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
          <EmptyState v-if="completedReviews.length === 0" title="还没有复习记录" description="完成复习后，这里会保留任务与完成时间。" />
          <ul v-else class="review-list compact">
            <li v-for="row in completedReviews.slice(0, 8)" :key="row.id" class="review-row">
              <div class="review-main">
                <span class="review-name">{{ taskTitle(row.taskId ?? null) }}</span>
                <div class="review-meta">
                  <span>{{ formatDateTime(row.completedAt) }}</span>
                  <span>任务已标记完成</span>
                </div>
              </div>
              <div class="review-actions">
                <button class="btn btn-sm btn-ghost" @click="handleRevertReview(row)">取消完成</button>
                <span class="badge badge-accent">完成</span>
              </div>
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
              <div class="field">
                <div class="checklist-editor-head">
                  <span class="field-label">需要完成的清单（可选）</span>
                  <button type="button" class="btn btn-sm btn-ghost" @click="addChecklistItem(index)">
                    <AppIcon name="plus" :size="12" />
                    添加一项
                  </button>
                </div>
                <div v-if="stage.checklist?.length" class="checklist-editor">
                  <div
                    v-for="(item, itemIndex) in stage.checklist"
                    :key="`${itemIndex}-${item}`"
                    class="checklist-editor-row"
                  >
                    <input
                      v-model="stage.checklist[itemIndex]"
                      class="input"
                      placeholder="例如：写下论文要解决的问题"
                    />
                    <button
                      type="button"
                      class="icon-btn"
                      title="删除清单项"
                      aria-label="删除清单项"
                      @click="removeChecklistItem(index, itemIndex)"
                    >
                      <AppIcon name="close" :size="13" />
                    </button>
                  </div>
                </div>
                <p v-else class="field-hint">不填清单时，这个阶段只显示上面的提示语。</p>
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


    <ModalDialog :open="scheduleModalOpen" title="安排复习" subtitle="复习只是一个提醒时间；到期后完成复习会把对应任务标记完成。" @close="scheduleModalOpen = false">
      <form class="form" @submit.prevent="submitSchedule">
        <div class="field">
          <label class="field-label" for="schedule-task">任务</label>
          <select id="schedule-task" v-model="scheduleForm.taskId" class="select">
            <option value="" disabled>请选择任务</option>
            <option v-for="task in availableTasks" :key="task.id" :value="task.id">
              {{ task.title }}{{ task.status === 'COMPLETED' ? '（已完成）' : '' }}
            </option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="schedule-date">复习日期</label>
          <input id="schedule-date" v-model="scheduleForm.scheduledDate" class="input" type="date" />
        </div>
        <p class="field-hint">会在同一天 20:00 到期，并在时间盒里生成一条 30 分钟的复习提醒。</p>
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="scheduleModalOpen = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中…' : '安排复习' }}
          </button>
        </div>
      </form>
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

.flow-track {
  padding: 14px 26px 12px;
  border-bottom: 1px solid var(--line-faint);
  overflow-x: auto;
}

.flow-track ol {
  display: flex;
  align-items: flex-start;
  min-width: max-content;
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow-track li {
  position: relative;
  flex: 1 0 148px;
}

.flow-track li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 13px;
  left: 27px;
  right: -6px;
  height: 2px;
  border-radius: 2px;
  background: var(--line);
}

.flow-track li.done:not(:last-child)::after {
  background: color-mix(in srgb, var(--accent) 70%, var(--line));
}

.flow-track button {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 4px 10px 4px 0;
  text-align: left;
}

.flow-track button:disabled {
  cursor: default;
  opacity: 0.42;
}

.flow-dot {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.flow-track li.current .flow-dot {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.flow-track li.done .flow-dot {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.flow-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.flow-name {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.flow-meta {
  color: var(--muted);
  font-size: 10px;
}

.stage-checklist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 600;
}

.checklist-progress {
  color: var(--accent-strong);
  font-family: var(--font-mono);
  font-size: 10px;
}

.stage-checklist {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.stage-checklist li {
  display: block;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;
}

.checklist-item:hover {
  border-color: var(--line-strong);
}

.checklist-item input[type='checkbox'] {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  accent-color: var(--accent);
}

.checklist-item.done .checklist-text {
  color: var(--muted);
  text-decoration: line-through;
}

.checklist-item.done .checklist-index {
  background: var(--success-soft);
  color: var(--success);
}

.checklist-index {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
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

.session-actions-hint {
  color: var(--muted);
  font-size: 10.5px;
}

.flip {
  transform: rotate(180deg);
}

.session-interrupt {
  color: var(--danger);
  margin-left: auto;
}

.session-aux {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.aux-block {
  overflow: hidden;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.aux-block summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.aux-block summary::-webkit-details-marker {
  display: none;
}

.aux-block summary .icon {
  color: var(--accent);
}

.aux-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.aux-hint {
  margin: 0 12px 8px;
  color: var(--muted);
  font-size: 10.5px;
}

.aux-block .knowledge-link-list,
.aux-block .side-resource-list {
  padding: 0 12px 12px;
}

.aux-block .record-empty {
  margin: 0 12px 12px;
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

.checklist-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.checklist-editor {
  display: grid;
  gap: 6px;
}

.checklist-editor-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.checklist-editor-row .input {
  flex: 1;
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
