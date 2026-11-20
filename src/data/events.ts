export type DataScope =
  | 'vision'
  | 'identity'
  | 'direction'
  | 'competency'
  | 'milestone'
  | 'goal'
  | 'task'
  | 'timebox'
  | 'habit'
  | 'workflow'
  | 'learning'
  | 'knowledge'
  | 'review'
  | 'evidence'
  | 'settings'

type DataChangeListener = (scopes: DataScope[]) => void

const listeners = new Set<DataChangeListener>()
const pending = new Set<DataScope>()
let flushScheduled = false

function flush(): void {
  flushScheduled = false
  if (pending.size === 0) return
  const scopes = [...pending]
  pending.clear()
  for (const listener of [...listeners]) {
    listener(scopes)
  }
}

export function emitDataChange(...scopes: DataScope[]): void {
  if (scopes.length === 0) return
  for (const scope of scopes) pending.add(scope)
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(flush)
}

export function onDataChange(listener: DataChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hasScope(scopes: DataScope[], targets: DataScope[]): boolean {
  return targets.some((target) => scopes.includes(target))
}

export function resetDataChangeListeners(): void {
  listeners.clear()
  pending.clear()
  flushScheduled = false
}