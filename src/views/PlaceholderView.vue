<script setup lang="ts">
import AppIcon, { type IconName } from '@/components/AppIcon.vue'

defineProps<{
  moduleName: string
  englishName: string
  phase: number
  question: string
  summary: string
  bullets: string[]
  entities: string[]
  stores: string[]
  icon: IconName
}>()
</script>

<template>
  <div class="page placeholder">
    <header class="page-header">
      <div>
        <p class="page-eyebrow">模块蓝图 · 阶段 {{ phase }}</p>
        <h2 class="page-title">{{ moduleName }}</h2>
        <p class="page-subtitle">{{ englishName }} · {{ question }}</p>
      </div>
      <span class="badge badge-amber">计划在阶段 {{ phase }} 交付</span>
    </header>

    <section class="blueprint card card-pad">
      <div class="blueprint-head">
        <span class="blueprint-icon"><AppIcon :name="icon" :size="22" /></span>
        <div>
          <p class="blueprint-label">Design intent</p>
          <h3 class="blueprint-title">这个模块为什么存在</h3>
        </div>
      </div>
      <p class="blueprint-summary">{{ summary }}</p>
      <div class="blueprint-line" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>

    <div class="grid-2">
      <article class="card card-pad">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="layers" :size="16" />
            功能范围
          </h3>
        </div>
        <ul class="bullet-list">
          <li v-for="bullet in bullets" :key="bullet">
            <span class="bullet-dot" />
            {{ bullet }}
          </li>
        </ul>
      </article>

      <article class="card card-pad">
        <div class="section-head">
          <h3 class="section-title">
            <AppIcon name="database" :size="16" />
            已就绪的数据结构
          </h3>
          <span class="section-note">阶段 1 已建模</span>
        </div>
        <div class="entity-tags">
          <span v-for="entity in entities" :key="entity" class="entity-tag">{{ entity }}</span>
        </div>
        <div class="divider" />
        <p class="stores-label">IndexedDB Object Stores</p>
        <ul class="store-list">
          <li v-for="store in stores" :key="store">
            <AppIcon name="check" :size="12" />
            <code>{{ store }}</code>
          </li>
        </ul>
      </article>
    </div>

    <section class="card card-pad ready-card">
      <div class="ready-copy">
        <p class="page-eyebrow">现在可以做什么</p>
        <h3>数据层与应用骨架已经可运行</h3>
        <p>
          这个模块的实体、索引和关联表已经写入本地数据库。你可以在“设置与数据”中查看集合数量、
          导出完整 JSON，或载入演示数据检查结构是否符合预期。下一阶段会在此页面上实现完整的交互。
        </p>
        <div class="ready-actions">
          <RouterLink to="/" class="btn btn-primary">
            <AppIcon name="arrow-right" :size="15" />
            返回今日概览
          </RouterLink>
          <RouterLink to="/settings" class="btn btn-secondary">
            <AppIcon name="database" :size="15" />
            查看数据状态
          </RouterLink>
        </div>
      </div>
      <div class="ready-visual" aria-hidden="true">
        <span class="visual-orbit orbit-1" />
        <span class="visual-orbit orbit-2" />
        <span class="visual-core"><AppIcon :name="icon" :size="24" /></span>
        <span class="visual-node node-1" />
        <span class="visual-node node-2" />
        <span class="visual-node node-3" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.blueprint {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(90% 120% at 100% 0%, rgba(154, 101, 32, 0.09), transparent 55%),
    var(--surface);
}

.blueprint-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.blueprint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
}

.blueprint-label {
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted);
}

.blueprint-title {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 600;
}

.blueprint-summary {
  margin-top: 16px;
  max-width: 880px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.85;
}

.blueprint-line {
  display: flex;
  gap: 5px;
  margin-top: 20px;
}

.blueprint-line span {
  height: 3px;
  border-radius: var(--radius-pill);
}

.blueprint-line span:nth-child(1) {
  width: 84px;
  background: var(--accent);
}

.blueprint-line span:nth-child(2) {
  width: 26px;
  background: var(--line-strong);
}

.blueprint-line span:nth-child(3) {
  width: 10px;
  background: var(--line);
}

.bullet-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.bullet-list li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--ink-soft);
  font-size: 12.5px;
  line-height: 1.7;
}

.bullet-dot {
  width: 5px;
  height: 5px;
  flex: none;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--accent);
}

.entity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.entity-tag {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 10.5px;
}

.stores-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.store-list {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}

.store-list li {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
}

.store-list .icon {
  color: var(--accent);
}

.store-list code {
  font-family: var(--font-mono);
  font-size: 10px;
}

.ready-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 6%, transparent), transparent 60%),
    var(--surface);
}

.ready-copy {
  max-width: 680px;
}

.ready-copy h3 {
  margin-top: 7px;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
}

.ready-copy p {
  margin-top: 8px;
  color: var(--ink-faint);
  font-size: 12.5px;
  line-height: 1.75;
}

.ready-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 18px;
}

.ready-visual {
  position: relative;
  width: 150px;
  height: 150px;
  flex: none;
}

.visual-orbit {
  position: absolute;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}

.orbit-1 {
  inset: 8px;
}

.orbit-2 {
  inset: 30px;
  border-style: dashed;
  border-color: var(--line);
}

.visual-core {
  position: absolute;
  left: 50%;
  top: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  transform: translate(-50%, -50%);
  box-shadow: 0 12px 26px -16px color-mix(in srgb, var(--accent) 90%, transparent);
}

.visual-node {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--amber);
}

.node-1 {
  top: 18px;
  right: 34px;
}

.node-2 {
  bottom: 24px;
  left: 22px;
  background: var(--accent);
}

.node-3 {
  right: 8px;
  bottom: 56px;
  background: var(--line-strong);
}

@media (max-width: 900px) {
  .ready-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .ready-visual {
    display: none;
  }

  .store-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>