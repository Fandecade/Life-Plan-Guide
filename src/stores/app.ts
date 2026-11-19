import { defineStore } from 'pinia'
import { ref } from 'vue'
import { initDataLayer } from '@/data'

export const useAppStore = defineStore('app', () => {
  const initialized = ref(false)
  const initializing = ref(false)
  const initError = ref<string | null>(null)
  const lastOpenedAt = ref<string | null>(null)
  const sidebarOpen = ref(false)

  async function initialize(): Promise<void> {
    if (initialized.value || initializing.value) return
    initializing.value = true
    initError.value = null
    try {
      await initDataLayer()
      initialized.value = true
      lastOpenedAt.value = new Date().toISOString()
    } catch (error) {
      initError.value = error instanceof Error ? error.message : String(error)
    } finally {
      initializing.value = false
    }
  }

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar(): void {
    sidebarOpen.value = false
  }

  return {
    initialized,
    initializing,
    initError,
    lastOpenedAt,
    sidebarOpen,
    initialize,
    toggleSidebar,
    closeSidebar,
  }
})