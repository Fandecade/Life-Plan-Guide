import { computed, ref } from 'vue'
import {
  DirectionStatus,
  MilestoneStatus,
  Priority,
  type Competency,
  type CompetencyLevel,
  type Direction,
  type DirectionCompetency,
  type Evidence,
  type Goal,
  type GoalMilestone,
  type Milestone,
  type NewEntity,
} from '@/domain'
import { repos } from '@/data'
import { addDays } from '@/utils/date'

export type CompetencyInput = Omit<NewEntity<Competency>, 'id'>
export type MilestoneInput = Omit<NewEntity<Milestone>, 'id'>
export type RoadmapKind = 'competency' | 'milestone'

export interface DirectionAssignmentInput {
  directionId: string
  requiredLevel: CompetencyLevel
  priority: Priority
}

export interface CompetencyNode {
  competency: Competency
  children: CompetencyNode[]
}

export function levelIndex(level: CompetencyLevel): number {
  return Number(level.replace('L', ''))
}

export function levelPercent(level: CompetencyLevel): number {
  return (levelIndex(level) / 5) * 100
}

function sortNodes(nodes: CompetencyNode[]): CompetencyNode[] {
  return nodes
    .sort((left, right) => left.competency.name.localeCompare(right.competency.name, 'zh-CN'))
    .map((node) => ({ ...node, children: sortNodes(node.children) }))
}

export function useRoadmap() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const competencies = ref<Competency[]>([])
  const milestones = ref<Milestone[]>([])
  const directions = ref<Direction[]>([])
  const relations = ref<DirectionCompetency[]>([])
  const competencyEvidences = ref<Awaited<ReturnType<typeof repos.competencyEvidences.list>>>([])
  const evidences = ref<Evidence[]>([])
  const goals = ref<Goal[]>([])
  const goalMilestones = ref<GoalMilestone[]>([])
  const selectedDirectionId = ref<string>('all')
  const includeArchived = ref(false)

  const activeDirections = computed(() =>
    directions.value
      .filter(
        (direction) =>
          !direction.archivedAt &&
          direction.status !== DirectionStatus.COMPLETED,
      )
      .sort((left, right) => left.priority - right.priority),
  )

  const directionMap = computed<Record<string, Direction>>(() => {
    const map: Record<string, Direction> = {}
    for (const direction of directions.value) map[direction.id] = direction
    return map
  })

  const visibleCompetencies = computed(() =>
    competencies.value.filter(
      (competency) => includeArchived.value || !competency.archivedAt,
    ),
  )

  const visibleMilestones = computed(() =>
    milestones.value.filter(
      (milestone) => includeArchived.value || !milestone.archivedAt,
    ),
  )

  const activeRelations = computed(() =>
    relations.value.filter((relation) => !relation.archivedAt),
  )

  const assignmentsByCompetency = computed<Record<string, DirectionCompetency[]>>(() => {
    const map: Record<string, DirectionCompetency[]> = {}
    for (const relation of activeRelations.value) {
      if (!map[relation.competencyId]) map[relation.competencyId] = []
      map[relation.competencyId].push(relation)
    }
    return map
  })

  const evidenceCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const link of competencyEvidences.value) {
      counts[link.competencyId] = (counts[link.competencyId] ?? 0) + 1
    }
    return counts
  })

  const evidenceMap = computed<Record<string, Evidence>>(() => {
    const map: Record<string, Evidence> = {}
    for (const evidence of evidences.value) map[evidence.id] = evidence
    return map
  })

  const goalMap = computed<Record<string, Goal>>(() => {
    const map: Record<string, Goal> = {}
    for (const goal of goals.value) map[goal.id] = goal
    return map
  })

  function linkedGoalsForMilestone(milestoneId: string): Goal[] {
    return goalMilestones.value
      .filter((row) => row.milestoneId === milestoneId && !row.archivedAt)
      .map((row) => goalMap.value[row.goalId])
      .filter((goal): goal is Goal => Boolean(goal))
  }

  function growthHistoryFor(competencyId: string) {
    return competencyEvidences.value
      .filter((link) => link.competencyId === competencyId)
      .slice()
      .sort((left, right) => left.assessedAt.localeCompare(right.assessedAt))
      .map((link) => ({
        id: link.id,
        date: link.assessedAt,
        level: link.assessedLevel,
        note: link.assessmentNote,
        evidenceTitle: evidenceMap.value[link.evidenceId]?.title ?? '成果已不存在',
      }))
  }

  const competencyTree = computed<CompetencyNode[]>(() => {
    const nodes = new Map<string, CompetencyNode>()
    for (const competency of visibleCompetencies.value) {
      nodes.set(competency.id, { competency, children: [] })
    }

    const roots: CompetencyNode[] = []
    for (const node of nodes.values()) {
      const parentId = node.competency.parentId
      const parent = parentId ? nodes.get(parentId) : undefined
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }

    const sorted = sortNodes(roots)
    if (selectedDirectionId.value === 'all') return sorted

    function prune(list: CompetencyNode[]): CompetencyNode[] {
      const result: CompetencyNode[] = []
      for (const node of list) {
        const children = prune(node.children)
        const selfMatch = (assignmentsByCompetency.value[node.competency.id] ?? []).some(
          (relation) => relation.directionId === selectedDirectionId.value,
        )
        if (selfMatch || children.length > 0) {
          result.push({ competency: node.competency, children })
        }
      }
      return result
    }

    return prune(sorted)
  })

  const inProgressMilestones = computed(
    () =>
      visibleMilestones.value.filter(
        (milestone) => milestone.status === MilestoneStatus.IN_PROGRESS,
      ).length,
  )

  const coveredDirectionCount = computed(() => {
    const ids = new Set<string>()
    for (const relation of activeRelations.value) ids.add(relation.directionId)
    return ids.size
  })

  function descendantsOf(competencyId: string): string[] {
    const children = competencies.value.filter(
      (competency) => competency.parentId === competencyId,
    )
    const ids: string[] = []
    for (const child of children) {
      ids.push(child.id, ...descendantsOf(child.id))
    }
    return ids
  }

  function milestonesOfDirection(directionId: string): Milestone[] {
    return visibleMilestones.value
      .filter((milestone) => milestone.directionId === directionId)
      .sort((left, right) => {
        const leftDate = left.dueDate ?? left.startDate ?? ''
        const rightDate = right.dueDate ?? right.startDate ?? ''
        return leftDate.localeCompare(rightDate)
      })
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [
        competencyRows,
        milestoneRows,
        directionRows,
        relationRows,
        evidenceRows,
        evidenceListRows,
        goalRows,
        goalMilestoneRows,
      ] = await Promise.all([
        repos.competencies.list({ includeArchived: true }),
        repos.milestones.list({ includeArchived: true }),
        repos.directions.list({ includeArchived: true }),
        repos.directionCompetencies.list({ includeArchived: true }),
        repos.competencyEvidences.list({ includeArchived: true }),
        repos.evidences.list({ includeArchived: true }),
        repos.goals.list({ includeArchived: true }),
        repos.goalMilestones.list({ includeArchived: true }),
      ])
      competencies.value = competencyRows
      milestones.value = milestoneRows
      directions.value = directionRows
      relations.value = relationRows
      competencyEvidences.value = evidenceRows
      evidences.value = evidenceListRows
      goals.value = goalRows
      goalMilestones.value = goalMilestoneRows
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveCompetency(
    input: CompetencyInput,
    assignments: DirectionAssignmentInput[],
    id?: string,
  ): Promise<Competency> {
    const entity = id
      ? await repos.competencies.update(id, input)
      : await repos.competencies.create(input)

    const existing = activeRelations.value.filter(
      (relation) => relation.competencyId === entity.id,
    )

    for (const relation of existing) {
      if (!assignments.some((assignment) => assignment.directionId === relation.directionId)) {
        await repos.directionCompetencies.remove(relation.id)
      }
    }

    for (const assignment of assignments) {
      const matched = existing.find(
        (relation) => relation.directionId === assignment.directionId,
      )
      if (matched) {
        if (
          matched.requiredLevel !== assignment.requiredLevel ||
          matched.priority !== assignment.priority
        ) {
          await repos.directionCompetencies.update(matched.id, {
            requiredLevel: assignment.requiredLevel,
            priority: assignment.priority,
          })
        }
      } else {
        await repos.directionCompetencies.create({
          competencyId: entity.id,
          directionId: assignment.directionId,
          requiredLevel: assignment.requiredLevel,
          priority: assignment.priority,
        })
      }
    }

    await refresh()
    return entity
  }

  async function saveMilestone(input: MilestoneInput, id?: string): Promise<Milestone> {
    const entity = id
      ? await repos.milestones.update(id, input)
      : await repos.milestones.create(input)
    await refresh()
    return entity
  }

  async function moveMilestone(id: string, deltaDays: number): Promise<Milestone | null> {
    const milestone = milestones.value.find((item) => item.id === id)
    if (!milestone || deltaDays === 0) return null
    const entity = await repos.milestones.update(id, {
      startDate: milestone.startDate ? addDays(milestone.startDate, deltaDays) : null,
      dueDate: milestone.dueDate ? addDays(milestone.dueDate, deltaDays) : null,
    })
    await refresh()
    return entity
  }

  async function setArchived(
    kind: RoadmapKind,
    id: string,
    archived: boolean,
  ): Promise<void> {
    if (kind === 'competency') {
      archived
        ? await repos.competencies.archive(id)
        : await repos.competencies.restore(id)
    } else {
      archived
        ? await repos.milestones.archive(id)
        : await repos.milestones.restore(id)
    }
    await refresh()
  }

  return {
    loading,
    error,
    competencies,
    milestones,
    directions,
    relations,
    evidences,
    goals,
    goalMilestones,
    activeDirections,
    directionMap,
    visibleCompetencies,
    visibleMilestones,
    assignmentsByCompetency,
    evidenceCounts,
    evidenceMap,
    goalMap,
    linkedGoalsForMilestone,
    growthHistoryFor,
    competencyTree,
    selectedDirectionId,
    includeArchived,
    inProgressMilestones,
    coveredDirectionCount,
    milestonesOfDirection,
    descendantsOf,
    refresh,
    saveCompetency,
    saveMilestone,
    moveMilestone,
    setArchived,
    levelPercent,
  }
}