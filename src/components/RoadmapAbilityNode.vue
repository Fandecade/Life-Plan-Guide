<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  competencyCategoryLabels,
  goalStatusLabels,
  type Competency,
  type CompetencyLevel,
  type Goal,
} from '@/domain'
import { levelIndex, type CompetencyNode } from '@/composables/useRoadmap'

defineOptions({ name: 'RoadmapAbilityNode' })

const props = defineProps<{
  node: CompetencyNode
  directionId: string
  directionColor: string
  requiredLevels: Record<string, CompetencyLevel>
  goalCounts: Record<string, number>
  goalsByCompetency: Record<string, Goal[]>
  focusedCompetencyId?: string | null
}>()

const emit = defineEmits<{
  openCompetency: [competency: Competency]
  addChild: [competency: Competency]
  editCompetency: [competency: Competency]
  toggleArchive: [competency: Competency]
  decompose: [competency: Competency]
  openGoal: [goal: Goal]
}>()

const expanded = ref(false)
const hasChildren = computed(() => props.node.children.length > 0)
const goals = computed(() => props.goalsByCompetency[props.node.competency.id] ?? [])
const requiredLevel = computed(
  () => props.requiredLevels[props.node.competency.id] ?? props.node.competency.targetLevel,
)
const goalCount = computed(() => props.goalCounts[props.node.competency.id] ?? 0)
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
        :class="{ open: expanded, placeholder: !hasChildren && !node.competency.description && !goals.length }"
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
            <span :style="{ width: `${progress}%`, background: directionColor }" />
          </span>
        </span>
      </button>

      <div class="ability-stats">
        <span v-if="hasChildren">{{ node.children.length }} 个子能力</span>
        <span :class="{ 'has-goals': goalCount > 0 }">{{ goalCount }} 个目标</span>
      </div>

      <div class="ability-actions">
        <button
          v-if="!node.competency.archivedAt"
          class="ability-decompose"
          title="把这个能力拆解为目标"
          @click="emit('decompose', node.competency)"
        >
          <AppIcon name="target" :size="13" />
          拆解为目标
        </button>
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
      <div class="ability-flow-hint">
        当前能力已有 {{ goalCount }} 个目标。目标可以继续拆成子目标，直到每个底部分支都能转成可执行任务。
      </div>
      <details v-if="goals.length" class="ability-goals">
        <summary>
          <AppIcon name="target" :size="13" />
          已拆解目标
          <span class="ability-goals-count">{{ goals.length }}</span>
          <span class="ability-goals-toggle"><AppIcon name="arrow-right" :size="12" /></span>
        </summary>
        <ul class="ability-goal-list">
          <li v-for="goal in goals" :key="goal.id">
            <button class="ability-goal" @click="emit('openGoal', goal)">
              <span class="ability-goal-title">{{ goal.title }}</span>
              <span class="ability-goal-meta">{{ goalStatusLabels[goal.status] }}</span>
            </button>
          </li>
        </ul>
      </details>
      <p v-else class="ability-goals-empty">还没有拆解目标，点「拆解为目标」开始。</p>
      <ul v-if="hasChildren" class="ability-children">
        <RoadmapAbilityNode
          v-for="child in node.children"
          :key="child.competency.id"
          :node="child"
          :direction-id="directionId"
          :direction-color="directionColor"
          :required-levels="requiredLevels"
          :goal-counts="goalCounts"
          :goals-by-competency="goalsByCompetency"
          :focused-competency-id="focusedCompetencyId"
          @open-competency="emit('openCompetency', $event)"
          @add-child="emit('addChild', $event)"
          @edit-competency="emit('editCompetency', $event)"
          @toggle-archive="emit('toggleArchive', $event)"
          @decompose="emit('decompose', $event)"
          @open-goal="emit('openGoal', $event)"
        />
      </ul>
    </div>
  </li>
</template>

<style scoped>
.ability-node { position: relative; list-style: none; }
.ability-node + .ability-node { border-top: 1px solid var(--line-faint); }
.ability-node.archived > .ability-row { opacity: .62; }
.ability-row { display: grid; grid-template-columns: 30px minmax(230px, 1fr) minmax(120px, auto) auto; align-items: center; gap: 10px; min-height: 68px; padding: 9px 12px 9px 2px; }
.ability-expand { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-xs); color: var(--muted); }
.ability-expand.placeholder { opacity: .2; }
.ability-expand:hover { background: var(--surface-muted); color: var(--ink); }
.ability-expand .icon { transform: rotate(0); transition: transform .18s var(--ease-out); }
.ability-expand.open .icon { transform: rotate(90deg); }
.ability-main { min-width: 0; text-align: left; }
.ability-name-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; color: var(--ink); }
.ability-name-line strong { font-size: .92rem; }
.ability-category { color: var(--muted); font-size: .72rem; }
.ability-level-line { display: flex; align-items: center; gap: 6px; margin-top: 7px; color: var(--muted); font-size: .72rem; }
.level-arrow { color: var(--line-strong); }
.ability-progress { width: 96px; height: 4px; overflow: hidden; border-radius: 999px; background: var(--surface-muted); }
.ability-progress span { display: block; height: 100%; border-radius: inherit; }
.ability-stats { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px 12px; color: var(--muted); font-size: .72rem; }
.ability-stats .has-goals { color: var(--accent-strong); font-weight: 650; }
.ability-actions { display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
.ability-decompose { display: inline-flex; align-items: center; gap: 5px; height: 29px; padding: 0 9px; border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--line)); border-radius: 7px; color: var(--accent-strong); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); font-size: .73rem; font-weight: 650; white-space: nowrap; }
.ability-decompose:hover { background: color-mix(in srgb, var(--accent) 13%, var(--surface)); }
.ability-detail { margin: 0 12px 12px 40px; padding: 12px 14px; border: 1px solid var(--line-faint); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--surface-muted) 55%, var(--surface)); }
.ability-description { margin: 0 0 9px; color: var(--muted); font-size: .78rem; line-height: 1.65; }
.ability-flow-hint { margin-bottom: 10px; padding: 7px 9px; border-radius: 6px; color: var(--muted); background: var(--surface); font-size: .72rem; line-height: 1.55; }
.ability-goals { margin-bottom: 10px; border: 1px solid var(--line-faint); border-radius: 6px; background: var(--surface); overflow: hidden; }
.ability-goals summary { display: flex; align-items: center; gap: 7px; padding: 8px 10px; color: var(--ink); font-size: .74rem; font-weight: 600; cursor: pointer; list-style: none; }
.ability-goals summary::-webkit-details-marker { display: none; }
.ability-goals summary .icon { color: var(--accent); }
.ability-goals-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: .66rem; }
.ability-goals-toggle { margin-left: auto; display: inline-flex; color: var(--muted); transition: transform .18s var(--ease-out); }
.ability-goals[open] .ability-goals-toggle { transform: rotate(90deg); }
.ability-goal-list { display: grid; gap: 4px; margin: 0; padding: 0 8px 8px; list-style: none; }
.ability-goal { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 7px 9px; border-radius: 5px; background: var(--surface-muted); text-align: left; }
.ability-goal:hover { background: color-mix(in srgb, var(--accent) 8%, var(--surface-muted)); }
.ability-goal-title { color: var(--ink); font-size: .74rem; }
.ability-goal-meta { flex: none; color: var(--muted); font-size: .66rem; }
.ability-goals-empty { margin: 0 0 10px; color: var(--muted); font-size: .72rem; }
.ability-children { margin: 0; padding: 0; border: 1px solid var(--line-faint); border-radius: var(--radius-sm); background: var(--surface); overflow: hidden; }
@media (max-width: 900px) {
  .ability-row { grid-template-columns: 26px minmax(0, 1fr) auto; }
  .ability-stats { display: none; }
  .ability-decompose { width: 30px; padding: 0; justify-content: center; font-size: 0; }
}
@media (max-width: 560px) {
  .ability-row { align-items: start; padding-right: 8px; }
  .ability-detail { margin-left: 30px; }
}
</style>
