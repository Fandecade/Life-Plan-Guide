<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    width?: number
  }>(),
  { subtitle: '', width: 420 },
)

const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-layer" @click.self="emit('close')">
        <aside
          class="drawer-panel"
          :style="{ width: `min(${width}px, calc(100vw - 24px))` }"
          role="dialog"
          aria-modal="true"
        >
          <header class="drawer-head">
            <div>
              <h2 class="drawer-title">{{ title }}</h2>
              <p v-if="subtitle" class="drawer-subtitle">{{ subtitle }}</p>
            </div>
            <button class="icon-btn" aria-label="关闭抽屉" @click="emit('close')">
              <AppIcon name="close" :size="16" />
            </button>
          </header>
          <div class="drawer-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="drawer-foot">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 78;
  display: flex;
  justify-content: flex-end;
  background: rgba(29, 36, 32, 0.34);
  backdrop-filter: blur(3px);
}

.drawer-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 22px 22px 14px;
  border-bottom: 1px solid var(--line-faint);
}

.drawer-title {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.4;
}

.drawer-subtitle {
  margin-top: 3px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.6;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.drawer-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 13px 22px;
  border-top: 1px solid var(--line-faint);
  background: var(--surface-muted);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.18s ease;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.26s var(--ease-out);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(24px);
}

@media (max-width: 620px) {
  .drawer-panel {
    width: 100% !important;
  }
}
</style>