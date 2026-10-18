import type { AppData } from '../types'
import { addDays, iso, monday, stamp, toMin } from './dates'
import { isWorkDay } from './scheduler'

/** A quiet line for the day. Changes each morning; the same all day. */
const LINES = [
  'You don’t have to do it all. Just the next thing.',
  'Rest is part of the work.',
  'Small steps still move you.',
  'The work will wait while you breathe.',
  'Begin badly. Make it lovely later.',
  'Your worth isn’t your output.',
  'Messy is how ideas arrive.',
  'One thing, fully.',
  'You’re allowed to stop on time.',
  'Curiosity first. Perfection never.',
  'A walk counts as thinking.',
  'Today only needs today’s effort.',
  'Soft focus, steady hands.',
  'Notice one beautiful thing today.',
  'Unclench your jaw. Drop your shoulders.',
  'Slow is smooth, and smooth is quick.',
  'Leave a little for tomorrow.',
  'Make it for you first.',
  'Good enough, sent, beats perfect, waiting.',
  'Drink some water. Then begin.',
  'There is enough time for what matters.',
]

export function zenLine(day = iso()): string {
  const n = Number(day.replace(/-/g, ''))
  return LINES[n % LINES.length]
}

export const CARE = [
  { key: 'water', label: 'Water', hint: 'A full glass' },
  { key: 'move', label: 'Move', hint: 'Stretch or shake it out' },
  { key: 'outside', label: 'Outside', hint: 'Daylight, even briefly' },
  { key: 'food', label: 'Eat well', hint: 'A proper meal' },
] as const

/**
 * Evenings kept this week: work days already over (or put away) where the
 * day was put away by about the end of the work day. A gentle measure of
 * balance, not a streak to protect.
 */
export function eveningsKept(d: AppData, day = iso()): { kept: number; of: number } {
  const s = d.settings
  let kept = 0
  let of = 0
  for (let date = monday(day); date <= day; date = addDays(date, 1)) {
    if (!isWorkDay(date, s)) continue
    const closedAt = d.days[date]?.closedAt
    if (date === day && !closedAt) continue
    of++
    if (closedAt && closedAt <= stamp(date, s.dayEnd) + 45 * 60_000) kept++
  }
  return { kept, of }
}

/** Minutes of work blocks planned today (done or not). */
export const plannedToday = (d: AppData, day = iso()) =>
  d.blocks.filter((b) => b.date === day).reduce((a, b) => a + b.minutes, 0)

/** Minutes of work blocks planned this week. */
export function plannedWeek(d: AppData, day = iso()): number {
  const from = monday(day)
  const to = addDays(from, 6)
  return d.blocks.filter((b) => b.date >= from && b.date <= to).reduce((a, b) => a + b.minutes, 0)
}

/** How long the running timer has gone without a pause, in minutes. */
export function focusRun(d: AppData, now = Date.now()): number {
  return d.active ? Math.floor((now - d.active.startedAt) / 60_000) : 0
}

/** Where now sits in the work day, 0 (start) to 1 (end); below 0 before, above 1 after. */
export function dayProgress(d: AppData, now = new Date()): number {
  const from = toMin(d.settings.dayStart)
  const to = toMin(d.settings.dayEnd)
  return (now.getHours() * 60 + now.getMinutes() - from) / Math.max(1, to - from)
}
