import { ref } from 'vue'

export type ToastKind = 'default' | 'error'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const items = ref<ToastItem[]>([])
let sequence = 0

const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

function push(message: string, kind: ToastKind = 'default'): number {
  const id = ++sequence
  items.value = [...items.value, { id, message, kind }]
  const timer = setTimeout(() => dismiss(id), kind === 'error' ? 5200 : 3200)
  timers.set(id, timer)
  return id
}

export function useToast() {
  return {
    toasts: items,
    push,
    success: (message: string) => push(message),
    error: (message: string) => push(message, 'error'),
    dismiss,
  }
}