<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useGlobalSearch, type SearchIcon } from '@/composables/useGlobalSearch'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const { query, groups, resultCount, loading, error, loadIndex } = useGlobalSearch()

const searchInput = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)

interface CommandItem {
  id: string
  title: string
  subtitle: string
  route: string
  icon: SearchIcon
  type: 'command'
}

const commands: CommandItem[] = [
  {
    id: 'cmd-dashboard',
    title: '今日概览',
    subtitle: 'Dashboard · 今日任务与成长节奏',
    route: '/',
    icon: 'spark',
    type: 'command',
  },
  {
    id: 'cmd-future',
    title: '未来自我',
    subtitle: '愿景、身份与方向',
    route: '/future-self',
    icon: 'compass',
    type: 'command',
  },
  {
    id: 'cmd-roadmap',
    title: '发展路线图',
    subtitle: '发展方向与能力树',
    route: '/roadmap',
    icon: 'map',
    type: 'command',
  },
  {
    id: 'cmd-goals',
    title: '目标与任务',
    subtitle: '多级目标、任务与时间盒',
    route: '/goals',
    icon: 'target',
    type: 'command',
  },
  {
    id: 'cmd-learning',
    title: '学习系统',
    subtitle: '学习会话、知识点与复习',
    route: '/learning',
    icon: 'book',
    type: 'command',
  },
  {
    id: 'cmd-habits',
    title: '行为与习惯',
    subtitle: '福格配方、打卡与诊断',
    route: '/habits',
    icon: 'repeat',
    type: 'command',
  },
  {
    id: 'cmd-review',
    title: '复盘与洞察',
    subtitle: 'PDCA、5Why 与计划调整',
    route: '/review',
    icon: 'refresh',
    type: 'command',
  },
  {
    id: 'cmd-settings',
    title: '设置与数据',
    subtitle: '本地数据库、备份与导入',
    route: '/settings',
    icon: 'sliders' as SearchIcon,
    type: 'command',
  },
]

const filteredCommands = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return commands
  return commands.filter((command) =>
    `${command.title} ${command.subtitle}`.toLowerCase().includes(keyword),
  )
})

interface DisplayItem {
  id: string
  type: string
  typeLabel: string
  title: string
  subtitle: string
  route: string
  icon: SearchIcon
}

const flatItems = computed<DisplayItem[]>(() => [
  ...filteredCommands.value.map((command) => ({
    id: command.id,
    type: 'command',
    typeLabel: '模块',
    title: command.title,
    subtitle: command.subtitle,
    route: command.route,
    icon: command.icon,
  })),
  ...groups.value.flatMap((group) =>
    group.items.map((item) => ({
      id: item.id,
      type: item.type,
      typeLabel: item.typeLabel,
      title: item.title,
      subtitle: item.subtitle,
      route: item.route,
      icon: item.icon,
    })),
  ),
])

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    query.value = ''
    activeIndex.value = 0
    void loadIndex(true)
    await nextTick()
    searchInput.value?.focus()
  },
)

watch(flatItems, () => {
  activeIndex.value = 0
})

function indexOfItem(item: { id: string; type: string }): number {
  return flatItems.value.findIndex(
    (entry) => entry.id === item.id && entry.type === item.type,
  )
}

function choose(item: DisplayItem): void {
  emit('close')
  query.value = ''
  void router.push(item.route)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (flatItems.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % flatItems.value.length
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (flatItems.value.length === 0) return
    activeIndex.value =
      (activeIndex.value - 1 + flatItems.value.length) % flatItems.value.length
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const item = flatItems.value[activeIndex.value]
    if (item) choose(item)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="open" class="palette-backdrop" @click.self="emit('close')">
        <div class="palette" role="dialog" aria-modal="true" aria-label="全局搜索">
          <div class="palette-search">
            <AppIcon name="search" :size="18" />
            <input
              ref="searchInput"
              v-model="query"
              class="palette-input"
              placeholder="搜索愿景、目标、任务、知识点、习惯…"
              aria-label="全局搜索"
              @keydown="onKeydown"
            />
            <span class="kbd">ESC</span>
          </div>

          <div class="palette-body">
            <div v-if="loading" class="palette-state">正在读取本地索引…</div>
            <div v-else-if="error" class="palette-state palette-error">
              索引读取失败：{{ error }}
            </div>

            <template v-else>
              <div v-if="filteredCommands.length" class="palette-group">
                <p class="palette-group-label">快捷跳转</p>
                <button
                  v-for="command in filteredCommands"
                  :key="command.id"
                  class="palette-item"
                  :class="{ active: activeIndex === indexOfItem(command) }"
                  @mouseenter="activeIndex = indexOfItem(command)"
                  @click="choose({ ...command, typeLabel: '模块', type: 'command' })"
                >
                  <span class="item-icon"><AppIcon :name="command.icon" :size="15" /></span>
                  <span class="item-copy">
                    <span class="item-title">{{ command.title }}</span>
                    <span class="item-subtitle">{{ command.subtitle }}</span>
                  </span>
                  <span class="item-action">打开</span>
                </button>
              </div>

              <div
                v-for="group in groups"
                :key="group.key"
                class="palette-group"
              >
                <p class="palette-group-label">{{ group.label }}</p>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  class="palette-item"
                  :class="{ active: activeIndex === indexOfItem(item) }"
                  @mouseenter="activeIndex = indexOfItem(item)"
                  @click="choose(item)"
                >
                  <span class="item-icon"><AppIcon :name="item.icon" :size="15" /></span>
                  <span class="item-copy">
                    <span class="item-title">{{ item.title }}</span>
                    <span class="item-subtitle">{{ item.subtitle }}</span>
                  </span>
                  <span class="item-type">{{ item.typeLabel }}</span>
                </button>
              </div>

              <div
                v-if="query.trim() && resultCount === 0 && filteredCommands.length === 0"
                class="palette-state"
              >
                没有找到“{{ query }}”。可以换一个关键词，或直接跳转到模块。
              </div>
              <div v-else-if="query.trim() && resultCount > 0" class="palette-count">
                共找到 {{ resultCount }} 条记录
              </div>
            </template>
          </div>

          <footer class="palette-foot">
            <span><span class="kbd">↑</span><span class="kbd">↓</span> 选择</span>
            <span><span class="kbd">↵</span> 打开</span>
            <span><span class="kbd">⌘</span><span class="kbd">K</span> 随时呼出</span>
            <span class="palette-note">数据只在此浏览器本地检索</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 24px 24px;
  background: rgba(29, 36, 32, 0.38);
  backdrop-filter: blur(5px);
}

.palette {
  width: min(640px, 100%);
  max-height: min(70vh, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.palette-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.palette-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: var(--ink);
}

.palette-input::placeholder {
  color: var(--muted);
}

.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 4px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1;
}

.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.palette-group {
  padding: 4px 0;
}

.palette-group-label {
  padding: 5px 9px 3px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px;
  border-radius: var(--radius-sm);
  text-align: left;
}

.palette-item.active {
  background: var(--accent-soft);
}

.item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--accent);
}

.palette-item.active .item-icon {
  background: var(--surface);
}

.item-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-subtitle {
  font-size: 10px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-type,
.item-action {
  flex: none;
  font-size: 9px;
  color: var(--muted);
}

.item-action {
  color: var(--accent);
  font-weight: 600;
}

.palette-state {
  padding: 26px 16px;
  text-align: center;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.7;
}

.palette-error {
  color: var(--danger);
}

.palette-count {
  padding: 8px 10px 3px;
  font-size: 9.5px;
  color: var(--muted);
}

.palette-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 9px 16px;
  border-top: 1px solid var(--line-faint);
  background: var(--surface-muted);
  color: var(--muted);
  font-size: 9px;
}

.palette-foot > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.palette-note {
  margin-left: auto;
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.16s ease;
}

.palette-enter-active .palette,
.palette-leave-active .palette {
  transition:
    transform 0.22s var(--ease-out),
    opacity 0.16s ease;
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette,
.palette-leave-to .palette {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}

@media (max-width: 620px) {
  .palette-backdrop {
    padding: 8vh 12px 12px;
  }

  .palette-note {
    display: none;
  }
}
</style>
