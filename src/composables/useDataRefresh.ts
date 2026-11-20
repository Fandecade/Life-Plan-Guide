import { getCurrentScope, onScopeDispose } from 'vue'
import { onDataChange, type DataScope } from '@/data/events'

export function useDataRefresh(scopes: DataScope[], handler: () => void): void {
  if (!getCurrentScope()) return
  const off = onDataChange((changed) => {
    if (changed.some((scope) => scopes.includes(scope))) handler()
  })
  onScopeDispose(off)
}