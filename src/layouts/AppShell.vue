<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import GlobalCommandPalette from '@/components/GlobalCommandPalette.vue'

const SIDEBAR_STORAGE_KEY = 'growth-os.sidebar-hidden'
const SCALE_STORAGE_KEY = 'growth-os.ui-scale'
const SCALE_OPTIONS = [1, 1.15, 1.3] as const
type UiScale = (typeof SCALE_OPTIONS)[number]

const sidebarOpen = ref(false)
const sidebarHidden = ref(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
const commandOpen = ref(false)
const storedScale = Number(localStorage.getItem(SCALE_STORAGE_KEY))
const uiScale = ref<UiScale>(
  SCALE_OPTIONS.includes(storedScale as UiScale) ? (storedScale as UiScale) : 1.15,
)
const scalePercent = ref(Math.round(uiScale.value * 100))
const route = useRoute()

function closeSidebar(): void {
  sidebarOpen.value = false
}

function toggleSidebar(): void {
  if (window.matchMedia('(max-width: 980px)').matches) {
    sidebarOpen.value = !sidebarOpen.value
    return
  }

  sidebarHidden.value = !sidebarHidden.value
}

function applyUiScale(scale: UiScale): void {
  document.documentElement.style.setProperty('--ui-scale', String(scale))
  scalePercent.value = Math.round(scale * 100)
}

function cycleUiScale(): void {
  const currentIndex = SCALE_OPTIONS.indexOf(uiScale.value)
  uiScale.value = SCALE_OPTIONS[(currentIndex + 1) % SCALE_OPTIONS.length]
  applyUiScale(uiScale.value)
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
    element.isContentEditable
  )
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    toggleSidebar()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    commandOpen.value = true
    return
  }
  if (event.key === 'Escape' && commandOpen.value) {
    commandOpen.value = false
    return
  }
  if (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === 's' &&
    !isTypingTarget(event.target)
  ) {
    event.preventDefault()
    commandOpen.value = true
  }
}

onMounted(() => {
  applyUiScale(uiScale.value)
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

watch(sidebarHidden, (hidden) => {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(hidden))
})

watch(uiScale, (scale) => {
  localStorage.setItem(SCALE_STORAGE_KEY, String(scale))
})

defineExpose({ route })
</script>

<template>
  <div class="shell" :class="{ 'sidebar-hidden': sidebarHidden }">
    <AppSidebar :open="sidebarOpen" :hidden="sidebarHidden" @close="closeSidebar" />

    <div
      v-if="sidebarOpen"
      class="shell-overlay"
      aria-hidden="true"
      @click="closeSidebar"
    />

    <div class="shell-main">
      <AppTopbar
        :scale-percent="scalePercent"
        @toggle-sidebar="toggleSidebar"
        @cycle-scale="cycleUiScale"
        @open-search="commandOpen = true"
      />
      <main class="shell-content">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
      <footer class="shell-footer">
        <span class="footer-dot" />
        本地优先 · 数据保存在此浏览器 IndexedDB · 请定期导出备份
      </footer>
    </div>

    <GlobalCommandPalette :open="commandOpen" @close="commandOpen = false" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--bg);
}

.shell-main {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  transition: margin-left 0.26s var(--ease-out);
}

.shell.sidebar-hidden .shell-main {
  margin-left: 0;
}

.shell-content {
  flex: 1;
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 28px 38px 0;
}

.shell-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 22px 24px 26px;
  color: var(--ink-faint);
  font-size: 11.5px;
}

.footer-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.6;
}

.shell-overlay {
  display: none;
}

@media (max-width: 980px) {
  .shell-main {
    margin-left: 0;
  }

  .shell-content {
    padding: 20px 20px 0;
  }

  .shell-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 45;
    background: rgba(29, 36, 32, 0.4);
    backdrop-filter: blur(3px);
  }
}
</style>
