import { computed, ref } from 'vue'
import { repos } from '@/data'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'growth-os-theme'
const SETTINGS_KEY = 'appearance.theme'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isThemeMode(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

const mode = ref<ThemeMode>(readStoredMode())
const systemDark = ref(false)
let mediaQuery: MediaQueryList | null = null
let listenerAttached = false

function resolveDark(): boolean {
  return mode.value === 'dark' || (mode.value === 'system' && systemDark.value)
}

function applyTheme(): void {
  const dark = resolveDark()
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#10131a' : '#f4f6fa')
}

function handleSystemChange(event: MediaQueryListEvent): void {
  systemDark.value = event.matches
  if (mode.value === 'system') applyTheme()
}

function ensureMediaQuery(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (!mediaQuery) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = mediaQuery.matches
    if (!listenerAttached) {
      mediaQuery.addEventListener('change', handleSystemChange)
      listenerAttached = true
    }
  } else {
    systemDark.value = mediaQuery.matches
  }
}

export function initializeAppearance(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemeMode(stored)) mode.value = stored
  } catch {
    // 忽略存储不可用
  }
  ensureMediaQuery()
  applyTheme()
}

async function persistToDatabase(next: ThemeMode): Promise<void> {
  try {
    const rows = await repos.userSettings.list()
    const existing = rows.find((row) => row.key === SETTINGS_KEY)
    if (existing) {
      await repos.userSettings.update(existing.id, { value: next })
    } else {
      await repos.userSettings.create({
        key: SETTINGS_KEY,
        value: next,
        description: '界面主题：light / dark / system',
      })
    }
  } catch {
    // 数据库尚未初始化时由 localStorage 兜底
  }
}

async function hydrateFromDatabase(): Promise<void> {
  try {
    const rows = await repos.userSettings.list()
    const saved = rows.find((row) => row.key === SETTINGS_KEY)
    if (saved && isThemeMode(saved.value)) {
      mode.value = saved.value
      ensureMediaQuery()
      applyTheme()
      try {
        localStorage.setItem(STORAGE_KEY, saved.value)
      } catch {
        // 忽略
      }
    }
  } catch {
    // 忽略
  }
}

async function setMode(next: ThemeMode): Promise<void> {
  mode.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // 忽略
  }
  ensureMediaQuery()
  applyTheme()
  await persistToDatabase(next)
}

const isDark = computed(() => resolveDark())

const modeLabel = computed(() => {
  if (mode.value === 'light') return '浅色'
  if (mode.value === 'dark') return '深色'
  return '跟随系统'
})

export function useAppearance() {
  return {
    mode,
    isDark,
    modeLabel,
    setMode,
    hydrateFromDatabase,
  }
}