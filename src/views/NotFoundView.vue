<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
</script>

<template>
  <div class="page not-found">
    <div class="nf-card card">
      <span class="nf-code">404</span>
      <h2>这个页面不存在</h2>
      <p>可能是链接输入错误，或者该模块还没有开放。</p>
      <RouterLink to="/" class="btn btn-primary">
        <AppIcon name="arrow-right" :size="15" />
        回到今日概览
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 58vh;
  align-items: center;
  justify-content: center;
}

.nf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 40px;
  text-align: center;
}

.nf-code {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.2em;
  color: var(--muted);
}

.nf-card h2 {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
}

.nf-card p {
  color: var(--muted);
  font-size: 12.5px;
}

.nf-card .btn {
  margin-top: 8px;
}
</style>