<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  competencyCategoryLabels,
  competencyLevelLabels,
  type Competency,
} from '@/domain'
import type { IdentityCapabilityNode } from '@/composables/useFutureSelf'
import { levelPercent } from '@/composables/useRoadmap'

defineOptions({ name: 'IdentityCapabilityTree' })

const props = withDefaults(
  defineProps<{
    node: IdentityCapabilityNode
    depth?: number
  }>(),
  { depth: 0 },
)

const emit = defineEmits<{
  viewDirection: [directionId: string]
}>()

const collapsed = ref(false)
const hasChildren = computed(() => props.node.children.length > 0)
const progress = computed(() => levelPercent(props.node.competency.currentLevel))
const target = computed(() => levelPercent(props.node.competency.targetLevel))
const primaryDirection = computed(() => props.node.directions[0] ?? null)
const isGroup = computed(() => !props.node.isDirect && props.node.children.length > 0)

function toggle(): void {
  collapsed.value = !collapsed.value
}

function directionLevel(competency: Competency, directionId: string): string {
  return (
    props.node.assignments.find(
      (assignment) =>
        assignment.competencyId === competency.id && assignment.directionId === directionId,
    )?.requiredLevel ?? ''
  )
}
</script>

<template>
  <li class="capability-node" :class="{ 'is-group': isGroup }" :data-depth="depth">
    <div class="capability-row">
      <button
        v-if="hasChildren"
        type="button"
        class="tree-toggle"
        :class="{ collapsed }"
        :aria-label="collapsed ? '展开子能力' : '收起子能力'"
        @click="toggle"
      >
        <AppIcon name="arrow-right" :size="14" />
      </button>
      <span v-else class="tree-toggle-placeholder" aria-hidden="true">
        <span class="leaf-dot" />
      </span>

      <div class="capability-card">
        <div class="capability-head">
          <div class="capability-name-wrap">
            <span class="capability-kicker">
              {{ isGroup ? '能力分支' : depth === 0 ? '核心能力' : '子能力' }}
            </span>
            <span class="capability-name">{{ node.competency.name }}</span>
          </div>
          <div class="capability-badges">
            <span class="category-badge">
              {{ competencyCategoryLabels[node.competency.category] }}
            </span>
            <span v-if="node.isDirect" class="linked-badge">已接入路线</span>
          </div>
        </div>

        <p v-if="node.competency.description" class="capability-desc">
          {{ node.competency.description }}
        </p>

        <div class="capability-progress">
          <div class="level-caption">
            <span class="level-current">{{ competencyLevelLabels[node.competency.currentLevel] }}</span>
            <span class="level-arrow">→</span>
            <span class="level-target">{{ competencyLevelLabels[node.competency.targetLevel] }}</span>
          </div>
          <div
            class="level-track"
            :title="`当前 ${Math.round(progress)}% / 目标 ${Math.round(target)}%`"
          >
            <span class="level-fill" :style="{ width: `${progress}%` }" />
            <span class="level-target-mark" :style="{ left: `${target}%` }" />
          </div>
        </div>

        <div v-if="node.directions.length" class="capability-links">
          <span class="links-label">所属发展方向</span>
          <button
            v-for="direction in node.directions"
            :key="direction.id"
            type="button"
            class="direction-link"
            :style="{ '--direction-color': direction.color }"
            @click.stop="emit('viewDirection', direction.id)"
          >
            <span class="direction-dot" />
            <span>{{ direction.name }}</span>
            <span v-if="directionLevel(node.competency, direction.id)" class="required-level">
              要求 {{ directionLevel(node.competency, direction.id) }}
            </span>
          </button>
        </div>

        <div class="capability-foot">
          <span class="capability-meta">
            <AppIcon name="flag" :size="13" />
            {{ node.milestoneCount }} 个相关里程碑
          </span>
          <button
            v-if="primaryDirection"
            type="button"
            class="roadmap-link"
            @click.stop="emit('viewDirection', primaryDirection.id)"
          >
            在发展路线中查看
            <AppIcon name="arrow-right" :size="13" />
          </button>
          <span v-else class="branch-note">能力分支由下方子能力共同完成</span>
        </div>
      </div>
    </div>

    <ul v-if="hasChildren && !collapsed" class="capability-children">
      <IdentityCapabilityTree
        v-for="child in node.children"
        :key="child.competency.id"
        :node="child"
        :depth="depth + 1"
        @view-direction="emit('viewDirection', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.capability-node {
  position: relative;
}

.capability-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tree-toggle,
.tree-toggle-placeholder {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  margin-top: 14px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-faint);
}

.tree-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tree-toggle .icon {
  transform: rotate(90deg);
  transition: transform 0.18s var(--ease-out);
}

.tree-toggle.collapsed .icon {
  transform: rotate(0deg);
}

.tree-toggle-placeholder {
  border-color: var(--line-faint);
}

.leaf-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-faint);
}

.capability-card {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 15px 17px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.capability-card:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  box-shadow: var(--shadow-sm);
}

.capability-node[data-depth='0'] > .capability-row > .capability-card {
  padding: 18px 20px;
  border-color: color-mix(in srgb, var(--accent) 24%, var(--line));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, transparent), transparent 48%),
    var(--surface);
}

.capability-node.is-group > .capability-row > .capability-card {
  border-style: dashed;
  background: color-mix(in srgb, var(--surface-muted) 72%, var(--surface));
}

.capability-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.capability-name-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.capability-kicker {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.capability-name {
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.45;
}

.capability-node[data-depth='0'] > .capability-row .capability-name {
  font-family: var(--font-serif);
  font-size: 18px;
}

.capability-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  flex: none;
}

.category-badge,
.linked-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  white-space: nowrap;
}

.category-badge {
  background: var(--surface-muted);
  color: var(--ink-faint);
  border: 1px solid var(--line-faint);
}

.linked-badge {
  background: var(--success-soft);
  color: var(--success);
}

.capability-desc {
  max-width: 820px;
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 13px;
  line-height: 1.65;
}

.capability-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.level-caption {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: none;
  color: var(--muted);
  font-size: 12px;
}

.level-current strong {
  color: var(--ink-soft);
}

.level-arrow {
  color: var(--line-strong);
}

.level-target {
  color: var(--amber);
}

.level-track {
  position: relative;
  width: min(280px, 44%);
  height: 7px;
  overflow: visible;
  border-radius: var(--radius-pill);
  background: var(--bg-deep);
}

.level-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--violet)));
}

.level-target-mark {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 13px;
  border-radius: 2px;
  background: var(--amber);
  transform: translateX(-50%);
}

.capability-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.links-label {
  margin-right: 2px;
  color: var(--muted);
  font-size: 11.5px;
}

.direction-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 3px 9px;
  border: 1px solid color-mix(in srgb, var(--direction-color) 22%, var(--line));
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--direction-color) 7%, var(--surface));
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.35;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.direction-link:hover {
  border-color: var(--direction-color);
  background: color-mix(in srgb, var(--direction-color) 12%, var(--surface));
}

.direction-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--direction-color);
}

.required-level {
  color: var(--direction-color);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.capability-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line-faint);
}

.capability-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
}

.roadmap-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.roadmap-link:hover {
  color: var(--accent-hover);
}

.branch-note {
  color: var(--muted);
  font-size: 11.5px;
}

.capability-children {
  position: relative;
  margin: 10px 0 0 28px;
  padding-left: 24px;
}

.capability-children::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 22px;
  left: 0;
  width: 1px;
  background: linear-gradient(var(--line-strong), var(--line-faint));
}

.capability-children > .capability-node {
  margin-top: 10px;
}

.capability-children > .capability-node::before {
  content: '';
  position: absolute;
  top: 28px;
  left: -24px;
  width: 24px;
  border-top: 1px solid var(--line-strong);
}

@media (max-width: 900px) {
  .capability-progress {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .level-track {
    width: 100%;
    max-width: 360px;
  }
}

@media (max-width: 620px) {
  .capability-head,
  .capability-foot {
    align-items: flex-start;
    flex-direction: column;
  }

  .capability-badges {
    justify-content: flex-start;
  }

  .capability-children {
    margin-left: 13px;
    padding-left: 15px;
  }

  .capability-children > .capability-node::before {
    left: -15px;
    width: 15px;
  }

  .tree-toggle,
  .tree-toggle-placeholder {
    width: 24px;
    height: 24px;
  }

  .capability-card {
    padding: 13px 14px;
  }
}
</style>
