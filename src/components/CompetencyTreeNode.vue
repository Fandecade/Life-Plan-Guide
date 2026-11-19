<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { competencyCategoryLabels, competencyLevelLabels, type Competency, type Direction, type DirectionCompetency } from '@/domain'
import { levelPercent, type CompetencyNode } from '@/composables/useRoadmap'

defineOptions({ name: 'CompetencyTreeNode' })

const props = defineProps<{
  node: CompetencyNode
  directionMap: Record<string, Direction>
  assignmentsByCompetency: Record<string, DirectionCompetency[]>
  evidenceCounts: Record<string, number>
}>()

const emit = defineEmits<{
  addChild: [competency: Competency]
  edit: [competency: Competency]
  toggleArchive: [competency: Competency]

  openDetail: [competency: Competency]
}>()

const collapsed = ref(false)
const hasChildren = computed(() => props.node.children.length > 0)
const assignments = computed(
  () => props.assignmentsByCompetency[props.node.competency.id] ?? [],
)
const evidenceCount = computed(() => props.evidenceCounts[props.node.competency.id] ?? 0)
const progress = computed(() => levelPercent(props.node.competency.currentLevel))
const target = computed(() => levelPercent(props.node.competency.targetLevel))

function toggle(): void {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <li class="tree-node" :class="{ archived: node.competency.archivedAt }">
    <div class="node-row">
      <button
        v-if="hasChildren"
        class="expand-btn"
        :class="{ collapsed }"
        :aria-label="collapsed ? '展开子能力' : '收起子能力'"
        @click="toggle"
      >
        <AppIcon name="arrow-right" :size="13" />
      </button>
      <span v-else class="expand-placeholder" />

      <div
        class="node-main"
        role="button"
        tabindex="0"
        @click="emit('openDetail', node.competency)"
        @keydown.enter="emit('openDetail', node.competency)"
      >
        <div class="node-head">
          <span class="node-name">{{ node.competency.name }}</span>
          <span class="badge">{{ competencyCategoryLabels[node.competency.category] }}</span>
          <span v-if="node.competency.archivedAt" class="badge badge-amber">已归档</span>
          <span
            v-if="evidenceCount > 0"
            class="evidence-pill"
            :title="`${evidenceCount} 条能力证据`"
          >
            <AppIcon name="check" :size="10" />
            {{ evidenceCount }} 证据
          </span>
        </div>

        <p v-if="node.competency.description" class="node-desc">
          {{ node.competency.description }}
        </p>

        <div v-if="assignments.length" class="node-tags">
          <span
            v-for="assignment in assignments"
            :key="assignment.id"
            class="direction-tag"
            :style="{ '--tag-color': directionMap[assignment.directionId]?.color ?? '#3563e9' }"
          >
            <span class="tag-dot" />
            {{ directionMap[assignment.directionId]?.name ?? '未知方向' }}
            <span class="tag-level">{{ assignment.requiredLevel }}</span>
          </span>
        </div>

        <div class="level-line">
          <span class="level-caption">
            {{ competencyLevelLabels[node.competency.currentLevel] }}
            <span class="level-arrow">→</span>
            {{ node.competency.targetLevel }}
          </span>
          <div class="level-track" :title="`当前 ${progress}% / 目标 ${target}%`">
            <span class="level-fill" :style="{ width: `${progress}%` }" />
            <span class="level-target" :style="{ left: `${target}%` }" />
          </div>
        </div>
      </div>

      <div class="node-actions">
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
          @click="emit('edit', node.competency)"
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

    <ul v-if="hasChildren && !collapsed" class="tree-children">
      <CompetencyTreeNode
        v-for="child in node.children"
        :key="child.competency.id"
        :node="child"
        :direction-map="directionMap"
        :assignments-by-competency="assignmentsByCompetency"
        :evidence-counts="evidenceCounts"
        @add-child="emit('addChild', $event)"
        @edit="emit('edit', $event)"
        @toggle-archive="emit('toggleArchive', $event)"
        @open-detail="emit('openDetail', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree-node {
  position: relative;
}

.node-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 13px 10px 13px 0;
  border-top: 1px solid var(--line-faint);
}

.tree-node:first-child > .node-row {
  border-top: none;
}

.tree-node.archived > .node-row {
  opacity: 0.64;
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  margin-top: 1px;
  border-radius: var(--radius-xs);
  color: var(--muted);
  transition:
    background-color 0.16s ease,
    transform 0.18s var(--ease-out);
}

.expand-btn:hover {
  background: var(--surface-muted);
  color: var(--ink);
}

.expand-btn .icon {
  transform: rotate(90deg);
  transition: transform 0.18s var(--ease-out);
}

.expand-btn.collapsed .icon {
  transform: rotate(0deg);
}

.expand-placeholder {
  width: 22px;
  flex: none;
}

.node-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.node-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.node-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.evidence-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--accent-faint);
  color: var(--accent);
  font-size: 9.5px;
}

.node-desc {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.65;
}

.node-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}

.direction-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--tag-color) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--tag-color) 22%, transparent);
  color: var(--ink-soft);
  font-size: 9.5px;
}

.tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tag-color);
}

.tag-level {
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: var(--tag-color);
}

.level-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.level-caption {
  flex: none;
  font-size: 9.5px;
  color: var(--muted);
  white-space: nowrap;
}

.level-arrow {
  color: var(--line-strong);
}

.level-track {
  position: relative;
  flex: 1;
  max-width: 260px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--bg-deep);
}

.level-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.level-target {
  position: absolute;
  top: -2px;
  width: 1.5px;
  height: 9px;
  border-radius: 1px;
  background: var(--amber);
  transform: translateX(-50%);
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
  opacity: 0.35;
  transition: opacity 0.16s ease;
}

.node-row:hover .node-actions {
  opacity: 1;
}

.node-actions .icon-btn {
  width: 28px;
  height: 28px;
}

.tree-children {
  margin-left: 30px;
  padding-left: 12px;
  border-left: 1px dashed var(--line-strong);
}

@media (max-width: 760px) {
  .node-actions {
    opacity: 1;
  }

  .level-track {
    max-width: 140px;
  }

  .tree-children {
    margin-left: 12px;
  }
}
</style>