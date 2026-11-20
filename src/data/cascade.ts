import type { BaseEntity } from '@/domain'
import { repos } from './index'
import type { Repository } from './repository'
import { emitDataChange } from './events'

async function applyArchive<T extends BaseEntity>(
  repo: Repository<T>,
  rows: T[],
  archived: boolean,
): Promise<void> {
  for (const row of rows) {
    if (archived && !row.archivedAt) await repo.archive(row.id)
    if (!archived && row.archivedAt) await repo.restore(row.id)
  }
}

export async function setTaskArchivedCascade(
  taskId: string,
  archived: boolean,
): Promise<void> {
  archived ? await repos.tasks.archive(taskId) : await repos.tasks.restore(taskId)
  const [goalLinks, competencyLinks, dependencies] = await Promise.all([
    repos.taskGoals.list({ includeArchived: true }),
    repos.taskCompetencies.list({ includeArchived: true }),
    repos.taskDependencies.list({ includeArchived: true }),
  ])
  await applyArchive(
    repos.taskGoals,
    goalLinks.filter((row) => row.taskId === taskId),
    archived,
  )
  await applyArchive(
    repos.taskCompetencies,
    competencyLinks.filter((row) => row.taskId === taskId),
    archived,
  )
  await applyArchive(
    repos.taskDependencies,
    dependencies.filter(
      (row) => row.predecessorTaskId === taskId || row.successorTaskId === taskId,
    ),
    archived,
  )
  emitDataChange('task', 'goal', 'competency')
}

export async function setGoalArchivedCascade(
  goalId: string,
  archived: boolean,
): Promise<void> {
  archived ? await repos.goals.archive(goalId) : await repos.goals.restore(goalId)
  const [directionLinks, milestoneLinks] = await Promise.all([
    repos.goalDirections.list({ includeArchived: true }),
    repos.goalMilestones.list({ includeArchived: true }),
  ])
  await applyArchive(
    repos.goalDirections,
    directionLinks.filter((row) => row.goalId === goalId),
    archived,
  )
  await applyArchive(
    repos.goalMilestones,
    milestoneLinks.filter((row) => row.goalId === goalId),
    archived,
  )
  emitDataChange('goal', 'milestone')
}

export async function setCompetencyArchivedCascade(
  competencyId: string,
  archived: boolean,
): Promise<void> {
  archived
    ? await repos.competencies.archive(competencyId)
    : await repos.competencies.restore(competencyId)
  emitDataChange('competency')
}


export async function setDirectionArchivedCascade(
  directionId: string,
  archived: boolean,
): Promise<void> {
  archived
    ? await repos.directions.archive(directionId)
    : await repos.directions.restore(directionId)
  const [competencyLinks, goalLinks, milestones] = await Promise.all([
    repos.directionCompetencies.list({ includeArchived: true }),
    repos.goalDirections.list({ includeArchived: true }),
    repos.milestones.list({ includeArchived: true }),
  ])
  await applyArchive(
    repos.directionCompetencies,
    competencyLinks.filter((row) => row.directionId === directionId),
    archived,
  )
  await applyArchive(
    repos.goalDirections,
    goalLinks.filter((row) => row.directionId === directionId),
    archived,
  )
  await applyArchive(
    repos.milestones,
    milestones.filter((row) => row.directionId === directionId),
    archived,
  )
  emitDataChange('direction', 'competency', 'goal', 'milestone')
}