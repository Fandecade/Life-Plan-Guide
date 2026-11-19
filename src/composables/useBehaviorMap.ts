import { computed, ref } from 'vue'
import {
  BehaviorCandidateStatus,
  BehaviorSourceType,
  HabitCategory,
  HabitStatus,
  PromptStatus,
  type AnchorType,
  type BehaviorCandidate,
  type BehaviorSourceType as BehaviorSourceTypeValue,
  type Direction,
  type Goal,
  type Habit,
  type NewEntity,
  type Task,
} from '@/domain'
import { repos } from '@/data'

export type BehaviorCandidateInput = Omit<NewEntity<BehaviorCandidate>, 'id'>

export interface BehaviorRecipeInput {
  name: string
  anchorType: AnchorType
  anchorDescription: string
  tinyBehavior: string
  celebration: string
  motivationLevel: number
  abilityLevel: number
  promptStatus: PromptStatus
  frequency: string
}

export function useBehaviorMap() {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const candidates = ref<BehaviorCandidate[]>([])
  const directions = ref<Direction[]>([])
  const goals = ref<Goal[]>([])
  const tasks = ref<Task[]>([])

  const activeCandidates = computed(() =>
    candidates.value.filter(
      (candidate) =>
        candidate.status !== BehaviorCandidateStatus.ARCHIVED && !candidate.archivedAt,
    ),
  )

  const goldenCandidates = computed(() =>
    activeCandidates.value.filter((candidate) => candidate.impact >= 3 && candidate.ease >= 3),
  )

  const designedCount = computed(
    () =>
      candidates.value.filter(
        (candidate) => candidate.status === BehaviorCandidateStatus.DESIGNED,
      ).length,
  )

  const unscoredCandidates = computed(() =>
    activeCandidates.value.filter(
      (candidate) => candidate.impact <= 0 || candidate.ease <= 0,
    ),
  )

  const directionMap = computed<Record<string, Direction>>(() => {
    const map: Record<string, Direction> = {}
    for (const direction of directions.value) map[direction.id] = direction
    return map
  })

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [candidateRows, directionRows, goalRows, taskRows] = await Promise.all([
        repos.behaviorCandidates.list({ includeArchived: true }),
        repos.directions.list({ includeArchived: true }),
        repos.goals.list({ includeArchived: true }),
        repos.tasks.list({ includeArchived: true }),
      ])
      candidates.value = candidateRows
      directions.value = directionRows
      goals.value = goalRows
      tasks.value = taskRows
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      loading.value = false
    }
  }

  async function saveCandidate(
    input: BehaviorCandidateInput,
    id?: string,
  ): Promise<BehaviorCandidate> {
    const entity = id
      ? await repos.behaviorCandidates.update(id, input)
      : await repos.behaviorCandidates.create(input)
    await refresh()
    return entity
  }

  async function updateScore(id: string, impact: number, ease: number): Promise<void> {
    await repos.behaviorCandidates.update(id, {
      impact: Math.max(0, Math.min(5, Math.round(impact))),
      ease: Math.max(0, Math.min(5, Math.round(ease))),
    })
    await refresh()
  }

  async function resetScore(id: string): Promise<void> {
    await repos.behaviorCandidates.update(id, { impact: 0, ease: 0 })
    await refresh()
  }

  async function setCandidateStatus(
    id: string,
    status: BehaviorCandidateStatus,
  ): Promise<void> {
    await repos.behaviorCandidates.update(id, { status })
    await refresh()
  }

  async function archiveCandidate(id: string, archived: boolean): Promise<void> {
    if (archived) {
      await repos.behaviorCandidates.archive(id)
      await repos.behaviorCandidates.update(id, {
        status: BehaviorCandidateStatus.ARCHIVED,
      })
    } else {
      const row = candidates.value.find((candidate) => candidate.id === id)
      await repos.behaviorCandidates.restore(id)
      await repos.behaviorCandidates.update(id, {
        status: row?.habitId
          ? BehaviorCandidateStatus.DESIGNED
          : BehaviorCandidateStatus.CANDIDATE,
      })
    }
    await refresh()
  }

  async function designHabit(
    candidate: BehaviorCandidate,
    recipe: BehaviorRecipeInput,
  ): Promise<Habit> {
    const habit = await repos.habits.create({
      name: recipe.name.trim() || candidate.title,
      description: candidate.description,
      category: HabitCategory.STARTER,
      anchorType: recipe.anchorType,
      anchorDescription: recipe.anchorDescription.trim(),
      tinyBehavior: recipe.tinyBehavior.trim(),
      celebration: recipe.celebration.trim(),
      motivationLevel: Math.max(1, Math.min(5, recipe.motivationLevel)),
      abilityLevel: Math.max(1, Math.min(5, recipe.abilityLevel)),
      promptStatus: recipe.promptStatus,
      frequency: recipe.frequency.trim() || '每天',
      status: HabitStatus.ACTIVE,
    })
    await repos.behaviorCandidates.update(candidate.id, {
      status: BehaviorCandidateStatus.DESIGNED,
      habitId: habit.id,
    })
    await refresh()
    return habit
  }

  function sourceLabel(sourceType: BehaviorSourceTypeValue): string {
    if (sourceType === BehaviorSourceType.DIRECTION) return '方向'
    if (sourceType === BehaviorSourceType.GOAL) return '目标'
    if (sourceType === BehaviorSourceType.TASK) return '任务'
    return '自选'
  }

  function sourceObjectLabel(candidate: BehaviorCandidate): string {
    if (candidate.sourceType === BehaviorSourceType.DIRECTION) {
      return directionMap.value[candidate.sourceId ?? candidate.directionId ?? '']?.name ?? '方向已删除'
    }
    if (candidate.sourceType === BehaviorSourceType.GOAL) {
      return goals.value.find((goal) => goal.id === candidate.sourceId)?.title ?? '目标已删除'
    }
    if (candidate.sourceType === BehaviorSourceType.TASK) {
      return tasks.value.find((task) => task.id === candidate.sourceId)?.title ?? '任务已删除'
    }
    return '手动添加'
  }

  async function removeCandidate(id: string): Promise<void> {
    const candidate = candidates.value.find((row) => row.id === id)
    if (candidate?.habitId || candidate?.status === BehaviorCandidateStatus.DESIGNED) {
      throw new Error('已经设计为习惯的候选只能归档，不能删除')
    }
    await repos.behaviorCandidates.remove(id)
    await refresh()
  }

  async function batchArchive(ids: string[], archived: boolean): Promise<void> {
    for (const id of ids) {
      const candidate = candidates.value.find((row) => row.id === id)
      if (!candidate) continue
      if (archived) {
        await repos.behaviorCandidates.archive(id)
        await repos.behaviorCandidates.update(id, { status: BehaviorCandidateStatus.ARCHIVED })
      } else {
        await repos.behaviorCandidates.restore(id)
        await repos.behaviorCandidates.update(id, {
          status: candidate.habitId
            ? BehaviorCandidateStatus.DESIGNED
            : BehaviorCandidateStatus.CANDIDATE,
        })
      }
    }
    await refresh()
  }

  async function markForDesign(ids: string[]): Promise<number> {
    let count = 0
    for (const id of ids) {
      const candidate = candidates.value.find((row) => row.id === id)
      if (!candidate || candidate.habitId || candidate.status === BehaviorCandidateStatus.DESIGNED) continue
      await repos.behaviorCandidates.update(id, {
        status: BehaviorCandidateStatus.CANDIDATE,
        impact: 0,
        ease: 0,
      })
      count += 1
    }
    await refresh()
    return count
  }

  return {
    loading,
    error,
    candidates,
    directions,
    goals,
    tasks,
    activeCandidates,
    goldenCandidates,
    designedCount,
    unscoredCandidates,
    directionMap,
    refresh,
    saveCandidate,
    updateScore,
    resetScore,
    setCandidateStatus,
    archiveCandidate,
    designHabit,
    sourceLabel,
    sourceObjectLabel,
    removeCandidate,
    batchArchive,
    markForDesign,
  }
}