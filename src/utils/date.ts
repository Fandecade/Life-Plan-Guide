export function nowIso(): string {
  return new Date().toISOString()
}

export function todayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function startOfDay(date = new Date()): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date = new Date()): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function isSameDay(a: string | null, b: string | Date = new Date()): boolean {
  if (!a) return false
  const left = new Date(a)
  const right = b instanceof Date ? b : new Date(b)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export function formatDate(value: string | null, fallback = '未设置'): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatShortDate(value: string | null, fallback = '未设置'): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDateTime(value: string | null, fallback = '未设置'): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 分钟'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function toDateInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromDateInput(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T09:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function toDateTimeInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`
}

export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function formatTime(value: string | null, fallback = '--:--'): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

export function daysUntil(value: string | null): number | null {
  if (!value) return null
  const target = startOfDay(new Date(value))
  const today = startOfDay()
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function relativeDay(value: string | null): string {
  const diff = daysUntil(value)
  if (diff === null) return '未设置'
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff > 1) return `${diff} 天后`
  return `${Math.abs(diff)} 天前`
}