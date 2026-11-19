<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ModalDialog from '@/components/ModalDialog.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { useAppearance, type ThemeMode } from '@/composables/useAppearance'
import {
  ALL_STORES,
  STORE_LABELS,
  analyzeBackup,
  clearAllData,
  createBackup,
  db,
  downloadBackup,
  importBackup,
  inspectDataHealth,
  isBackupFile,
  readDatabaseInfo,
  recordExport,
  seedDemoData,
  repos,
  type BackupFile,
  type DatabaseInfo,
  type DataHealth,
  type ImportMode,
  type ImportPreview,
} from '@/data'
import { formatDateTime, formatShortDate } from '@/utils/date'

const { success, error: toastError } = useToast()
const {
  mode: themeMode,
  modeLabel: themeModeLabel,
  setMode: setThemeMode,
} = useAppearance()

const themeOptions: Array<{
  value: ThemeMode
  label: string
  description: string
  icon: 'sun' | 'moon' | 'monitor'
}> = [
  { value: 'light', label: '浅色', description: '清晰、轻量、专注', icon: 'sun' },
  { value: 'dark', label: '深色', description: '安静、低干扰、耐看', icon: 'moon' },
  {
    value: 'system',
    label: '跟随系统',
    description: '自动跟随设备外观',
    icon: 'monitor',
  },
]

async function changeTheme(next: ThemeMode): Promise<void> {
  await setThemeMode(next)
  success(
    `主题已切换为 ${themeOptions.find((item) => item.value === next)?.label ?? next}`,
  )
}

const info = ref<DatabaseInfo | null>(null)
const health = ref<DataHealth | null>(null)
const loading = ref(true)
const busy = ref('')
const showAllStores = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const importFile = ref<BackupFile | null>(null)
const importPreview = ref<ImportPreview | null>(null)
const importMode = ref<ImportMode>('merge')
const importOpen = ref(false)
const importFileName = ref('')
const importedFlags = ref(false)

const confirmOpen = ref(false)
const confirmKind = ref<'seed' | 'clear'>('seed')

const storeEntries = computed(() =>
  ALL_STORES.map((store) => ({
    store,
    label: STORE_LABELS[store],
    count: info.value?.counts[store] ?? 0,
  })),
)

const visibleStores = computed(() =>
  showAllStores.value
    ? storeEntries.value
    : storeEntries.value.filter((entry) => entry.count > 0),
)

const nonEmptyCount = computed(
  () => storeEntries.value.filter((entry) => entry.count > 0).length,
)

const exportCount = computed(() => info.value?.counts.dataExports ?? 0)

const previewCounts = computed(() =>
  importPreview.value
    ? Object.entries(importPreview.value.counts).filter(([, count]) => count > 0)
    : [],
)

const importWarnings = computed(() => importPreview.value?.warnings ?? [])
const importErrors = computed(() => importPreview.value?.errors ?? [])

const missingPreview = computed(() => importPreview.value?.missingReferences.slice(0, 6) ?? [])

const confirmTitle = computed(() =>
  confirmKind.value === 'seed' ? '重置为演示数据' : '清空所有数据',
)

const confirmText = computed(() =>
  confirmKind.value === 'seed'
    ? '这会删除当前设备上的全部业务数据，并写入一套完整的演示数据。建议先导出备份。'
    : '这会删除当前设备上的全部业务数据，包括愿景、目标、任务、学习记录和复盘。操作不可撤销。',
)

const confirmActionLabel = computed(() =>
  confirmKind.value === 'seed' ? '清空并载入演示数据' : '确认清空',
)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [databaseInfo, dataHealth] = await Promise.all([
      readDatabaseInfo(db),
      inspectDataHealth(db),
    ])
    info.value = databaseInfo
    health.value = dataHealth
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    loading.value = false
  }
}

async function handleExport(): Promise<void> {
  busy.value = 'export'
  try {
    const backup = await createBackup(db)
    downloadBackup(backup)
    await recordExport(db, backup)
    success(`已导出 ${backup.counts ? Object.values(backup.counts).reduce((a, b) => a + b, 0) : 0} 条记录`)
    await refresh()
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    busy.value = ''
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importFileName.value = file.name
  importedFlags.value = false
  try {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)
    if (!isBackupFile(parsed)) {
      toastError('无法识别该文件：不是 Personal Growth OS 的备份格式')
      return
    }
    importFile.value = parsed
    importMode.value = 'merge'
    importPreview.value = await analyzeBackup(db, parsed, 'merge')
    importOpen.value = true
  } catch (caught) {
    const message =
      caught instanceof SyntaxError
        ? '文件不是合法的 JSON'
        : caught instanceof Error
          ? caught.message
          : String(caught)
    toastError(message)
  } finally {
    input.value = ''
  }
}

watch(importMode, async (mode) => {
  if (!importFile.value) return
  try {
    importPreview.value = await analyzeBackup(db, importFile.value, mode)
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  }
})

async function runImport(): Promise<void> {
  if (!importFile.value || !importPreview.value?.ok) return
  busy.value = 'import'
  try {
    const result = await importBackup(db, importFile.value, importMode.value)
    importedFlags.value = true
    importOpen.value = false
    success(
      result.skipped > 0
        ? `导入完成：新增 ${result.imported} 条，跳过 ${result.skipped} 条已有记录`
        : `导入完成：共写入 ${result.imported} 条记录`,
    )
    await refresh()
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    busy.value = ''
  }
}

function askConfirm(kind: 'seed' | 'clear'): void {
  confirmKind.value = kind
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  busy.value = confirmKind.value
  try {
    if (confirmKind.value === 'seed') {
      await clearAllData(db)
      await seedDemoData(repos)
      success('演示数据已重置，可以在首页查看')
    } else {
      await clearAllData(db)
      success('本地数据已清空')
    }
    confirmOpen.value = false
    await refresh()
  } catch (caught) {
    toastError(caught instanceof Error ? caught.message : String(caught))
  } finally {
    busy.value = ''
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page settings">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">系统基础能力</p>
        <h2 class="page-title">设置与数据</h2>
        <p class="page-subtitle">
          第一版所有数据保存在此浏览器的 IndexedDB。导出与恢复不是可选项，而是本地优先架构的一部分。
        </p>
      </div>
      <button class="btn btn-secondary" :disabled="loading" @click="refresh">
        <AppIcon name="refresh" :size="15" />
        刷新状态
      </button>
    </header>

    <div class="settings-grid">
      <div class="settings-col">
        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="database" :size="16" />
              本地数据库
            </h3>
            <span class="badge badge-accent">IndexedDB</span>
          </div>

          <div class="db-summary">
            <div class="db-summary-item">
              <span class="db-label">数据库</span>
              <span class="db-value mono">{{ info?.name ?? '—' }}</span>
            </div>
            <div class="db-summary-item">
              <span class="db-label">结构版本</span>
              <span class="db-value mono">v{{ info?.version ?? '—' }}</span>
            </div>
            <div class="db-summary-item">
              <span class="db-label">集合</span>
              <span class="db-value">{{ ALL_STORES.length }}</span>
            </div>
            <div class="db-summary-item">
              <span class="db-label">记录总数</span>
              <span class="db-value">{{ info?.total ?? 0 }}</span>
            </div>
          </div>

          <div class="divider" />

          <div class="row-between store-toolbar">
            <div>
              <p class="store-title">集合明细</p>
              <p class="section-note">
                已使用 {{ nonEmptyCount }} 个集合，{{ ALL_STORES.length - nonEmptyCount }} 个为空
              </p>
            </div>
            <button class="link-btn" @click="showAllStores = !showAllStores">
              {{ showAllStores ? '只显示非空' : '显示全部集合' }}
              <AppIcon name="arrow-right" :size="13" />
            </button>
          </div>

          <div v-if="loading" class="stack store-loading">
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line" />
            <div class="skeleton skeleton-line" />
          </div>
          <EmptyState
            v-else-if="visibleStores.length === 0"
            title="本地数据库还是空的"
            description="可以从首页载入演示数据，或导入一份已有的 JSON 备份。"
          >
            <button class="btn btn-sm btn-secondary" @click="askConfirm('seed')">载入演示数据</button>
          </EmptyState>
          <table v-else class="data-table store-table">
            <thead>
              <tr>
                <th>Object Store</th>
                <th>含义</th>
                <th class="num">记录</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in visibleStores" :key="entry.store">
                <td><code>{{ entry.store }}</code></td>
                <td>{{ entry.label }}</td>
                <td class="num">{{ entry.count }}</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="layers" :size="16" />
              演示与重置
            </h3>
          </div>
          <div class="action-row">
            <div class="action-copy">
              <p class="action-title">载入 / 重置演示数据</p>
              <p class="action-desc">
                写入一套跨模块互相关联的样例数据，用于检查数据结构、关联关系和首页聚合效果。
              </p>
            </div>
            <button class="btn btn-secondary" :disabled="busy !== ''" @click="askConfirm('seed')">
              <AppIcon name="spark" :size="15" />
              重置演示数据
            </button>
          </div>
          <div class="action-row action-row-danger">
            <div class="action-copy">
              <p class="action-title">清空所有数据</p>
              <p class="action-desc">
                删除全部业务数据，回到全新的空状态。建议在操作前先导出一份完整备份。
              </p>
            </div>
            <button class="btn btn-danger" :disabled="busy !== ''" @click="askConfirm('clear')">
              <AppIcon name="trash" :size="15" />
              清空数据
            </button>
          </div>
        </article>
      </div>

      <div class="settings-col">
        <article class="card card-pad theme-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="sun" :size="16" />
              外观与主题
            </h3>
            <span class="badge badge-accent">{{ themeModeLabel }}</span>
          </div>
          <p class="theme-note">
            统一设计语言会应用到所有模块。浅色保持清晰，深色降低夜间干扰，也可以跟随系统。
          </p>
          <div class="theme-options">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              class="theme-option"
              :class="{ active: themeMode === option.value }"
              :aria-pressed="themeMode === option.value"
              @click="changeTheme(option.value)"
            >
              <span class="theme-icon"><AppIcon :name="option.icon" :size="16" /></span>
              <span class="theme-copy">
                <strong>{{ option.label }}</strong>
                <span>{{ option.description }}</span>
              </span>
              <span class="theme-check">
                <AppIcon v-if="themeMode === option.value" name="check" :size="12" />
              </span>
            </button>
          </div>
          <p class="theme-hint">主题偏好会保存在本地，并在下次打开时立即恢复。</p>
        </article>

        <article class="card card-pad backup-card">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="archive" :size="16" />
              备份与恢复
            </h3>
            <span class="section-note">{{ exportCount }} 次导出</span>
          </div>
          <p class="backup-note">
            完整备份包含所有 Object Store、UUID、时间戳、版本号和关联关系。导入前会检查结构版本、
            ID 冲突与关联完整性。
          </p>
          <div class="backup-actions">
            <button class="btn btn-primary" :disabled="busy !== ''" @click="handleExport">
              <AppIcon name="download" :size="15" />
              {{ busy === 'export' ? '正在导出…' : '导出完整 JSON' }}
            </button>
            <button class="btn btn-secondary" :disabled="busy !== ''" @click="pickFile">
              <AppIcon name="upload" :size="15" />
              从备份导入
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="application/json,.json"
              class="hidden-input"
              @change="onFileSelected"
            />
          </div>
          <div class="backup-meta">
            <span><AppIcon name="check" :size="12" /> UUID 业务主键</span>
            <span><AppIcon name="check" :size="12" /> 结构版本检查</span>
            <span><AppIcon name="check" :size="12" /> 关联完整性预览</span>
          </div>
        </article>

        <article class="card card-pad">
          <div class="section-head">
            <h3 class="section-title">
              <AppIcon name="warning" :size="16" />
              数据完整性
            </h3>
            <span v-if="health && health.orphanCount === 0" class="badge badge-accent">关联正常</span>
            <span v-else-if="health" class="badge badge-danger">{{ health.orphanCount }} 处异常</span>
          </div>
          <p class="backup-note">
            检查所有外键字段是否仍指向真实存在的记录。历史数据允许孤立，但导入或手动修改后值得复查。
          </p>
          <div v-if="health" class="health-grid">
            <div>
              <span class="health-value">{{ health.orphanCount }}</span>
              <span class="health-label">孤立关联</span>
            </div>
            <div>
              <span class="health-value">{{ health.duplicates }}</span>
              <span class="health-label">重复 ID</span>
            </div>
            <div>
              <span class="health-value">{{ nonEmptyCount }}</span>
              <span class="health-label">非空集合</span>
            </div>
          </div>
          <ul v-if="health && health.missing.length > 0" class="missing-list">
            <li v-for="(item, index) in health.missing.slice(0, 6)" :key="index">
              <code>{{ item.store }}.{{ item.field }}</code>
              <span>→ {{ item.target }} {{ item.targetId }}</span>
            </li>
          </ul>
          <button class="btn btn-sm btn-secondary" :disabled="loading" @click="refresh">
            <AppIcon name="refresh" :size="14" />
            重新检查
          </button>
        </article>

        <article class="card card-pad architecture-card">
          <p class="page-eyebrow">为迁移预留</p>
          <h3>本地优先，但不锁死本地</h3>
          <p>
            业务层只依赖 Repository 接口。第一版使用 Dexie + IndexedDB，未来接入服务器时替换为
            Remote Repository，领域模型和页面不需要推翻。
          </p>
          <ul>
            <li><span class="dot" /> 所有实体使用 UUID 业务主键</li>
            <li><span class="dot" /> 统一 createdAt / updatedAt / version</li>
            <li><span class="dot" /> 预留 syncStatus / lastSyncedAt / deletedAt</li>
            <li><span class="dot" /> 关联仅存 ID，不复制整对象</li>
          </ul>
        </article>
      </div>
    </div>

    <section v-if="importedFlags" class="alert alert-info">
      <AppIcon name="check" :size="15" />
      <span>上次导入已完成。可以回到首页查看聚合结果，或继续在这里检查各集合数量。</span>
    </section>

    <ModalDialog
      :open="importOpen"
      title="导入备份"
      :subtitle="importFileName || '检查备份内容后再写入本地数据库'"
      size="lg"
      @close="importOpen = false"
    >
      <div v-if="importPreview" class="import-body">
        <div class="import-summary">
          <div>
            <span class="import-label">导出时间</span>
            <span class="import-value">{{ formatDateTime(importPreview.exportedAt) }}</span>
          </div>
          <div>
            <span class="import-label">结构版本</span>
            <span class="import-value mono">v{{ importPreview.schemaVersion }}</span>
          </div>
          <div>
            <span class="import-label">记录总数</span>
            <span class="import-value">{{ importPreview.total }}</span>
          </div>
          <div>
            <span class="import-label">ID 冲突</span>
            <span class="import-value" :class="{ 'value-warn': importPreview.idConflicts > 0 }">
              {{ importPreview.idConflicts }}
            </span>
          </div>
        </div>

        <div v-if="importErrors.length" class="alert alert-danger">
          <AppIcon name="warning" :size="15" />
          <div>
            <p v-for="message in importErrors" :key="message">{{ message }}</p>
          </div>
        </div>

        <div class="mode-switch">
          <button
            class="mode-card"
            :class="{ active: importMode === 'merge' }"
            @click="importMode = 'merge'"
          >
            <span class="mode-head">
              <span class="mode-radio" :class="{ checked: importMode === 'merge' }" />
              合并导入
              <span class="badge">推荐</span>
            </span>
            <span class="mode-desc">保留本地同 ID 记录，只写入备份中不存在的记录，适合多设备数据汇合。</span>
          </button>
          <button
            class="mode-card mode-danger"
            :class="{ active: importMode === 'replace' }"
            @click="importMode = 'replace'"
          >
            <span class="mode-head">
              <span class="mode-radio" :class="{ checked: importMode === 'replace' }" />
              替换导入
            </span>
            <span class="mode-desc">清空当前设备全部数据，完整恢复备份内容。操作不可撤销。</span>
          </button>
        </div>

        <div v-if="previewCounts.length" class="preview-table">
          <p class="preview-title">包含的集合</p>
          <div class="preview-chips">
            <span v-for="[store, count] in previewCounts" :key="store" class="preview-chip">
              <code>{{ store }}</code>
              <strong>{{ count }}</strong>
            </span>
          </div>
        </div>

        <div v-for="message in importWarnings" :key="message" class="alert alert-warning">
          <AppIcon name="warning" :size="15" />
          <span>{{ message }}</span>
        </div>

        <div v-if="missingPreview.length" class="missing-preview">
          <p class="preview-title">关联缺失示例</p>
          <ul>
            <li v-for="(item, index) in missingPreview" :key="index">
              <code>{{ item.store }}.{{ item.field }}</code>
              <span>→ {{ item.target }}</span>
              <span class="mono">{{ item.targetId }}</span>
            </li>
          </ul>
          <p v-if="importPreview.missingReferences.length > 6" class="preview-more">
            另有 {{ importPreview.missingReferences.length - 6 }} 处未展示
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="importOpen = false">取消</button>
          <button
            class="btn"
            :class="importMode === 'replace' ? 'btn-danger' : 'btn-primary'"
            :disabled="!importPreview.ok || busy === 'import'"
            @click="runImport"
          >
            {{ busy === 'import' ? '正在写入…' : importMode === 'replace' ? '清空并恢复' : '合并导入' }}
          </button>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog :open="confirmOpen" :title="confirmTitle" @close="confirmOpen = false">
      <p class="confirm-text">{{ confirmText }}</p>
      <div class="alert alert-warning confirm-warning">
        <AppIcon name="warning" :size="15" />
        <span>本地浏览器数据可能因清理缓存、设备故障而丢失。请在重要阶段结束时导出备份。</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="confirmOpen = false">取消</button>
        <button
          class="btn btn-danger"
          :disabled="busy !== ''"
          @click="runConfirm"
        >
          {{ busy === 'seed' || busy === 'clear' ? '处理中…' : confirmActionLabel }}
        </button>
      </div>
    </ModalDialog>

    <p class="settings-foot">
      系统 · 本地数据与备份 · 最后刷新 {{ formatShortDate(new Date().toISOString()) }}
    </p>
  </div>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.settings-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.db-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.db-summary-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.db-label {
  font-size: 10px;
  color: var(--muted);
}

.db-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.store-toolbar {
  margin-bottom: 10px;
}

.store-title {
  font-size: 12.5px;
  font-weight: 600;
}

.store-table {
  max-height: 460px;
}

.store-table code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--ink-soft);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 550;
}

.link-btn:hover {
  color: var(--accent);
}

.skeleton-line {
  height: 24px;
}

.store-loading {
  padding: 6px 0;
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--line-faint);
}

.action-row:first-of-type {
  border-top: none;
  padding-top: 0;
}

.action-row-danger {
  border-top: 1px solid var(--line-faint);
}

.action-title {
  font-size: 12.5px;
  font-weight: 600;
}

.action-desc {
  margin-top: 2px;
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.6;
  max-width: 480px;
}

.action-copy {
  min-width: 0;
}

.backup-note {
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.7;
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
}

.hidden-input {
  display: none;
}

.backup-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--line-faint);
  color: var(--muted);
  font-size: 10.5px;
}

.backup-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.backup-meta .icon {
  color: var(--accent);
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin: 14px 0;
}

.health-grid div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.health-value {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.health-label {
  font-size: 10px;
  color: var(--muted);
}

.missing-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
}

.missing-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 10px;
  color: var(--danger);
}

.missing-list code {
  font-family: var(--font-mono);
}

.architecture-card {
  background:
    linear-gradient(140deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 62%),
    var(--surface);
}

.architecture-card h3 {
  margin-top: 5px;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
}

.architecture-card > p {
  margin-top: 7px;
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.7;
}

.architecture-card ul {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 13px;
}

.architecture-card li {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-soft);
  font-size: 11.5px;
}

.architecture-card .dot {
  opacity: 0.7;
}

.import-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.import-summary > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.import-label {
  font-size: 10px;
  color: var(--muted);
}

.import-value {
  font-size: 12.5px;
  font-weight: 600;
}

.value-warn {
  color: var(--amber);
}

.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.mode-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-align: left;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.mode-card.active {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.mode-card.mode-danger.active {
  border-color: var(--danger);
  background: var(--danger-soft);
}

.mode-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.mode-radio {
  width: 13px;
  height: 13px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
}

.mode-radio.checked {
  border: 4px solid var(--accent);
}

.mode-card.mode-danger .mode-radio.checked {
  border-color: var(--danger);
}

.mode-desc {
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.6;
}

.preview-table {
  margin-bottom: 12px;
}

.preview-title {
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 140px;
  overflow: auto;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  font-size: 10px;
}

.preview-chip code {
  font-family: var(--font-mono);
}

.preview-chip strong {
  font-family: var(--font-mono);
  color: var(--accent);
}

.import-body > .alert {
  margin-bottom: 9px;
}

.missing-preview {
  margin-top: 10px;
  padding: 11px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
}

.missing-preview ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.missing-preview li {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 10px;
  color: var(--danger-ink);
}

.missing-preview code {
  font-family: var(--font-mono);
}

.preview-more {
  margin-top: 5px;
  font-size: 10px;
  color: var(--danger);
}

.confirm-text {
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.75;
}

.confirm-warning {
  margin-top: 14px;
}

.settings-foot {
  color: var(--muted);
  font-size: 10.5px;
  text-align: center;
  padding-top: 6px;
}

@media (max-width: 1080px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .db-summary,
  .import-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mode-switch {
    grid-template-columns: minmax(0, 1fr);
  }

  .action-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
.theme-note {
  color: var(--ink-faint);
  font-size: 11.5px;
  line-height: 1.7;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  text-align: left;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.theme-option:hover {
  border-color: var(--line-strong);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.theme-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-faint);
}

.theme-option.active .theme-icon {
  background: var(--accent-soft);
  color: var(--accent);
}

.theme-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.theme-copy strong {
  font-size: 11px;
  font-weight: 600;
}

.theme-copy span {
  color: var(--muted);
  font-size: 8.5px;
  line-height: 1.5;
}

.theme-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: var(--on-accent);
}

.theme-option.active .theme-check {
  background: var(--accent);
}

.theme-hint {
  margin-top: 9px;
  color: var(--muted);
  font-size: 9px;
}

@media (max-width: 620px) {
  .theme-options {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>