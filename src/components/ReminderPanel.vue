<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { Notification } from '@/domain'
import type { ReminderItem } from '@/composables/useReminders'

defineProps<{
  open: boolean
  items: ReminderItem[]
  notifications: Notification[]
}>()

const emit = defineEmits<{
  close: []
  navigate: [route: string]
}>()

function notificationRoute(type: string): string {
  const routes: Record<string, string> = {
    TASK: '/goals',
    REVIEW: '/learning',
    HABIT: '/habits',
    MILESTONE: '/roadmap',
    SYSTEM: '/settings',
  }
  return routes[type] ?? '/review'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="reminder">
      <div v-if="open" class="reminder-layer" @click.self="emit('close')">
        <aside class="reminder-panel" role="dialog" aria-label="提醒中心">
          <header class="reminder-head">
            <div>
              <p class="reminder-eyebrow">Reminders</p>
              <h3>提醒中心</h3>
            </div>
            <button class="icon-btn" aria-label="关闭提醒" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <div class="reminder-body">
            <section v-if="items.length" class="reminder-section">
              <p class="section-label">今日提醒</p>
              <button
                v-for="item in items"
                :key="item.id"
                class="reminder-item"
                @click="emit('navigate', item.route)"
              >
                <span class="reminder-icon" :class="`tone-${item.tone}`">
                  <AppIcon :name="item.icon" :size="15" />
                </span>
                <span class="reminder-copy">
                  <span class="reminder-title">{{ item.title }}</span>
                  <span class="reminder-desc">{{ item.description }}</span>
                </span>
                <AppIcon name="arrow-right" :size="13" class="reminder-arrow" />
              </button>
            </section>

            <section v-if="notifications.length" class="reminder-section">
              <p class="section-label">通知</p>
              <button
                v-for="notification in notifications"
                :key="notification.id"
                class="reminder-item"
                @click="emit('navigate', notificationRoute(notification.notificationType))"
              >
                <span class="reminder-icon tone-accent">
                  <AppIcon name="bell" :size="15" />
                </span>
                <span class="reminder-copy">
                  <span class="reminder-title">{{ notification.title }}</span>
                  <span class="reminder-desc">{{ notification.content }}</span>
                </span>
                <AppIcon name="arrow-right" :size="13" class="reminder-arrow" />
              </button>
            </section>

            <div v-if="!items.length && !notifications.length" class="reminder-empty">
              <span class="empty-icon"><AppIcon name="check" :size="20" /></span>
              <p>今天没有紧急提醒。</p>
              <span>可以按自己的节奏推进，或开始一次学习会话。</span>
            </div>
          </div>

          <footer class="reminder-foot">
            <RouterLink to="/settings" class="reminder-settings" @click="emit('close')">
              <AppIcon name="sliders" :size="13" />
              数据与备份
            </RouterLink>
            <span>本地计算 · 不会发送系统通知</span>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.reminder-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  padding: 72px 24px 24px;
}

.reminder-panel {
  width: min(380px, 100%);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.reminder-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 11px;
  border-bottom: 1px solid var(--line-faint);
}

.reminder-eyebrow {
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.reminder-head h3 {
  margin-top: 2px;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}

.reminder-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 14px;
}

.reminder-section + .reminder-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-faint);
}

.section-label {
  padding: 4px 4px 5px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.reminder-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 9px 7px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.reminder-item:hover {
  background: var(--surface-muted);
}

.reminder-icon {
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

.tone-amber {
  background: var(--amber-soft);
  color: var(--amber);
}

.tone-blue {
  background: var(--blue-soft);
  color: var(--blue);
}

.tone-danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.reminder-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.reminder-title {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.5;
}

.reminder-desc {
  font-size: 9.5px;
  line-height: 1.55;
  color: var(--muted);
}

.reminder-arrow {
  flex: none;
  margin-top: 6px;
  color: var(--line-strong);
}

.reminder-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.reminder-empty p {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}

.reminder-empty span {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.6;
}

.reminder-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-top: 1px solid var(--line-faint);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 8.5px;
}

.reminder-settings {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-faint);
  font-size: 9.5px;
  text-decoration: none;
}

.reminder-settings:hover {
  color: var(--accent);
}

.reminder-enter-active,
.reminder-leave-active {
  transition: opacity 0.16s ease;
}

.reminder-enter-active .reminder-panel,
.reminder-leave-active .reminder-panel {
  transition:
    transform 0.2s var(--ease-out),
    opacity 0.16s ease;
}

.reminder-enter-from,
.reminder-leave-to {
  opacity: 0;
}

.reminder-enter-from .reminder-panel,
.reminder-leave-to .reminder-panel {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 620px) {
  .reminder-layer {
    padding: 64px 12px 12px;
  }
}
</style>