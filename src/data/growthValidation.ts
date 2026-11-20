import { GoalStatus, TaskStatus, type BaseEntity } from '@/domain'
import type {
  GrowthDomainIssue,
  GrowthSnapshot,
  GrowthValidationResult,
} from './growthTypes'

function isActive(row: BaseEntity): boolean {
  return !row.archivedAt && !row.deletedAt
}

function issue(
  code: string,
  severity: GrowthDomainIssue['severity'],
  store: GrowthDomainIssue['store'],
  id: string,
  message: string,
  field?: string,
): GrowthDomainIssue {
  return { code, severity, store, id, message, field }
}

export function validateGrowthSnapshot(snapshot: GrowthSnapshot): GrowthValidationResult {
  const issues: GrowthDomainIssue[] = []
  const identityById = new Map(snapshot.identities.map((row) => [row.id, row]))
  const competencyById = new Map(snapshot.competencies.map((row) => [row.id, row]))
  const stageOutcomeById = new Map(snapshot.stageOutcomes.map((row) => [row.id, row]))
  const taskById = new Map(snapshot.tasks.map((row) => [row.id, row]))

  for (const competency of snapshot.competencies) {
    const active = isActive(competency)
    if (!competency.identityId) {
      issues.push(
        issue(
          'COMPETENCY_IDENTITY_REQUIRED',
          active ? 'error' : 'warning',
          'competencies',
          competency.id,
          `能力「${competency.name}」没有归属身份`,
          'identityId',
        ),
      )
    } else {
      const identity = identityById.get(competency.identityId)
      if (!identity || identity.deletedAt) {
        issues.push(
          issue(
            'COMPETENCY_IDENTITY_MISSING',
            'error',
            'competencies',
            competency.id,
            `能力「${competency.name}」引用的身份不存在`,
            'identityId',
          ),
        )
      }
    }

    if (!competency.parentId) continue
    const parent = competencyById.get(competency.parentId)
    if (!parent || parent.deletedAt) {
      issues.push(
        issue(
          'COMPETENCY_PARENT_MISSING',
          'error',
          'competencies',
          competency.id,
          `能力「${competency.name}」的父能力不存在`,
          'parentId',
        ),
      )
      continue
    }
    if (competency.identityId && parent.identityId !== competency.identityId) {
      issues.push(
        issue(
          'COMPETENCY_IDENTITY_MISMATCH',
          'error',
          'competencies',
          competency.id,
          `能力「${competency.name}」与父能力「${parent.name}」不属于同一身份`,
          'identityId',
        ),
      )
    }
  }

  const cycleReported = new Set<string>()
  for (const competency of snapshot.competencies) {
    const path: string[] = []
    const positions = new Map<string, number>()
    let currentId: string | null = competency.id
    while (currentId) {
      const existingIndex = positions.get(currentId)
      if (existingIndex !== undefined) {
        const cycle = path.slice(existingIndex)
        const key = [...cycle].sort().join('|')
        if (!cycleReported.has(key)) {
          cycleReported.add(key)
          const names = cycle.map((id) => competencyById.get(id)?.name ?? id).join(' → ')
          issues.push(
            issue(
              'COMPETENCY_CYCLE',
              'error',
              'competencies',
              cycle[0],
              `能力树存在循环：${names}`,
              'parentId',
            ),
          )
        }
        break
      }
      positions.set(currentId, path.length)
      path.push(currentId)
      currentId = competencyById.get(currentId)?.parentId ?? null
    }
  }

  const childCount = new Map<string, number>()
  for (const competency of snapshot.competencies) {
    if (!competency.parentId) continue
    childCount.set(competency.parentId, (childCount.get(competency.parentId) ?? 0) + 1)
  }

  for (const outcome of snapshot.stageOutcomes) {
    if (!outcome.competencyId) {
      issues.push(
        issue(
          'STAGE_OUTCOME_COMPETENCY_REQUIRED',
          isActive(outcome) ? 'error' : 'warning',
          'goals',
          outcome.id,
          `阶段成果「${outcome.title}」没有挂载能力`,
          'competencyId',
        ),
      )
      continue
    }
    const competency = competencyById.get(outcome.competencyId)
    if (!competency || competency.deletedAt) {
      issues.push(
        issue(
          'STAGE_OUTCOME_COMPETENCY_MISSING',
          'error',
          'goals',
          outcome.id,
          `阶段成果「${outcome.title}」引用的能力不存在`,
          'competencyId',
        ),
      )
      continue
    }
    if (isActive(outcome) && isActive(competency) && (childCount.get(competency.id) ?? 0) > 0) {
      issues.push(
        issue(
          'STAGE_OUTCOME_ON_NON_LEAF',
          'error',
          'goals',
          outcome.id,
          `阶段成果「${outcome.title}」不能挂载在非叶子能力「${competency.name}」上`,
          'competencyId',
        ),
      )
    }
  }

  for (const task of snapshot.tasks) {
    const active = isActive(task)
    if (!task.stageOutcomeId) {
      issues.push(
        issue(
          'TASK_STAGE_OUTCOME_UNRESOLVED',
          active && task.status !== TaskStatus.COMPLETED ? 'warning' : 'warning',
          'tasks',
          task.id,
          `任务「${task.title}」是旧数据中的未归属任务，补齐阶段成果后才能进入新流程`,
          'stageOutcomeId',
        ),
      )
      continue
    }
    const outcome = stageOutcomeById.get(task.stageOutcomeId)
    if (!outcome || outcome.deletedAt) {
      issues.push(
        issue(
          'TASK_STAGE_OUTCOME_MISSING',
          'error',
          'tasks',
          task.id,
          `任务「${task.title}」引用的阶段成果不存在`,
          'stageOutcomeId',
        ),
      )
      continue
    }
    if (active && !isActive(outcome)) {
      issues.push(
        issue(
          'TASK_STAGE_OUTCOME_ARCHIVED',
          'warning',
          'tasks',
          task.id,
          `活跃任务「${task.title}」关联的阶段成果已归档`,
          'stageOutcomeId',
        ),
      )
    }
    if (outcome.status === GoalStatus.CANCELLED) {
      issues.push(
        issue(
          'TASK_STAGE_OUTCOME_CANCELLED',
          active ? 'warning' : 'error',
          'tasks',
          task.id,
          `任务「${task.title}」关联的阶段成果已取消`,
          'stageOutcomeId',
        ),
      )
    }
  }

  for (const timebox of snapshot.timeboxes) {
    if (!isActive(timebox)) continue
    if (timebox.taskId && !taskById.has(timebox.taskId)) {
      issues.push(
        issue(
          'TIMEBOX_TASK_MISSING',
          'error',
          'timeboxes',
          timebox.id,
          '时间块引用的任务不存在',
          'taskId',
        ),
      )
    }
    if (!timebox.taskId && timebox.kind !== 'FOCUS' && timebox.kind !== 'BREAK') {
      issues.push(
        issue(
          'FREE_TIMEBOX_INVALID_KIND',
          'error',
          'timeboxes',
          timebox.id,
          '无任务时间块只能是自由专注或休息',
          'kind',
        ),
      )
    }
  }

  const taskGoalCounts = new Map<string, number>()
  for (const link of snapshot.taskGoals) {
    if (!isActive(link)) continue
    taskGoalCounts.set(link.taskId, (taskGoalCounts.get(link.taskId) ?? 0) + 1)
  }
  for (const [taskId, count] of taskGoalCounts) {
    if (count <= 1) continue
    const task = taskById.get(taskId)
    issues.push(
      issue(
        'LEGACY_TASK_MULTIPLE_STAGE_OUTCOMES',
        'warning',
        'tasks',
        taskId,
        `旧任务「${task?.title ?? taskId}」关联了 ${count} 个阶段成果；新进度只使用主阶段成果`,
        'stageOutcomeId',
      ),
    )
  }

  const errorCount = issues.filter((row) => row.severity === 'error').length
  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
  }
}
