<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  TaskStatus,
  priorityLabels,
  taskStatusLabels,
  taskTypeLabels,
  type Task,
} from '@/domain'
import { formatDuration, formatShortDate, relativeDay } from '@/utils/date'
import type { TaskNode } from '@/composables/useGoalsTasks'

defineOptions({ name: 'TaskTreeNode' })

const props = defineProps<{
  node: TaskNode
  goalTitles: Record<string, string[]>
  predecessorTitles: Record<string, string[]>
  timeboxCounts: Record<string, number>
  reviewAtByTask: Record<string, string>
}>()

const emit = defineEmits<{
  edit: [task: Task]
  addChild: [task: Task]
  toggleStatus: [task: Task]
  toggleArchive: [task: Task]
  editTimebox: [task: Task]
  editDependencies: [task: Task]
  openDetail: [task: Task]
}>()

const collapsed = ref(false)
const hasChildren = computed(() => props.node.children.length > 0)
const isDone = computed(() => props.node.task.status === TaskStatus.COMPLETED)
const isCancelled = computed(() => props.node.task.status === TaskStatus.CANCELLED)
const goalNames = computed(() => props.goalTitles[props.node.task.id] ?? [])
const predecessorNames = computed(
  () => props.predecessorTitles[props.node.task.id] ?? [],
)
const timeboxCount = computed(() => props.timeboxCounts[props.node.task.id] ?? 0)
const reviewAt = computed(() => props.reviewAtByTask[props.node.task.id] ?? null)
const overdue = computed(() => {
  if (isDone.value || isCancelled.value || !props.node.task.dueDate) return false
  return new Date(props.node.task.dueDate).getTime() < Date.now()
})
</script>

<template>
  <li class="task-tree-node">
    <div class="task-row" :class="{ done: isDone, cancelled: isCancelled }">
      <button
        v-if="hasChildren"
        class="expand-btn"
        :class="{ collapsed }"
        :aria-label="collapsed ? '展开子任务' : '收起子任务'"
        @click="collapsed = !collapsed"
      >
        <AppIcon name="arrow-right" :size="13" />
      </button>
      <span v-else class="expand-placeholder" />

      <button
        class="task-check"
        :class="{ checked: isDone }"
        :aria-label="isDone ? '标记为未完成' : '完成任务'"
        @click="emit('toggleStatus', node.task)"
      >
        <AppIcon v-if="isDone" name="check" :size="11" />
      </button>

      <div
        class="task-main"
        role="button"
        tabindex="0"
        @click="emit('openDetail', node.task)"
        @keydown.enter="emit('openDetail', node.task)"
      >
        <div class="task-title-line">
          <span class="task-title">{{ node.task.title }}</span>
          <span class="badge">{{ taskTypeLabels[node.task.taskType] }}</span>
          <span class="badge" :class="`status-${node.task.status.toLowerCase()}`">
            {{ taskStatusLabels[node.task.status] }}
          </span>
          <span v-if="reviewAt" class="badge badge-amber">复习 {{ formatShortDate(reviewAt) }}</span>
          <span
            v-if="node.task.priority === 'URGENT' || node.task.priority === 'HIGH'"
            class="badge badge-amber"
          >
            {{ priorityLabels[node.task.priority] }}
          </span>
          <span v-if="node.task.archivedAt" class="badge">已归档</span>
        </div>

        <div class="task-meta">
          <span v-if="node.task.dueDate" :class="{ 'meta-overdue': overdue }">
            <AppIcon name="calendar" :size="11" />
            {{ relativeDay(node.task.dueDate) }}
          </span>
          <span>
            <AppIcon name="clock" :size="11" />
            {{ formatDuration(node.task.estimatedDuration) }}
          </span>
          <span v-if="node.task.actualDuration > 0" class="meta-done">
            实际 {{ formatDuration(node.task.actualDuration) }}
          </span>
          <span v-if="timeboxCount > 0" class="meta-chip">
            <AppIcon name="calendar" :size="11" />
            {{ timeboxCount }} 个时间盒
          </span>
          <span v-if="predecessorNames.length" class="meta-chip" title="前置任务">
            <AppIcon name="arrow-right" :size="11" />
            {{ predecessorNames.length }} 个前置
          </span>
          <span v-if="hasChildren" class="meta-chip">{{ node.children.length }} 个子任务</span>
        </div>

        <div v-if="goalNames.length" class="task-goals">
          <span v-for="name in goalNames" :key="name" class="goal-tag">
            <AppIcon name="target" :size="10" />
            {{ name }}
          </span>
        </div>
      </div>

      <div class="task-actions">
        <button
          v-if="!node.task.archivedAt"
          class="icon-btn"
          title="添加子任务"
          aria-label="添加子任务"
          @click="emit('addChild', node.task)"
        >
          <AppIcon name="plus" :size="14" />
        </button>
        <button
          v-if="!node.task.archivedAt"
          class="icon-btn"
          title="时间盒"
          aria-label="管理时间盒"
          @click="emit('editTimebox', node.task)"
        >
          <AppIcon name="clock" :size="14" />
        </button>
        <button
          v-if="!node.task.archivedAt"
          class="icon-btn"
          title="任务依赖"
          aria-label="编辑任务依赖"
          @click="emit('editDependencies', node.task)"
        >
          <AppIcon name="layers" :size="14" />
        </button>
        <button
          v-if="!node.task.archivedAt"
          class="icon-btn"
          title="编辑任务"
          aria-label="编辑任务"
          @click="emit('edit', node.task)"
        >
          <AppIcon name="sliders" :size="14" />
        </button>
        <button
          class="icon-btn"
          :title="node.task.archivedAt ? '恢复任务' : '归档任务'"
          :aria-label="node.task.archivedAt ? '恢复任务' : '归档任务'"
          @click="emit('toggleArchive', node.task)"
        >
          <AppIcon :name="node.task.archivedAt ? 'archive' : 'trash'" :size="14" />
        </button>
      </div>
    </div>

    <ul v-if="hasChildren && !collapsed" class="task-children">
      <TaskTreeNode
        v-for="child in node.children"
        :key="child.task.id"
        :node="child"
        :goal-titles="goalTitles"
        :predecessor-titles="predecessorTitles"
        :timebox-counts="timeboxCounts"
        :review-at-by-task="reviewAtByTask"
        @edit="emit('edit', $event)"
        @add-child="emit('addChild', $event)"
        @toggle-status="emit('toggleStatus', $event)"
        @toggle-archive="emit('toggleArchive', $event)"
        @edit-timebox="emit('editTimebox', $event)"
        @edit-dependencies="emit('editDependencies', $event)"
        @open-detail="emit('openDetail', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.task-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 8px 11px 0;
  border-top: 1px solid var(--line-faint);
}

.task-tree-node:first-child > .task-row {
  border-top: none;
}

.task-row.done {
  opacity: 0.62;
}

.task-row.done .task-title {
  text-decoration: line-through;
  color: var(--muted);
}

.task-row.cancelled {
  opacity: 0.5;
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

.task-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  margin-top: 3px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  color: transparent;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.task-check:hover {
  border-color: var(--accent);
}

.task-check.checked {
  background: var(--success);
  border-color: var(--success);
  color: var(--on-accent);
}

.task-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.task-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.task-title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
}

.status-in_progress {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.status-blocked {
  background: var(--danger-soft);
  color: var(--danger);
}

.status-paused {
  background: var(--amber-soft);
  color: var(--amber);
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
}

.task-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-overdue {
  color: var(--danger);
}

.meta-done {
  color: var(--accent);
}

.meta-chip {
  padding: 0 5px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-faint);
}

.task-goals {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}

.goal-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9.5px;
  color: var(--accent-ink);
  background: var(--accent-faint);
  border-radius: var(--radius-pill);
  padding: 1px 6px;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex: none;
  opacity: 0.32;
  transition: opacity 0.16s ease;
}

.task-row:hover .task-actions {
  opacity: 1;
}

.task-actions .icon-btn {
  width: 27px;
  height: 27px;
}

.task-children {
  margin-left: 30px;
  padding-left: 12px;
  border-left: 1px dashed var(--line-strong);
}

@media (max-width: 860px) {
  .task-actions {
    opacity: 1;
  }

  .task-children {
    margin-left: 12px;
  }
}
</style>