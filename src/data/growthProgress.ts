import {
  TaskStatus,
  type Competency,
  type CompetencyLevel,
  type Goal,
  type Identity,
  type Task,
} from '@/domain'
import type {
  CompetencyProgress,
  GrowthCompetencyNode,
  GrowthIdentityNode,
  GrowthSnapshot,
  GrowthStageOutcomeNode,
  StageOutcomeProgress,
} from './growthTypes'

export const DEFAULT_TASK_ESTIMATE_MINUTES = 30

function isActive(row: { archivedAt: string | null; deletedAt: string | null }): boolean {
  return !row.archivedAt && !row.deletedAt
}

function finitePositiveWeight(weight: number): number {
  return Number.isFinite(weight) && weight > 0 ? weight : 1
}

export function taskEstimateMinutes(task: Task): number {
  return Number.isFinite(task.estimatedDuration) && task.estimatedDuration > 0
    ? task.estimatedDuration
    : DEFAULT_TASK_ESTIMATE_MINUTES
}

export function calculateStageOutcomeProgress(
  stageOutcome: Goal,
  tasks: Task[],
): StageOutcomeProgress {
  const eligible = tasks.filter(
    (task) =>
      task.stageOutcomeId === stageOutcome.id &&
      isActive(task) &&
      task.status !== TaskStatus.CANCELLED,
  )
  let completedMinutes = 0
  let totalMinutes = 0
  let completedTaskCount = 0

  for (const task of eligible) {
    const minutes = taskEstimateMinutes(task)
    totalMinutes += minutes
    if (task.status === TaskStatus.COMPLETED) {
      completedMinutes += minutes
      completedTaskCount += 1
    }
  }

  return {
    stageOutcomeId: stageOutcome.id,
    percent: totalMinutes > 0 ? (completedMinutes / totalMinutes) * 100 : 0,
    completedMinutes,
    totalMinutes,
    taskCount: eligible.length,
    completedTaskCount,
    openTaskCount: eligible.length - completedTaskCount,
  }
}

export function competencyLevelIndex(level: CompetencyLevel): number {
  return Number(level.replace('L', ''))
}

export function calculateLevelProgress(
  currentLevel: CompetencyLevel,
  targetLevel: CompetencyLevel,
): number {
  const target = competencyLevelIndex(targetLevel)
  if (target <= 0) return 100
  const current = Math.min(competencyLevelIndex(currentLevel), target)
  return (Math.max(0, current) / target) * 100
}

function calculateCompetencyProgressMap(
  competencies: Competency[],
  stageOutcomes: Goal[],
  tasks: Task[],
): Map<string, CompetencyProgress> {
  const competencyById = new Map(competencies.map((row) => [row.id, row]))
  const childrenByParent = new Map<string, Competency[]>()
  for (const competency of competencies) {
    if (!competency.parentId || !competencyById.has(competency.parentId)) continue
    const rows = childrenByParent.get(competency.parentId) ?? []
    rows.push(competency)
    childrenByParent.set(competency.parentId, rows)
  }

  const outcomeCounts = new Map<string, number>()
  const outcomeById = new Map(stageOutcomes.map((row) => [row.id, row]))
  for (const outcome of stageOutcomes) {
    if (!outcome.competencyId || !isActive(outcome)) continue
    outcomeCounts.set(outcome.competencyId, (outcomeCounts.get(outcome.competencyId) ?? 0) + 1)
  }

  const taskCounts = new Map<string, { total: number; completed: number }>()
  for (const task of tasks) {
    if (
      !task.stageOutcomeId ||
      !isActive(task) ||
      task.status === TaskStatus.CANCELLED
    ) {
      continue
    }
    const outcome = outcomeById.get(task.stageOutcomeId)
    if (!outcome?.competencyId) continue
    const counts = taskCounts.get(outcome.competencyId) ?? { total: 0, completed: 0 }
    counts.total += 1
    if (task.status === TaskStatus.COMPLETED) counts.completed += 1
    taskCounts.set(outcome.competencyId, counts)
  }

  const cache = new Map<string, CompetencyProgress>()
  const resolving = new Set<string>()

  function resolve(competencyId: string): CompetencyProgress {
    const cached = cache.get(competencyId)
    if (cached) return cached
    const competency = competencyById.get(competencyId)
    if (!competency) {
      return {
        competencyId,
        percent: 0,
        levelPercent: 0,
        isLeaf: true,
        stageOutcomeCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
      }
    }
    if (resolving.has(competencyId)) {
      return {
        competencyId,
        percent: 0,
        levelPercent: 0,
        isLeaf: true,
        stageOutcomeCount: 0,
        taskCount: 0,
        completedTaskCount: 0,
      }
    }

    resolving.add(competencyId)
    const children = childrenByParent.get(competencyId) ?? []
    const levelPercent = calculateLevelProgress(
      competency.currentLevel,
      competency.targetLevel,
    )
    const childProgress = children.map((child) => resolve(child.id))
    const percent =
      children.length === 0
        ? levelPercent
        : children.reduce(
            (sum, child, index) =>
              sum + childProgress[index].percent * finitePositiveWeight(child.weight),
            0,
          ) /
          children.reduce((sum, child) => sum + finitePositiveWeight(child.weight), 0)
    const directCounts = taskCounts.get(competencyId) ?? { total: 0, completed: 0 }
    const progress: CompetencyProgress = {
      competencyId,
      percent,
      levelPercent,
      isLeaf: children.length === 0,
      stageOutcomeCount:
        (outcomeCounts.get(competencyId) ?? 0) +
        childProgress.reduce((sum, child) => sum + child.stageOutcomeCount, 0),
      taskCount:
        directCounts.total + childProgress.reduce((sum, child) => sum + child.taskCount, 0),
      completedTaskCount:
        directCounts.completed +
        childProgress.reduce((sum, child) => sum + child.completedTaskCount, 0),
    }
    resolving.delete(competencyId)
    cache.set(competencyId, progress)
    return progress
  }

  for (const competency of competencies) resolve(competency.id)
  return cache
}

export function buildGrowthStageOutcomeNode(
  stageOutcome: Goal,
  tasks: Task[],
): GrowthStageOutcomeNode {
  return {
    stageOutcome,
    progress: calculateStageOutcomeProgress(stageOutcome, tasks),
    tasks: tasks
      .filter((task) => task.stageOutcomeId === stageOutcome.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  }
}

function sortCompetencyNodes(nodes: GrowthCompetencyNode[]): GrowthCompetencyNode[] {
  return nodes
    .sort(
      (left, right) =>
        left.competency.weight - right.competency.weight ||
        left.competency.name.localeCompare(right.competency.name, 'zh-CN'),
    )
    .map((node) => ({ ...node, children: sortCompetencyNodes(node.children) }))
}

function summarizeRootProgress(roots: GrowthCompetencyNode[]): number {
  const totalWeight = roots.reduce(
    (sum, node) => sum + finitePositiveWeight(node.competency.weight),
    0,
  )
  if (totalWeight === 0) return 0
  return roots.reduce(
    (sum, node) => sum + node.progress.percent * finitePositiveWeight(node.competency.weight),
    0,
  ) / totalWeight
}

export function calculateIdentityProgress(
  identity: Identity,
  snapshot: Pick<GrowthSnapshot, 'competencies' | 'stageOutcomes' | 'tasks'>,
): number {
  const activeCompetencies = snapshot.competencies.filter(
    (row) => isActive(row) && row.identityId === identity.id,
  )
  const ids = new Set(activeCompetencies.map((row) => row.id))
  const roots = activeCompetencies.filter(
    (row) => !row.parentId || !ids.has(row.parentId),
  )
  const progressMap = calculateCompetencyProgressMap(
    activeCompetencies,
    snapshot.stageOutcomes,
    snapshot.tasks,
  )
  const weight = roots.reduce((sum, row) => sum + finitePositiveWeight(row.weight), 0)
  if (weight === 0) return 0
  return (
    roots.reduce(
      (sum, row) =>
        sum + (progressMap.get(row.id)?.percent ?? 0) * finitePositiveWeight(row.weight),
      0,
    ) / weight
  )
}

export function buildGrowthOverview(snapshot: GrowthSnapshot): {
  identities: GrowthIdentityNode[]
  unassignedCompetencies: GrowthCompetencyNode[]
} {
  const activeIdentities = snapshot.identities.filter(isActive)
  const activeCompetencies = snapshot.competencies.filter(isActive)
  const activeOutcomes = snapshot.stageOutcomes.filter(isActive)
  const activeTasks = snapshot.tasks.filter(isActive)
  const progressMap = calculateCompetencyProgressMap(
    activeCompetencies,
    activeOutcomes,
    activeTasks,
  )

  const building = new Set<string>()
  function buildNode(competency: Competency): GrowthCompetencyNode {
    if (building.has(competency.id)) {
      return {
        competency,
        children: [],
        stageOutcomes: [],
        progress:
          progressMap.get(competency.id) ?? {
            competencyId: competency.id,
            percent: 0,
            levelPercent: 0,
            isLeaf: true,
            stageOutcomeCount: 0,
            taskCount: 0,
            completedTaskCount: 0,
          },
      }
    }
    building.add(competency.id)
    const children = activeCompetencies
      .filter((row) => row.parentId === competency.id)
      .map(buildNode)
    building.delete(competency.id)
    const stageOutcomes = activeOutcomes
      .filter((outcome) => outcome.competencyId === competency.id)
      .sort((left, right) => {
        const leftDate = left.startDate ?? left.createdAt
        const rightDate = right.startDate ?? right.createdAt
        return leftDate.localeCompare(rightDate)
      })
      .map((outcome) => buildGrowthStageOutcomeNode(outcome, activeTasks))
    return {
      competency,
      children,
      stageOutcomes,
      progress:
        progressMap.get(competency.id) ?? {
          competencyId: competency.id,
          percent: 0,
          levelPercent: 0,
          isLeaf: children.length === 0,
          stageOutcomeCount: stageOutcomes.length,
          taskCount: 0,
          completedTaskCount: 0,
        },
    }
  }

  const grouped = new Map<string | null, Competency[]>()
  for (const competency of activeCompetencies) {
    const identityId =
      competency.identityId && activeIdentities.some((row) => row.id === competency.identityId)
        ? competency.identityId
        : null
    const rows = grouped.get(identityId) ?? []
    rows.push(competency)
    grouped.set(identityId, rows)
  }

  const identities = activeIdentities.map((identity) => {
    const rows = grouped.get(identity.id) ?? []
    const ids = new Set(rows.map((row) => row.id))
    const roots = sortCompetencyNodes(
      rows
        .filter((row) => !row.parentId || !ids.has(row.parentId))
        .map(buildNode),
    )
    const taskCount = roots.reduce((sum, root) => sum + root.progress.taskCount, 0)
    const completedTaskCount = roots.reduce(
      (sum, root) => sum + root.progress.completedTaskCount,
      0,
    )
    return {
      identity,
      roots,
      percent: summarizeRootProgress(roots),
      stageOutcomeCount: roots.reduce(
        (sum, root) => sum + root.progress.stageOutcomeCount,
        0,
      ),
      taskCount,
      completedTaskCount,
    }
  })

  const unassignedRows = grouped.get(null) ?? []
  const unassignedIds = new Set(unassignedRows.map((row) => row.id))
  const unassignedCompetencies = sortCompetencyNodes(
    unassignedRows
      .filter((row) => !row.parentId || !unassignedIds.has(row.parentId))
      .map(buildNode),
  )

  return { identities, unassignedCompetencies }
}
