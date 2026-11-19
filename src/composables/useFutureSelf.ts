import { computed, ref } from 'vue'
import {
  VisionStatus,
  DirectionStatus,
  type Competency,
  type Direction,
  type DirectionCompetency,
  type Goal,
  type Identity,
  type NewEntity,
  type Vision,
} from '@/domain'
import { repos } from '@/data'

export type VisionInput = Omit<NewEntity<Vision>, 'id'>
export type IdentityInput = Omit<NewEntity<Identity>, 'id'>
export type DirectionInput = Omit<NewEntity<Direction>, 'id'>
export type FutureSelfKind = 'vision' | 'identity' | 'direction'

export interface IdentityCapabilityNode {
  competency: Competency
  children: IdentityCapabilityNode[]
  assignments: DirectionCompetency[]
  directions: Direction[]
  goalCount: number
  isDirect: boolean
}

function directionStatusOrder(status: DirectionStatus): number {
  if (status === DirectionStatus.ACTIVE) return 0
  if (status === DirectionStatus.PLANNED) return 1
  if (status === DirectionStatus.PAUSED) return 2
  if (status === DirectionStatus.COMPLETED) return 3
  return 4
}

function sortDirectionList(left: Direction, right: Direction): number {
  const rank = directionStatusOrder(left.status) - directionStatusOrder(right.status)
  if (rank !== 0) return rank
  if (left.priority !== right.priority) return left.priority - right.priority
  return right.updatedAt.localeCompare(left.updatedAt)
}

export function useFutureSelf() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const visions = ref<Vision[]>([])
  const identities = ref<Identity[]>([])
  const directions = ref<Direction[]>([])
  const competencies = ref<Competency[]>([])
  const directionCompetencies = ref<DirectionCompetency[]>([])
  const goals = ref<Goal[]>([])
  const selectedVisionId = ref<string | null>(null)
  const includeArchived = ref(false)

  const activeVisions = computed(() =>
    visions.value.filter((vision) => !vision.archivedAt),
  )

  const visibleVisions = computed(() => {
    const list = includeArchived.value
      ? [...visions.value]
      : visions.value.filter((vision) => !vision.archivedAt)
    return list.sort((left, right) => {
      const leftRank = left.status === VisionStatus.ACTIVE ? 0 : 1
      const rightRank = right.status === VisionStatus.ACTIVE ? 0 : 1
      if (leftRank !== rightRank) return leftRank - rightRank
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  })

  const selectedVision = computed(() => {
    const list = visibleVisions.value
    return list.find((vision) => vision.id === selectedVisionId.value) ?? list[0] ?? null
  })

  const selectedIdentities = computed(() =>
    selectedVision.value
      ? identities.value
          .filter(
            (identity) =>
              identity.visionId === selectedVision.value?.id &&
              (includeArchived.value || !identity.archivedAt),
          )
          .sort(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
      : [],
  )

  const selectedDirections = computed(() =>
    selectedVision.value
      ? directions.value
          .filter(
            (direction) =>
              direction.visionId === selectedVision.value?.id &&
              (includeArchived.value || !direction.archivedAt),
          )
          .sort(sortDirectionList)
      : [],
  )

  const visibleCompetencies = computed(() =>
    competencies.value.filter(
      (competency) => includeArchived.value || !competency.archivedAt,
    ),
  )

  const activeDirectionCompetencies = computed(() =>
    directionCompetencies.value.filter((relation) => !relation.archivedAt),
  )

  const visibleGoals = computed(() =>
    goals.value.filter(
      (goal) => includeArchived.value || !goal.archivedAt,
    ),
  )

  const defaultIdentityId = computed(() => selectedIdentities.value[0]?.id ?? null)

  const activeDirectionCount = computed(
    () =>
      directions.value.filter(
        (direction) =>
          !direction.archivedAt &&
          (direction.status === DirectionStatus.ACTIVE ||
            direction.status === DirectionStatus.PLANNED),
      ).length,
  )

  const activeIdentityCount = computed(
    () => identities.value.filter((identity) => !identity.archivedAt).length,
  )

  const weeklyBudgetMinutes = computed(() =>
    directions.value
      .filter(
        (direction) =>
          !direction.archivedAt && direction.status !== DirectionStatus.COMPLETED,
      )
      .reduce((total, direction) => total + direction.weeklyTimeBudget, 0),
  )

  const archivedVisionCount = computed(
    () => visions.value.filter((vision) => vision.archivedAt).length,
  )

  function countDirections(visionId: string): number {
    return directions.value.filter(
      (direction) => direction.visionId === visionId && !direction.archivedAt,
    ).length
  }

  function countIdentities(visionId: string): number {
    return identities.value.filter(
      (identity) => identity.visionId === visionId && !identity.archivedAt,
    ).length
  }

  function directionsForIdentity(identityId: string): Direction[] {
    const fallbackId = defaultIdentityId.value
    return selectedDirections.value.filter(
      (direction) => (direction.identityId ?? fallbackId) === identityId,
    )
  }

  function identityForDirection(direction: Direction): Identity | null {
    const identityId = direction.identityId ?? defaultIdentityId.value
    return selectedIdentities.value.find((identity) => identity.id === identityId) ?? null
  }

  function capabilityTreeForIdentity(identityId: string): IdentityCapabilityNode[] {
    const identityDirections = directionsForIdentity(identityId)
    const directionIds = new Set(identityDirections.map((direction) => direction.id))
    const competencyById = new Map(
      visibleCompetencies.value.map((competency) => [competency.id, competency]),
    )
    const childrenByParent = new Map<string, Competency[]>()
    const roots: Competency[] = []

    for (const competency of visibleCompetencies.value) {
      if (competency.parentId && competencyById.has(competency.parentId)) {
        const children = childrenByParent.get(competency.parentId) ?? []
        children.push(competency)
        childrenByParent.set(competency.parentId, children)
      } else {
        roots.push(competency)
      }
    }

    const assignmentsByCompetency = new Map<string, DirectionCompetency[]>()
    for (const relation of activeDirectionCompetencies.value) {
      if (!directionIds.has(relation.directionId)) continue
      const assignments = assignmentsByCompetency.get(relation.competencyId) ?? []
      assignments.push(relation)
      assignmentsByCompetency.set(relation.competencyId, assignments)
    }

    const buildNode = (competency: Competency): IdentityCapabilityNode | null => {
      const children = (childrenByParent.get(competency.id) ?? [])
        .map(buildNode)
        .filter((node): node is IdentityCapabilityNode => node !== null)
        .sort((left, right) =>
          left.competency.name.localeCompare(right.competency.name, 'zh-CN'),
        )
      const assignments = assignmentsByCompetency.get(competency.id) ?? []
      if (assignments.length === 0 && children.length === 0) return null

      // A grouping capability may have no direct assignment while its children do.
      // Aggregate descendant links so the whole branch can be understood as one map.
      const linkedDirectionIds = new Set(
        assignments.map((assignment) => assignment.directionId),
      )
      for (const child of children) {
        for (const direction of child.directions) linkedDirectionIds.add(direction.id)
      }

      const linkedDirections = identityDirections.filter((direction) =>
        linkedDirectionIds.has(direction.id),
      )
      const subtreeCompetencyIds = new Set<string>([competency.id])
      const collectCompetencyIds = (node: IdentityCapabilityNode): void => {
        subtreeCompetencyIds.add(node.competency.id)
        node.children.forEach(collectCompetencyIds)
      }
      children.forEach(collectCompetencyIds)
      const goalCount = visibleGoals.value.filter(
        (goal) => goal.competencyId && subtreeCompetencyIds.has(goal.competencyId),
      ).length

      return {
        competency,
        children,
        assignments,
        directions: linkedDirections,
        goalCount,
        isDirect: assignments.length > 0,
      }
    }

    return roots
      .map(buildNode)
      .filter((node): node is IdentityCapabilityNode => node !== null)
      .sort((left, right) =>
        left.competency.name.localeCompare(right.competency.name, 'zh-CN'),
      )
  }

  function capabilityCountForIdentity(identityId: string): number {
    let count = 0
    const visit = (nodes: IdentityCapabilityNode[]): void => {
      for (const node of nodes) {
        count += 1
        visit(node.children)
      }
    }
    visit(capabilityTreeForIdentity(identityId))
    return count
  }

  function goalCountForIdentity(identityId: string): number {
    const competencyIds = new Set<string>()
    const visit = (nodes: IdentityCapabilityNode[]): void => {
      for (const node of nodes) {
        competencyIds.add(node.competency.id)
        visit(node.children)
      }
    }
    visit(capabilityTreeForIdentity(identityId))
    return visibleGoals.value.filter(
      (goal) => goal.competencyId && competencyIds.has(goal.competencyId),
    ).length
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [
        visionRows,
        identityRows,
        directionRows,
        competencyRows,
        directionCompetencyRows,
        goalRows,
      ] = await Promise.all([
        repos.visions.list({ includeArchived: true }),
        repos.identities.list({ includeArchived: true }),
        repos.directions.list({ includeArchived: true }),
        repos.competencies.list({ includeArchived: true }),
        repos.directionCompetencies.list({ includeArchived: true }),
        repos.goals.list({ includeArchived: true }),
      ])
      visions.value = visionRows
      identities.value = identityRows
      directions.value = directionRows
      competencies.value = competencyRows
      directionCompetencies.value = directionCompetencyRows
      goals.value = goalRows

      if (
        selectedVisionId.value &&
        !visibleVisions.value.some((vision) => vision.id === selectedVisionId.value)
      ) {
        selectedVisionId.value = visibleVisions.value[0]?.id ?? null
      }
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveVision(input: VisionInput, id?: string): Promise<Vision> {
    const entity = id
      ? await repos.visions.update(id, input)
      : await repos.visions.create(input)
    await refresh()
    selectedVisionId.value = entity.id
    return entity
  }

  async function saveIdentity(input: IdentityInput, id?: string): Promise<Identity> {
    const entity = id
      ? await repos.identities.update(id, input)
      : await repos.identities.create(input)
    await refresh()
    return entity
  }

  async function saveDirection(input: DirectionInput, id?: string): Promise<Direction> {
    const entity = id
      ? await repos.directions.update(id, input)
      : await repos.directions.create(input)
    await refresh()
    return entity
  }

  async function setArchived(
    kind: FutureSelfKind,
    id: string,
    archived: boolean,
  ): Promise<void> {
    if (kind === 'vision') {
      archived ? await repos.visions.archive(id) : await repos.visions.restore(id)
    } else if (kind === 'identity') {
      archived ? await repos.identities.archive(id) : await repos.identities.restore(id)
    } else {
      archived ? await repos.directions.archive(id) : await repos.directions.restore(id)
    }
    await refresh()
  }

  return {
    loading,
    error,
    visions,
    identities,
    directions,
    competencies,
    directionCompetencies,
    goals,
    includeArchived,
    selectedVisionId,
    selectedVision,
    visibleVisions,
    selectedIdentities,
    selectedDirections,
    activeVisions,
    activeDirectionCount,
    activeIdentityCount,
    weeklyBudgetMinutes,
    archivedVisionCount,
    defaultIdentityId,
    countDirections,
    countIdentities,
    directionsForIdentity,
    identityForDirection,
    capabilityTreeForIdentity,
    capabilityCountForIdentity,
    goalCountForIdentity,
    refresh,
    saveVision,
    saveIdentity,
    saveDirection,
    setArchived,
  }
}
