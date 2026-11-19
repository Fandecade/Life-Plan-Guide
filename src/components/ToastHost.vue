<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import AppIcon from './AppIcon.vue'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="{ 'toast-error': toast.kind === 'error' }"
      >
        <AppIcon :name="toast.kind === 'error' ? 'warning' : 'check'" :size="15" />
        <span>{{ toast.message }}</span>
        <button class="toast-close" aria-label="关闭提示" @click="dismiss(toast.id)">
          <AppIcon name="close" :size="13" />
        </button>
      </div>
    </div>
  </Teleport>
</template>