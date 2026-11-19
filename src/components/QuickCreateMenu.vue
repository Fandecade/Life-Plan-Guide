<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()

interface QuickItem {
  title: string
  description: string
  route: string
  icon: IconName
}

const items: QuickItem[] = [
  {
    title: '新建任务',
    description: '目标与任务 · 快速记录一件可执行的事',
    route: '/goals?create=task',
    icon: 'layers',
  },
  {
    title: '新建目标',
    description: '目标与任务 · 从成果或能力出发',
    route: '/goals?create=goal',
    icon: 'target',
  },
  {
    title: '新建习惯',
    description: '行为与习惯 · 打开 B=MAP 配方',
    route: '/habits?create=habit',
    icon: 'repeat',
  },
  {
    title: '每日复盘',
    description: '复盘与洞察 · 5–10 分钟完成检查',
    route: '/review?create=daily',
    icon: 'check',
  },
  {
    title: '新建知识点',
    description: '学习系统 · 保留值得复习的内容',
    route: '/learning?create=knowledge',
    icon: 'bulb',
  },
  {
    title: '新建愿景',
    description: '未来自我 · 写下长期方向',
    route: '/future-self?create=vision',
    icon: 'compass',
  },
]

function select(item: QuickItem): void {
  emit('close')
  void router.push(item.route)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="quick">
      <div v-if="open" class="quick-layer" @click.self="emit('close')">
        <aside class="quick-panel" role="dialog" aria-label="快速创建">
          <header class="quick-head">
            <div>
              <p class="quick-eyebrow">Quick create</p>
              <h3>快速创建</h3>
            </div>
            <button class="icon-btn" aria-label="关闭快速创建" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>
          <div class="quick-list">
            <button
              v-for="item in items"
              :key="item.title"
              class="quick-item"
              @click="select(item)"
            >
              <span class="quick-icon"><AppIcon :name="item.icon" :size="15" /></span>
              <span class="quick-copy">
                <span class="quick-title">{{ item.title }}</span>
                <span class="quick-desc">{{ item.description }}</span>
              </span>
              <AppIcon name="arrow-right" :size="13" class="quick-arrow" />
            </button>
          </div>
          <footer class="quick-foot">
            创建表单会自动打开，不需要先进入模块再找按钮。
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quick-layer {
  position: fixed;
  inset: 0;
  z-index: 69;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 72px 24px 24px;
}

.quick-panel {
  width: min(340px, 100%);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.quick-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 11px;
  border-bottom: 1px solid var(--line-faint);
}

.quick-eyebrow {
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.quick-head h3 {
  margin-top: 2px;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}

.quick-list {
  padding: 6px;
}

.quick-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.quick-item:hover {
  background: var(--surface-muted);
}

.quick-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent);
}

.quick-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.quick-title {
  font-size: 11.5px;
  font-weight: 600;
}

.quick-desc {
  color: var(--muted);
  font-size: 9.5px;
  line-height: 1.5;
}

.quick-arrow {
  flex: none;
  margin-top: 6px;
  color: var(--line-strong);
}

.quick-foot {
  padding: 9px 14px;
  border-top: 1px solid var(--line-faint);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.55;
}

.quick-enter-active,
.quick-leave-active {
  transition: opacity 0.16s ease;
}

.quick-enter-active .quick-panel,
.quick-leave-active .quick-panel {
  transition:
    transform 0.2s var(--ease-out),
    opacity 0.16s ease;
}

.quick-enter-from,
.quick-leave-to {
  opacity: 0;
}

.quick-enter-from .quick-panel,
.quick-leave-to .quick-panel {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 620px) {
  .quick-layer {
    padding: 64px 12px 12px;
  }
}
</style>