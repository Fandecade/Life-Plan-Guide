<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import ReminderPanel from './ReminderPanel.vue'
import QuickCreateMenu from './QuickCreateMenu.vue'
import TodayScheduleDrawer from './TodayScheduleDrawer.vue'
import { useReminders } from '@/composables/useReminders'

defineProps<{ scalePercent: number }>()

const emit = defineEmits<{
  toggleSidebar: []
  cycleScale: []
  openSearch: []
}>()

const route = useRoute()
const router = useRouter()
const { items, notifications, refresh } = useReminders()

const reminderOpen = ref(false)
const quickOpen = ref(false)
const calendarOpen = ref(false)

const title = computed(() => route.meta.title ?? '今日概览')
const section = computed(() => route.meta.section ?? '工作台')
const reminderCount = computed(() => items.value.length + notifications.value.length)

const dateLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date()),
)

function toggleReminders(): void {
  reminderOpen.value = !reminderOpen.value
  if (reminderOpen.value) void refresh()
}

function goReminder(route: string): void {
  reminderOpen.value = false
  void router.push(route)
}

function openSettings(): void {
  void router.push('/settings')
}

watch(
  () => route.path,
  () => {
    if (reminderOpen.value) void refresh()
  },
)

onMounted(() => {
  void refresh()
})
</script>

<template>
  <header class="topbar">
    <button
      class="icon-btn menu-btn"
      aria-label="显示或隐藏侧边栏"
      title="显示 / 隐藏侧边栏（Ctrl/⌘ B）"
      @click="emit('toggleSidebar')"
    >
      <AppIcon name="menu" :size="19" />
    </button>

    <div class="topbar-title">
      <span class="topbar-section">{{ section }}</span>
      <h1 class="topbar-name">{{ title }}</h1>
    </div>

    <div class="topbar-actions">
      <span class="topbar-date">{{ dateLabel }}</span>
      <button
        class="scale-trigger"
        :aria-label="`界面字号 ${scalePercent}%，点击切换`"
        :title="`界面字号：${scalePercent}%（点击切换）`"
        @click="emit('cycleScale')"
      >
        <span class="scale-glyph" aria-hidden="true">Aa</span>
        <span>{{ scalePercent }}%</span>
      </button>
      <button class="search-trigger" @click="emit('openSearch')">
        <AppIcon name="search" :size="15" />
        <span class="search-text">搜索愿景、目标、任务、知识点</span>
        <span class="kbd">⌘ K</span>
      </button>
      <span class="local-badge">
        <span class="local-dot" />
        本地保存
      </span>
      <button class="icon-btn" aria-label="今日日历" title="今日日历" @click="calendarOpen = true">
        <AppIcon name="calendar" :size="17" />
      </button>
      <button class="icon-btn" aria-label="快速创建" title="快速创建" @click="quickOpen = true">
        <AppIcon name="plus" :size="17" />
      </button>
      <button class="icon-btn bell-btn" aria-label="提醒中心" title="提醒中心" @click="toggleReminders">
        <AppIcon name="bell" :size="17" />
        <span v-if="reminderCount > 0" class="bell-badge">
          {{ reminderCount > 9 ? '9+' : reminderCount }}
        </span>
      </button>
      <button class="icon-btn settings-btn" aria-label="打开设置" title="设置与数据" @click="openSettings">
        <AppIcon name="settings" :size="17" />
      </button>
    </div>
  </header>

  <ReminderPanel
    :open="reminderOpen"
    :items="items"
    :notifications="notifications"
    @close="reminderOpen = false"
    @navigate="goReminder"
  />

  <QuickCreateMenu :open="quickOpen" @close="quickOpen = false" />
  <TodayScheduleDrawer :open="calendarOpen" @close="calendarOpen = false" />
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  container-name: topbar;
  container-type: inline-size;
  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--topbar-height);
  padding: 0 38px;
  background: var(--topbar-bg);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}

.topbar-title {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.topbar-section {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.topbar-name {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex: none;
  gap: 12px;
}

.topbar-date {
  color: var(--ink-faint);
  font-size: 12.5px;
  white-space: nowrap;
}

.scale-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ink-faint);
  font-size: 11.5px;
  white-space: nowrap;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.scale-trigger:hover {
  border-color: var(--line-strong);
  background: var(--surface);
  color: var(--ink-soft);
}

.scale-glyph {
  font-family: var(--font-serif);
  font-size: 13.5px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 9px 0 11px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 12.5px;
  transition:
    border-color 0.16s ease,
    color 0.16s ease;
}

.search-trigger:hover {
  border-color: var(--ink-faint);
  color: var(--ink-soft);
}

.search-text {
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-pill);
  background: var(--accent-faint);
  color: var(--accent-ink);
  font-size: 11.5px;
  font-weight: 550;
  white-space: nowrap;
}

.local-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.bell-btn {
  position: relative;
}

.bell-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border: 1.5px solid var(--bg);
  border-radius: var(--radius-pill);
  background: var(--danger);
  color: var(--on-danger);
  font-family: var(--font-mono);
  font-size: 7.5px;
  line-height: 1;
}

@container topbar (max-width: 960px) {
  .topbar-date,
  .search-text,
  .search-trigger .kbd {
    display: none;
  }

  .search-trigger {
    width: 34px;
    justify-content: center;
    padding: 0;
  }
}

@media (max-width: 1150px) {
  .topbar-date {
    display: none;
  }

  .search-text {
    max-width: 130px;
  }
}

@media (max-width: 980px) {
  .topbar {
    padding: 0 20px;
  }
}

@media (max-width: 520px) {
  .settings-btn {
    display: none;
  }

  .scale-trigger {
    display: none;
  }
}

@media (max-width: 760px) {
  .search-trigger {
    display: none;
  }

  .local-badge {
    display: none;
  }
}
</style>
