<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'
import { DATABASE_NAME } from '@/data'

defineProps<{ open: boolean; hidden: boolean }>()
const emit = defineEmits<{ close: [] }>()

const route = useRoute()

interface NavItem {
  to: string
  label: string
  en: string
  icon: IconName
  phase: number
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: '工作台',
    items: [{ to: '/', label: '今日概览', en: 'Dashboard', icon: 'dashboard', phase: 1 }],
  },
  {
    label: '方向与路线',
    items: [
      { to: '/future-self', label: '未来自我', en: 'Future Self', icon: 'compass', phase: 0 },
      { to: '/roadmap', label: '发展路线', en: 'Roadmap', icon: 'map', phase: 0 },
    ],
  },
  {
    label: '执行与学习',
    items: [
      { to: '/goals', label: '目标与任务', en: 'Goals & Tasks', icon: 'target', phase: 0 },
      { to: '/learning', label: '学习系统', en: 'Learning', icon: 'book', phase: 0 },
      { to: '/habits', label: '行为习惯', en: 'Habits', icon: 'repeat', phase: 0 },
    ],
  },
  {
    label: '成长闭环',
    items: [
      { to: '/review', label: '复盘与洞察', en: 'Review', icon: 'refresh', phase: 0 },
      { to: '/settings', label: '设置与数据', en: 'Settings', icon: 'sliders', phase: 1 },
    ],
  },
]

const isActive = computed(() => (path: string) => route.path === path)
</script>

<template>
  <aside class="sidebar" :class="{ open, hidden: hidden && !open }">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <span class="brand-orbit" />
        <span class="brand-core" />
      </div>
      <div class="brand-text">
        <span class="brand-name">Growth OS</span>
        <span class="brand-sub">个人成长与学习系统</span>
      </div>
      <button class="icon-btn brand-close" aria-label="关闭导航" @click="emit('close')">
        <AppIcon name="close" :size="16" />
      </button>
    </div>

    <nav class="nav">
      <div v-for="section in sections" :key="section.label" class="nav-section">
        <p class="nav-label">{{ section.label }}</p>
        <RouterLink
          v-for="item in section.items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: isActive(item.to) }"
          @click="emit('close')"
        >
          <span class="nav-icon"><AppIcon :name="item.icon" :size="17" /></span>
          <span class="nav-copy">
            <span class="nav-title">{{ item.label }}</span>
            <span class="nav-en">{{ item.en }}</span>
          </span>
          <span v-if="item.phase > 1" class="nav-phase">S{{ item.phase }}</span>
        </RouterLink>
      </div>
    </nav>

    <div class="sidebar-foot">
      <div class="storage-card">
        <div class="storage-row">
          <AppIcon name="database" :size="15" />
          <span class="storage-title">本地数据</span>
          <span class="storage-dot" />
        </div>
        <p class="storage-meta">IndexedDB · {{ DATABASE_NAME }}</p>
        <p class="storage-note">第一版仅存本机，后续可切换服务器 Repository。</p>
      </div>
      <p class="version">v0.6 · 个人成长与学习系统</p>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 50;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 22px 16px 18px;
  overflow-y: auto;
  transition: transform 0.26s var(--ease-out);
}

.sidebar.hidden {
  transform: translateX(-100%);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 2px 6px 22px;
}

.brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 11px;
  background: var(--accent);
  box-shadow: 0 8px 20px -12px color-mix(in srgb, var(--accent) 90%, transparent);
}

.brand-orbit {
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(247, 251, 247, 0.55);
  border-radius: 50%;
}

.brand-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--on-accent);
  transform: translate(-50%, -50%);
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.2;
}

.brand-sub {
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.03em;
}

.brand-close {
  display: none;
  margin-left: auto;
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-label {
  padding: 0 10px 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  text-decoration: none;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.nav-item:hover {
  background: var(--surface-muted);
  color: var(--ink);
  text-decoration: none;
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  transform: translateY(-50%);
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--ink-faint);
}

.nav-item.active .nav-icon {
  color: var(--accent);
}

.nav-copy {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.nav-title {
  font-size: 14px;
  font-weight: 550;
  white-space: nowrap;
}

.nav-en {
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-phase {
  margin-left: auto;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.4;
}

.sidebar-foot {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.storage-card {
  padding: 12px 12px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.storage-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-soft);
}

.storage-title {
  font-size: 12.5px;
  font-weight: 600;
}

.storage-dot {
  width: 5px;
  height: 5px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--accent);
}

.storage-meta {
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
  word-break: break-all;
}

.storage-note {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--muted);
}

.version {
  padding: 0 4px;
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.02em;
}

@media (max-width: 980px) {
  .sidebar {
    transform: translateX(-100%);
    box-shadow: var(--shadow-lg);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .brand-close {
    display: inline-flex;
  }
}
</style>
