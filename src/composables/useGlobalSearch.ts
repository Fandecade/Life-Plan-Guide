import { computed, ref } from 'vue'
import {
  evidenceTypeLabels,
  goalStatusLabels,
  masteryLevelLabels,
  milestoneStatusLabels,
  reviewTypeLabels,
  taskStatusLabels,

} from '@/domain'
import { repos } from '@/data'
import { formatShortDate } from '@/utils/date'

export type SearchIcon =
  | 'compass'
  | 'map'
  | 'target'
  | 'layers'
  | 'bulb'
  | 'flag'
  | 'spark'
  | 'repeat'
  | 'refresh'
  | 'book'
  | 'sliders'

export interface SearchItem {
  id: string
  type: string
  typeLabel: string
  title: string
  subtitle: string
  route: string
  icon: SearchIcon
}

export interface SearchGroup {
  key: string
  label: string
  items: SearchItem[]
}

interface SearchIndexEntry extends SearchItem {
  searchText: string
}

const GROUP_ORDER = [
  'vision',
  'direction',
  'goal',
  'task',
  'milestone',
  'knowledge',
  'habit',
  'workflow',
  'evidence',
  'resource',
  'review',
]

const GROUP_LABELS: Record<string, string> = {
  vision: '愿景',
  direction: '发展方向',
  goal: '目标',
  task: '任务',
  milestone: '里程碑',
  knowledge: '知识点',
  habit: '习惯',
  workflow: '学习流程',
  evidence: '成果',
  resource: '资源',
  review: '复盘',
}

const entries = ref<SearchIndexEntry[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

function addEntry(
  item: Omit<SearchItem, 'searchText'> & { extra?: string },
): void {
  entries.value.push({
    ...item,
    searchText: `${item.title} ${item.subtitle} ${item.extra ?? ''}`.toLowerCase(),
  })
}

async function loadIndex(force = false): Promise<void> {
  if (loading.value) return
  if (loaded.value && !force) return
  loading.value = true
  error.value = null
  try {
    const [
      visions,
      directions,
      goals,
      tasks,
      milestones,
      knowledgeItems,
      habits,
      workflows,
      evidences,
      resources,
      reviews,
    ] = await Promise.all([
      repos.visions.list(),
      repos.directions.list(),
      repos.goals.list(),
      repos.tasks.list(),
      repos.milestones.list(),
      repos.knowledgeItems.list(),
      repos.habits.list(),
      repos.workflows.list(),
      repos.evidences.list(),
      repos.resources.list(),
      repos.reviews.list(),
    ])

    const next: SearchIndexEntry[] = []
    entries.value = next

    for (const vision of visions) {
      addEntry({
        id: vision.id,
        type: 'vision',
        typeLabel: GROUP_LABELS.vision,
        title: vision.title,
        subtitle: vision.lifeArea || '未来愿景',
        route: '/future-self',
        icon: 'compass',
        extra: vision.description,
      })
    }
    for (const direction of directions) {
      addEntry({
        id: direction.id,
        type: 'direction',
        typeLabel: GROUP_LABELS.direction,
        title: direction.name,
        subtitle: `每周 ${direction.weeklyTimeBudget} 分钟 · ${direction.reviewFrequency || '未设审视周期'}`,
        route: '/future-self',
        icon: 'map',
        extra: direction.description,
      })
    }
    for (const goal of goals) {
      addEntry({
        id: goal.id,
        type: 'goal',
        typeLabel: GROUP_LABELS.goal,
        title: goal.title,
        subtitle: `${goalStatusLabels[goal.status]} · ${goal.successCriteria || '目标与任务'}`,
        route: '/goals',
        icon: 'target',
        extra: goal.description,
      })
    }
    for (const task of tasks) {
      addEntry({
        id: task.id,
        type: 'task',
        typeLabel: GROUP_LABELS.task,
        title: task.title,
        subtitle: `${taskStatusLabels[task.status]} · 预计 ${task.estimatedDuration} 分钟`,
        route: '/goals',
        icon: 'layers',
        extra: task.description,
      })
    }
    for (const milestone of milestones) {
      addEntry({
        id: milestone.id,
        type: 'milestone',
        typeLabel: GROUP_LABELS.milestone,
        title: milestone.name,
        subtitle: `${milestoneStatusLabels[milestone.status]} · ${formatShortDate(milestone.dueDate)}`,
        route: '/roadmap',
        icon: 'flag',
        extra: milestone.description,
      })
    }
    for (const item of knowledgeItems) {
      addEntry({
        id: item.id,
        type: 'knowledge',
        typeLabel: GROUP_LABELS.knowledge,
        title: item.title,
        subtitle: masteryLevelLabels[item.masteryLevel],
        route: '/learning',
        icon: 'bulb',
        extra: item.description,
      })
    }
    for (const habit of habits) {
      addEntry({
        id: habit.id,
        type: 'habit',
        typeLabel: GROUP_LABELS.habit,
        title: habit.name,
        subtitle: habit.tinyBehavior,
        route: '/habits',
        icon: 'repeat',
        extra: habit.anchorDescription,
      })
    }
    for (const workflow of workflows) {
      addEntry({
        id: workflow.id,
        type: 'workflow',
        typeLabel: GROUP_LABELS.workflow,
        title: workflow.name,
        subtitle: `${workflow.stages.length} 个阶段`,
        route: '/learning',
        icon: 'refresh',
        extra: workflow.description,
      })
    }
    for (const evidence of evidences) {
      addEntry({
        id: evidence.id,
        type: 'evidence',
        typeLabel: GROUP_LABELS.evidence,
        title: evidence.title,
        subtitle: evidenceTypeLabels[evidence.evidenceType],
        route: '/learning',
        icon: 'spark',
        extra: evidence.description,
      })
    }
    for (const resource of resources) {
      addEntry({
        id: resource.id,
        type: 'resource',
        typeLabel: GROUP_LABELS.resource,
        title: resource.title,
        subtitle: resource.source || resource.externalUrl,
        route: '/learning',
        icon: 'book',
        extra: resource.description,
      })
    }
    for (const review of reviews) {
      addEntry({
        id: review.id,
        type: 'review',
        typeLabel: GROUP_LABELS.review,
        title: `${reviewTypeLabels[review.reviewType]} · ${formatShortDate(review.targetDate)}`,
        subtitle: review.content.replace(/^##.*$/gm, ' ').replace(/\s+/g, ' ').slice(0, 60),
        route: '/review',
        icon: 'refresh',
        extra: review.content,
      })
    }

    loaded.value = true
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    loading.value = false
  }
}

export function useGlobalSearch() {
  const query = ref('')

  const groups = computed<SearchGroup[]>(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return []
    const matched = entries.value.filter((entry) =>
      entry.searchText.includes(keyword),
    )
    const map = new Map<string, SearchItem[]>()
    for (const entry of matched) {
      if (!map.has(entry.type)) map.set(entry.type, [])
      const list = map.get(entry.type)
      if (list && list.length < 5) {
        const { searchText: _searchText, ...item } = entry
        list.push(item)
      }
    }
    return GROUP_ORDER.filter((type) => map.has(type)).map((type) => ({
      key: type,
      label: GROUP_LABELS[type],
      items: map.get(type) ?? [],
    }))
  })

  const resultCount = computed(() =>
    groups.value.reduce((total, group) => total + group.items.length, 0),
  )

  return {
    query,
    groups,
    resultCount,
    loading,
    error,
    loaded,
    loadIndex,
  }
}