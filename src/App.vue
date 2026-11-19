<script setup lang="ts">
import { onMounted } from 'vue'
import AppShell from '@/layouts/AppShell.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useAppStore } from '@/stores/app'
import { useAppearance } from '@/composables/useAppearance'

const app = useAppStore()
const { hydrateFromDatabase } = useAppearance()

onMounted(async () => {
  await app.initialize()
  if (app.initialized) await hydrateFromDatabase()
})
</script>

<template>
  <div v-if="!app.initialized" class="boot">
    <div class="boot-card">
      <div class="boot-mark">
        <span class="boot-ring" />
        <span class="boot-core" />
      </div>
      <p class="boot-eyebrow">Personal Growth OS</p>
      <h1 class="boot-title">个人成长与学习系统</h1>
      <p v-if="!app.initError" class="boot-text">
        正在打开本地数据库，准备今天的行动空间…
      </p>
      <template v-else>
        <p class="boot-error">本地数据库打开失败：{{ app.initError }}</p>
        <button class="btn btn-secondary" @click="app.initialize()">重新尝试</button>
      </template>
      <p class="boot-foot">数据保存在此浏览器的 IndexedDB 中</p>
    </div>
  </div>

  <template v-else>
    <AppShell />
    <ToastHost />
  </template>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(90% 70% at 12% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 55%),
    radial-gradient(70% 60% at 100% 100%, rgba(154, 101, 32, 0.08), transparent 60%),
    var(--bg);
}

.boot-card {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 40px 36px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}

.boot-mark {
  position: relative;
  width: 52px;
  height: 52px;
  margin-bottom: 8px;
}

.boot-ring {
  position: absolute;
  inset: 0;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  opacity: 0.55;
  animation: breathe 2.4s ease-in-out infinite;
}

.boot-core {
  position: absolute;
  inset: 15px;
  border-radius: 50%;
  background: var(--accent);
}

.boot-eyebrow {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.boot-title {
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.boot-text {
  color: var(--ink-faint);
  font-size: 13px;
}

.boot-error {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12.5px;
}

.boot-foot {
  margin-top: 8px;
  color: var(--muted);
  font-size: 11.5px;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.55;
  }
  50% {
    transform: scale(1.18);
    opacity: 0.2;
  }
}
</style>