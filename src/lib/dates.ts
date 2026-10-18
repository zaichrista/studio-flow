export const pad = (n: number) => String(n).padStart(2, '0')

export function iso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse YYYY-MM-DD as a local date at noon (avoids DST edge cases). */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function weekday(s: string): number {
  return parseISO(s).getDay()
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fromMin(n: number): string {
  return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`
}

/** Epoch ms for a local date + HH:mm */
export function stamp(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const m = toMin(time)
  return new Date(y, mo - 1, d, Math.floor(m / 60), m % 60).getTime()
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

export function monday(s: string): string {
  const dow = (weekday(s) + 6) % 7
  return addDays(s, -dow)
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const shortDayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const smallFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

export const dayName = (s: string) => dayFmt.format(parseISO(s))
export const shortDay = (s: string) => shortDayFmt.format(parseISO(s))
export const longDate = (s: string) => longFmt.format(parseISO(s))
export const smallDate = (s: string) => smallFmt.format(parseISO(s))
export const monthLabel = (s: string) => monthFmt.format(parseISO(s))

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`
}
