<script setup lang="ts">

withDefaults(
  defineProps<{
    title: string
    description?: string
  }>(),
  { description: '' },
)
</script>

<template>
  <div class="empty-state">
    <strong>{{ title }}</strong>
    <span v-if="description">{{ description }}</span>
    <slot />
  </div>
</template>

<style scoped>
.empty-state :deep(.btn) {
  margin-top: 4px;
}

.icon {
  color: var(--muted);
}
</style>