import { computed, ref } from 'vue'
import {
  LearningRecordType,
  ReviewScheduleStatus,
  SessionStatus,
  TaskStatus,
  type KnowledgeItem,
  type LearningRecord,
  type LearningSession,
  type NewEntity,
  type Resource,
  type ReviewSchedule,
  type Task,
  type Workflow,
} from '@/domain'
import { repos } from '@/data'
import { addDays, endOfDay, nowIso, startOfDay } from '@/utils/date'

export type WorkflowInput = Omit<NewEntity<Workflow>, 'id'>
export type LearningRecordInput = Omit<NewEntity<LearningRecord>, 'id'>
export type KnowledgeInput = Omit<NewEntity<KnowledgeItem>, 'id'>
export type ReviewScheduleInput = Omit<NewEntity<ReviewSchedule>, 'id'>
export type ResourceInput = Omit<NewEntity<Resource>, 'id'>

export type LearningArchiveKind = 'workflow' | 'knowledge' | 'resource'

export interface StartSessionInput {
  taskId: string
  workflowId: string
  learningIntention: string
  selfPrediction: number
}

export interface FinishSessionInput {
  status: 'COMPLETED' | 'INTERRUPTED'
  actualAssessment: number | null
  reflection: string
}

export function nextReviewInterval(recall: number): number {
  if (recall >= 4) return 15
  if (recall === 3) return 7
  if (recall === 2) return 3
  return 1
}

export function useLearning() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const workflows = ref<Workflow[]>([])
  const sessions = ref<LearningSession[]>([])
  const records = ref<LearningRecord[]>([])
  const knowledgeItems = ref<KnowledgeItem[]>([])
  const reviewSchedules = ref<ReviewSchedule[]>([])
  const resources = ref<Resource[]>([])
  const tasks = ref<Task[]>([])
  const sessionKnowledge = ref<Awaited<ReturnType<typeof repos.sessionKnowledge.list>>>([])
  const includeArchived = ref(false)
  const now = ref(Date.now())

  let timer: ReturnType<typeof setInterval> | null = null

  function startClock(): void {
    if (timer) return
    timer = setInterval(() => {
      now.value = Date.now()
    }, 30000)
  }

  function stopClock(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const activeWorkflows = computed(() =>
    workflows.value.filter((workflow) => !workflow.archivedAt),
  )

  const activeKnowledge = computed(() =>
    knowledgeItems.value.filter((item) => !item.archivedAt),
  )

  const activeResources = computed(() =>
    resources.value.filter((item) => !item.archivedAt),
  )

  const availableTasks = computed(() =>
    tasks.value
      .filter(
        (task) =>
          !task.archivedAt &&
          task.status !== TaskStatus.COMPLETED &&
          task.status !== TaskStatus.CANCELLED,
      )
      .sort((left, right) => {
        const rank: Record<string, number> = { IN_PROGRESS: 0, TODO: 1, PAUSED: 2, BLOCKED: 3 }
        return (rank[left.status] ?? 9) - (rank[right.status] ?? 9)
      }),
  )

  const activeSession = computed(() => {
    const list = sessions.value
      .filter((session) => session.status === SessionStatus.IN_PROGRESS)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    return list[0] ?? null
  })

  const taskById = computed(() => {
    const map: Record<string, Task> = {}
    for (const task of tasks.value) map[task.id] = task
    return map
  })

  const workflowById = computed(() => {
    const map: Record<string, Workflow> = {}
    for (const workflow of workflows.value) map[workflow.id] = workflow
    return map
  })

  const knowledgeById = computed(() => {
    const map: Record<string, KnowledgeItem> = {}
    for (const item of knowledgeItems.value) map[item.id] = item
    return map
  })

  const recordsBySession = computed(() => {
    const map: Record<string, LearningRecord[]> = {}
    const sorted = [...records.value].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt),
    )
    for (const record of sorted) {
      if (!map[record.sessionId]) map[record.sessionId] = []
      map[record.sessionId].push(record)
    }
    return map
  })

  const knowledgeIdsBySession = computed(() => {
    const map: Record<string, string[]> = {}
    for (const row of sessionKnowledge.value) {
      if (row.archivedAt) continue
      if (!map[row.sessionId]) map[row.sessionId] = []
      map[row.sessionId].push(row.knowledgeItemId)
    }
    return map
  })

  const activeSessionRecords = computed(() =>
    activeSession.value ? recordsBySession.value[activeSession.value.id] ?? [] : [],
  )

  const activeSessionKnowledgeIds = computed(() =>
    activeSession.value ? knowledgeIdsBySession.value[activeSession.value.id] ?? [] : [],
  )

  const activeWorkflow = computed(() =>
    activeSession.value?.workflowId
      ? workflowById.value[activeSession.value.workflowId] ?? null
      : null,
  )

  const activeStageIndex = computed(() => {
    if (!activeSession.value || !activeWorkflow.value) return 0
    const index = activeWorkflow.value.stages.findIndex(
      (stage) => stage.key === activeSession.value?.currentStage,
    )
    return index < 0 ? 0 : index
  })

  const activeStage = computed(() =>
    activeWorkflow.value ? activeWorkflow.value.stages[activeStageIndex.value] ?? null : null,
  )

  const elapsedMinutes = computed(() => {
    if (!activeSession.value) return 0
    return Math.max(
      0,
      Math.floor((now.value - new Date(activeSession.value.startedAt).getTime()) / 60000),
    )
  })

  const dueReviews = computed(() => {
    const deadline = endOfDay().toISOString()
    return reviewSchedules.value
      .filter(
        (row) =>
          (row.status === ReviewScheduleStatus.PENDING ||
            row.status === ReviewScheduleStatus.DUE) &&
          row.scheduledAt <= deadline,
      )
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
  })

  const upcomingReviews = computed(() => {
    const deadline = endOfDay().toISOString()
    return reviewSchedules.value
      .filter(
        (row) =>
          (row.status === ReviewScheduleStatus.PENDING ||
            row.status === ReviewScheduleStatus.DUE) &&
          row.scheduledAt > deadline,
      )
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
  })

  const completedReviews = computed(() =>
    reviewSchedules.value
      .filter((row) => row.status === ReviewScheduleStatus.COMPLETED)
      .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? '')),
  )

  const stats = computed(() => {
    const today = startOfDay()
    const day = today.getDay() === 0 ? 7 : today.getDay()
    const monday = new Date(today)
    monday.setDate(monday.getDate() - (day - 1))
    const weekStart = monday.getTime()
    const weekMinutes = sessions.value
      .filter((session) => {
        const start = new Date(session.startedAt).getTime()
        return (
          session.status === SessionStatus.COMPLETED &&
          start >= weekStart &&
          start < weekStart + 7 * 86400000
        )
      })
      .reduce((total, session) => total + session.actualDuration, 0)

    return {
      sessions: sessions.value.filter((session) => !session.archivedAt).length,
      weekMinutes,
      knowledge: activeKnowledge.value.length,
      dueReviews: dueReviews.value.length,
    }
  })

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [workflowRows, sessionRows, recordRows, knowledgeRows, reviewRows, resourceRows, taskRows, links] =
        await Promise.all([
          repos.workflows.list({ includeArchived: true }),
          repos.learningSessions.list({ includeArchived: true }),
          repos.learningRecords.list({ includeArchived: true }),
          repos.knowledgeItems.list({ includeArchived: true }),
          repos.reviewSchedules.list({ includeArchived: true }),
          repos.resources.list({ includeArchived: true }),
          repos.tasks.list({ includeArchived: true }),
          repos.sessionKnowledge.list({ includeArchived: true }),
        ])
      workflows.value = workflowRows
      sessions.value = sessionRows
      records.value = recordRows
      knowledgeItems.value = knowledgeRows
      reviewSchedules.value = reviewRows
      resources.value = resourceRows
      tasks.value = taskRows
      sessionKnowledge.value = links
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveWorkflow(input: WorkflowInput, id?: string): Promise<Workflow> {
    const entity = id
      ? await repos.workflows.update(id, input)
      : await repos.workflows.create(input)
    await refresh()
    return entity
  }

  async function setWorkflowArchived(id: string, archived: boolean): Promise<void> {
    archived ? await repos.workflows.archive(id) : await repos.workflows.restore(id)
    await refresh()
  }

  async function startSession(input: StartSessionInput): Promise<LearningSession> {
    const workflow = workflowById.value[input.workflowId]
    const firstStage = workflow?.stages[0]?.key ?? null
    const entity = await repos.learningSessions.create({
      taskId: input.taskId,
      workflowId: input.workflowId,
      startedAt: nowIso(),
      endedAt: null,
      currentStage: firstStage,
      status: SessionStatus.IN_PROGRESS,
      learningIntention: input.learningIntention,
      selfPrediction: input.selfPrediction,
      actualAssessment: null,
      actualDuration: 0,
    })
    now.value = Date.now()
    await refresh()
    return entity
  }

  async function setStage(sessionId: string, stageKey: string): Promise<void> {
    await repos.learningSessions.update(sessionId, { currentStage: stageKey })
    await refresh()
  }

  async function finishSession(
    sessionId: string,
    input: FinishSessionInput,
  ): Promise<LearningSession | null> {
    const session = sessions.value.find((row) => row.id === sessionId)
    if (!session) return null
    const endedAt = nowIso()
    const actualDuration = Math.max(
      1,
      Math.round((new Date(endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000),
    )
    const entity = await repos.learningSessions.update(sessionId, {
      status: input.status,
      endedAt,
      actualDuration,
      actualAssessment: input.actualAssessment,
    })
    if (input.reflection.trim()) {
      await repos.learningRecords.create({
        sessionId,
        taskId: session.taskId,
        recordType: LearningRecordType.REFLECTION,
        title: input.status === SessionStatus.COMPLETED ? '会话反思' : '中断反思',
        content: input.reflection.trim(),
        externalUrl: '',
        occurredAt: endedAt,
        selfAssessment: input.actualAssessment,
      })
    }
    await refresh()
    return entity
  }

  async function saveRecord(input: LearningRecordInput, id?: string): Promise<LearningRecord> {
    const entity = id
      ? await repos.learningRecords.update(id, input)
      : await repos.learningRecords.create(input)
    await refresh()
    return entity
  }

  async function archiveRecord(id: string): Promise<void> {
    await repos.learningRecords.archive(id)
    await refresh()
  }

  async function syncSessionKnowledge(sessionId: string, knowledgeIds: string[]): Promise<void> {
    const existing = sessionKnowledge.value.filter(
      (row) => row.sessionId === sessionId && !row.archivedAt,
    )
    for (const row of existing) {
      if (!knowledgeIds.includes(row.knowledgeItemId)) {
        await repos.sessionKnowledge.remove(row.id)
      }
    }
    for (const knowledgeItemId of knowledgeIds) {
      if (!existing.some((row) => row.knowledgeItemId === knowledgeItemId)) {
        await repos.sessionKnowledge.create({ sessionId, knowledgeItemId })
      }
    }
    await refresh()
  }

  async function saveKnowledge(input: KnowledgeInput, id?: string): Promise<KnowledgeItem> {
    const entity = id
      ? await repos.knowledgeItems.update(id, input)
      : await repos.knowledgeItems.create(input)
    await refresh()
    return entity
  }

  async function setKnowledgeArchived(id: string, archived: boolean): Promise<void> {
    archived ? await repos.knowledgeItems.archive(id) : await repos.knowledgeItems.restore(id)
    await refresh()
  }

  async function saveReviewSchedule(
    input: ReviewScheduleInput,
    id?: string,
  ): Promise<ReviewSchedule> {
    const entity = id
      ? await repos.reviewSchedules.update(id, input)
      : await repos.reviewSchedules.create(input)
    await refresh()
    return entity
  }

  async function completeReview(
    schedule: ReviewSchedule,
    recallResult: number,
    difficulty: number,
  ): Promise<Date> {
    const completedAt = nowIso()
    const intervalDays = nextReviewInterval(recallResult)
    const nextAt = addDays(completedAt, intervalDays)

    await repos.reviewSchedules.update(schedule.id, {
      completedAt,
      recallResult,
      difficulty,
      nextReviewAt: nextAt,
      status: ReviewScheduleStatus.COMPLETED,
    })
    await repos.reviewSchedules.create({
      knowledgeItemId: schedule.knowledgeItemId,
      scheduledAt: nextAt,
      completedAt: null,
      recallResult: null,
      difficulty: null,
      nextReviewAt: null,
      externalTool: schedule.externalTool,
      externalUrl: schedule.externalUrl,
      status: ReviewScheduleStatus.PENDING,
    })
    await repos.knowledgeItems.update(schedule.knowledgeItemId, {
      lastReviewedAt: completedAt,
    })
    await refresh()
    return new Date(nextAt)
  }

  async function skipReview(scheduleId: string): Promise<void> {
    await repos.reviewSchedules.update(scheduleId, {
      status: ReviewScheduleStatus.SKIPPED,
    })
    await refresh()
  }

  async function saveResource(input: ResourceInput, id?: string): Promise<Resource> {
    const entity = id
      ? await repos.resources.update(id, input)
      : await repos.resources.create(input)
    await refresh()
    return entity
  }

  async function setResourceArchived(id: string, archived: boolean): Promise<void> {
    archived ? await repos.resources.archive(id) : await repos.resources.restore(id)
    await refresh()
  }

  return {
    loading,
    error,
    workflows,
    sessions,
    records,
    knowledgeItems,
    reviewSchedules,
    resources,
    tasks,
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
    archiveRecord,
    syncSessionKnowledge,
    saveKnowledge,
    setKnowledgeArchived,
    saveReviewSchedule,
    completeReview,
    skipReview,
    saveResource,
    setResourceArchived,
  }
}