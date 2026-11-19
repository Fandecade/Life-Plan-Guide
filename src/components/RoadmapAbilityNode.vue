<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  competencyCategoryLabels,
  milestoneStatusLabels,
  type Competency,
  type CompetencyLevel,
  type Milestone,
} from '@/domain'
import { levelIndex, type CompetencyNode } from '@/composables/useRoadmap'
import { formatShortDate, relativeDay } from '@/utils/date'

defineOptions({ name: 'RoadmapAbilityNode' })

const props = defineProps<{
  node: CompetencyNode
  directionId: string
  directionColor: string
  requiredLevels: Record<string, CompetencyLevel>
  milestonesByCompetency: Record<string, Milestone[]>
  focusedCompetencyId?: string | null
}>()

const emit = defineEmits<{
  openCompetency: [competency: Competency]
  addChild: [competency: Competency]
  editCompetency: [competency: Competency]
  toggleArchive: [competency: Competency]
  addMilestone: [competency: Competency]
  openMilestone: [milestone: Milestone]
}>()

const expanded = ref(false)
const nodeKey = computed(() => `${props.directionId}:${props.node.competency.id}`)
const milestones = computed(() => props.milestonesByCompetency[nodeKey.value] ?? [])
const hasChildren = computed(() => props.node.children.length > 0)
const requiredLevel = computed(
  () => props.requiredLevels[props.node.competency.id] ?? props.node.competency.targetLevel,
)
const nextMilestone = computed(
  () =>
    milestones.value.find(
      (milestone) =>
        milestone.status !== 'COMPLETED' && milestone.status !== 'CANCELLED',
    ) ?? milestones.value.at(-1),
)
const progress = computed(() => {
  const required = Math.max(1, levelIndex(requiredLevel.value))
  return Math.min(100, Math.round((levelIndex(props.node.competency.currentLevel) / required) * 100))
})

watch(
  () => props.focusedCompetencyId,
  (id) => {
    if (id === props.node.competency.id) expanded.value = true
  },
  { immediate: true },
)

function toggleExpanded(): void {
  expanded.value = !expanded.value
}
</script>

<template>
  <li
    class="ability-node"
    :class="{ archived: node.competency.archivedAt }"
    :data-ability-id="node.competency.id"
    :data-ability-name="node.competency.name"
  >
    <div class="ability-row">
      <button
        class="ability-expand"
        :class="{ open: expanded }"
        :aria-label="expanded ? `收起 ${node.competency.name}` : `展开 ${node.competency.name}`"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        <AppIcon name="arrow-right" :size="14" />
      </button>

      <button class="ability-main" @click="emit('openCompetency', node.competency)">
        <span class="ability-name-line">
          <strong>{{ node.competency.name }}</strong>
          <span class="ability-category">{{ competencyCategoryLabels[node.competency.category] }}</span>
          <span v-if="node.competency.archivedAt" class="badge badge-amber">已归档</span>
        </span>
        <span class="ability-level-line">
          <span>{{ node.competency.currentLevel }}</span>
          <span class="level-arrow">→</span>
          <span>{{ requiredLevel }}</span>
          <span class="ability-progress" aria-hidden="true">
            <span
              :style="{ width: `${progress}%`, background: directionColor }"
            />
          </span>
        </span>
      </button>

      <div class="ability-stats">
        <span v-if="hasChildren">{{ node.children.length }} 个子能力</span>
        <span>{{ milestones.length }} 个里程碑</span>
        <span v-if="nextMilestone" class="ability-next">
          下一节点 {{ formatShortDate(nextMilestone.dueDate ?? nextMilestone.startDate) }}
        </span>
        <span v-else class="ability-next muted">暂无时间节点</span>
      </div>

      <div class="ability-actions">
        <button
          v-if="!node.competency.archivedAt"
          class="icon-btn"
          title="添加子能力"
          aria-label="添加子能力"
          @click="emit('addChild', node.competency)"
        >
          <AppIcon name="plus" :size="14" />
        </button>
        <button
          v-if="!node.competency.archivedAt"
          class="icon-btn"
          title="编辑能力"
          aria-label="编辑能力"
          @click="emit('editCompetency', node.competency)"
        >
          <AppIcon name="sliders" :size="14" />
        </button>
        <button
          class="icon-btn"
          :title="node.competency.archivedAt ? '恢复能力' : '归档能力'"
          :aria-label="node.competency.archivedAt ? '恢复能力' : '归档能力'"
          @click="emit('toggleArchive', node.competency)"
        >
          <AppIcon :name="node.competency.archivedAt ? 'archive' : 'trash'" :size="14" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="ability-detail">
      <p v-if="node.competency.description" class="ability-description">
        {{ node.competency.description }}
      </p>

      <ul v-if="hasChildren" class="ability-children">
        <RoadmapAbilityNode
          v-for="child in node.children"
          :key="child.competency.id"
          :node="child"
          :direction-id="directionId"
          :direction-color="directionColor"
          :required-levels="requiredLevels"
          :milestones-by-competency="milestonesByCompetency"
          :focused-competency-id="focusedCompetencyId"
          @open-competency="emit('openCompetency', $event)"
          @add-child="emit('addChild', $event)"
          @edit-competency="emit('editCompetency', $event)"
          @toggle-archive="emit('toggleArchive', $event)"
          @add-milestone="emit('addMilestone', $event)"
          @open-milestone="emit('openMilestone', $event)"
        />
      </ul>

      <section class="ability-milestones" aria-label="能力里程碑与时间节点">
        <div class="ability-milestones-head">
          <span>
            <AppIcon name="flag" :size="14" />
            里程碑与时间节点
          </span>
          <button
            v-if="!node.competency.archivedAt"
            class="ability-add-milestone"
            @click="emit('addMilestone', node.competency)"
          >
            <AppIcon name="plus" :size="13" />
            添加里程碑
          </button>
        </div>

        <div v-if="milestones.length === 0" class="ability-milestone-empty">
          这个能力还没有里程碑。为它设置一个可验收的阶段成果和时间节点。
        </div>
        <div v-else class="ability-milestone-list">
          <button
            v-for="milestone in milestones"
            :key="milestone.id"
            class="ability-milestone"
            @click="emit('openMilestone', milestone)"
          >
            <span class="milestone-date">
              <strong>{{ formatShortDate(milestone.dueDate ?? milestone.startDate) }}</strong>
              <small>{{ relativeDay(milestone.dueDate) }}</small>
            </span>
            <span
              class="milestone-dot"
              :class="milestone.status.toLowerCase()"
              :style="{ '--milestone-color': directionColor }"
            />
            <span class="milestone-copy">
              <strong>{{ milestone.name }}</strong>
              <small>
                {{ formatShortDate(milestone.startDate) }} → {{ formatShortDate(milestone.dueDate) }}
              </small>
            </span>
            <span class="milestone-status">{{ milestoneStatusLabels[milestone.status] }}</span>
            <AppIcon name="arrow-right" :size="13" />
          </button>
        </div>
      </section>
    </div>
  </li>
</template>

<style scoped>
.ability-node {
  position: relative;
  list-style: none;
}

.ability-node + .ability-node {
  border-top: 1px solid var(--line-faint);
}

.ability-node.archived > .ability-row {
  opacity: 0.64;
}

.ability-row {
  display: grid;
  grid-template-columns: 30px minmax(210px, 1fr) minmax(240px, auto) auto;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 9px 10px 9px 2px;
}

.ability-expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  color: var(--muted);
}

.ability-expand:hover {
  background: var(--surface-muted);
  color: var(--ink);
}

.ability-expand .icon {
  transform: rotate(0deg);
  transition: transform 0.18s var(--ease-out);
}

.ability-expand.open .icon {
  transform: rotate(90deg);
}

.ability-main {
  min-width: 0;
  padding: 2px 0;
  text-align: left;
}

.ability-main:hover .ability-name-line strong {
  color: var(--accent);
}

.ability-name-line,
.ability-level-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.ability-name-line strong {
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.45;
}

.ability-category {
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: 11px;
}

.ability-level-line {
  margin-top: 5px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.level-arrow {
  color: var(--line-strong);
}

.ability-progress {
  display: block;
  width: 74px;
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--bg-deep);
}

.ability-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.ability-stats {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.ability-next {
  color: var(--ink-soft);
}

.ability-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0.45;
  transition: opacity 0.16s ease;
}

.ability-row:hover .ability-actions {
  opacity: 1;
}

.ability-detail {
  margin: 0 10px 12px 40px;
  padding: 10px 0 2px 14px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 18%, var(--line-faint));
}

.ability-description {
  margin: 0 0 9px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.ability-children {
  margin: 0;
  padding: 0;
  border-top: 1px dashed var(--line);
}

.ability-milestones {
  margin-top: 11px;
  padding: 11px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.ability-milestones-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
}

.ability-milestones-head > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ability-add-milestone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.ability-add-milestone:hover {
  text-decoration: underline;
}

.ability-milestone-empty {
  padding: 14px 2px 4px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.65;
}

.ability-milestone-list {
  margin-top: 8px;
  border-top: 1px solid var(--line-faint);
}

.ability-milestone {
  display: grid;
  grid-template-columns: 86px 10px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 3px;
  border-bottom: 1px solid var(--line-faint);
  text-align: left;
}

.ability-milestone:last-child {
  border-bottom: 0;
}

.ability-milestone:hover {
  background: var(--surface);
}

.milestone-date {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-mono);
}

.milestone-date strong {
  color: var(--ink-soft);
  font-size: 11.5px;
  font-weight: 600;
}

.milestone-date small {
  color: var(--muted);
  font-size: 10.5px;
}

.milestone-dot {
  width: 8px;
  height: 8px;
  border: 2px solid var(--milestone-color);
  border-radius: 50%;
  background: var(--surface);
}

.milestone-dot.completed {
  background: var(--milestone-color);
}

.milestone-dot.in_progress {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--milestone-color) 14%, transparent);
}

.milestone-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.milestone-copy strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.milestone-copy small {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.milestone-status {
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--muted);
  font-size: 10.5px;
  white-space: nowrap;
}

@media (max-width: 1080px) {
  .ability-row {
    grid-template-columns: 30px minmax(180px, 1fr) auto;
  }

  .ability-stats {
    grid-column: 2 / -1;
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .ability-row {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 6px;
  }

  .ability-stats {
    display: none;
  }

  .ability-actions {
    opacity: 1;
  }

  .ability-detail {
    margin-left: 17px;
    padding-left: 9px;
  }

  .ability-milestones-head {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ability-milestones-head > span,
  .ability-add-milestone {
    white-space: nowrap;
  }

  .ability-add-milestone {
    margin-left: auto;
  }

  .ability-milestone {
    grid-template-columns: 74px 8px minmax(0, 1fr);
  }

  .milestone-status,
  .ability-milestone > .icon {
    display: none;
  }

  .milestone-copy strong {
    white-space: normal;
  }
}
</style>
