import type { Block, Settings, Task } from '../types'
import { addDays, fromMin, iso, nowMinutes, toMin, weekday } from './dates'
import { uid } from './id'

const STEP = 15
/** How far past a deadline we'll look for room before giving up */
const OVERFLOW_DAYS = 60

export const DEFAULT_SETTINGS: Settings = {
  workDays: [1, 2, 3, 4, 5],
  dayStart: '09:00',
  dayEnd: '17:00',
  lunchStart: '13:00',
  lunchMinutes: 60,
  defaultTaskDays: 3,
  blockMinutes: 60,
  notifyLeadMinutes: 0,
  workerUrl: '',
  appToken: '',
}

export const isWorkDay = (date: string, s: Settings) => s.workDays.includes(weekday(date))

/** The first `count` working days on or after `from`. */
export function workDates(from: string, count: number, s: Settings): string[] {
  if (s.workDays.length === 0) return []
  const out: string[] = []
  let d = from
  for (let guard = 0; out.length < count && guard < 400; guard++) {
    if (isWorkDay(d, s)) out.push(d)
    d = addDays(d, 1)
  }
  return out
}

/** Working days from `from` up to and including `to` (at least one). */
export function workDatesBetween(from: string, to: string, s: Settings): string[] {
  const first = workDates(from, 1, s)[0]
  if (!first) return []
  const out: string[] = []
  let d = first
  while (d <= to) {
    if (isWorkDay(d, s)) out.push(d)
    d = addDays(d, 1)
  }
  return out.length ? out : [first]
}

/** The due date for a task started on `start` using the default allowance. */
export function defaultDue(start: string, s: Settings, days = s.defaultTaskDays): string {
  const dates = workDates(start, Math.max(1, days), s)
  return dates[dates.length - 1] ?? start
}

export const blocksNeeded = (estimateMinutes: number, s: Settings) =>
  Math.max(1, Math.ceil(estimateMinutes / s.blockMinutes))

/** Unplaced blocks (date '') covering a task's estimate. */
export function makeBlocks(task: Task, s: Settings): Block[] {
  const total = blocksNeeded(task.estimateMinutes, s)
  const out: Block[] = []
  let left = task.estimateMinutes
  for (let i = 0; i < total; i++) {
    const minutes = Math.min(s.blockMinutes, Math.max(STEP, left))
    left -= minutes
    out.push({ id: uid(), taskId: task.id, date: '', start: '', minutes, loggedSeconds: 0, done: false })
  }
  return out
}

export const remainingMinutes = (b: Block) =>
  Math.max(0, b.minutes - Math.floor(b.loggedSeconds / 60))

interface Busy {
  from: number
  to: number
}

function busyFor(date: string, blocks: Block[], s: Settings): Busy[] {
  const busy: Busy[] = blocks
    .filter((b) => b.date === date && b.start)
    .map((b) => ({ from: toMin(b.start), to: toMin(b.start) + b.minutes }))
  if (s.lunchMinutes > 0) {
    const from = toMin(s.lunchStart)
    busy.push({ from, to: from + s.lunchMinutes })
  }
  return busy
}

function findSlot(
  date: string,
  minutes: number,
  blocks: Block[],
  s: Settings,
  earliest: number,
): number | null {
  const busy = busyFor(date, blocks, s)
  const end = toMin(s.dayEnd)
  const first = Math.max(toMin(s.dayStart), Math.ceil(earliest / STEP) * STEP)
  for (let t = first; t + minutes <= end; t += STEP) {
    if (!busy.some((b) => t < b.to && t + minutes > b.from)) return t
  }
  return null
}

/**
 * Give every unplaced block a day and time.
 *
 * Each task spreads its blocks across its window (default: 3 working days),
 * most urgent tasks first, so a 3-day task with 3 blocks gets one per day.
 * Anything that cannot fit before its deadline spills past it and is
 * reported by `isLate`.
 */
export function placePending(
  tasks: Task[],
  blocks: Block[],
  s: Settings,
  now: Date = new Date(),
): Block[] {
  if (s.workDays.length === 0) return blocks
  const today = iso(now)
  const result = blocks.map((b) => ({ ...b }))
  const byTask = new Map<string, Block[]>()
  for (const b of result) {
    if (b.date === '' && !b.done) {
      const list = byTask.get(b.taskId) ?? []
      list.push(b)
      byTask.set(b.taskId, list)
    }
  }

  const order = tasks
    .filter((t) => byTask.has(t.id) && !t.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt)

  for (const task of order) {
    const pending = byTask.get(task.id)!
    const from = task.startDate > today ? task.startDate : today
    const window = workDatesBetween(from, task.dueDate, s)
    const overflow = workDates(addDays(window[window.length - 1], 1), OVERFLOW_DAYS, s)
    const W = window.length

    pending.forEach((block, i) => {
      const target = Math.floor((i * W) / pending.length)
      const candidates = [
        ...window.slice(target),
        ...window.slice(0, target),
        ...overflow,
      ]
      for (const date of candidates) {
        const earliest = date === today ? Math.ceil(nowMinutes(now) / STEP) * STEP : 0
        const slot = findSlot(date, block.minutes, result, s, earliest)
        if (slot !== null) {
          block.date = date
          block.start = fromMin(slot)
          return
        }
      }
    })
  }
  return result
}

/**
 * Anything planned for a time that has passed and not finished goes back in
 * the queue, carrying whatever time is still owed. The block currently being
 * timed (`keepId`) is left alone until the timer stops.
 */
export function rollOver(blocks: Block[], now: Date = new Date(), keepId: string | null = null): Block[] {
  const today = iso(now)
  const mins = nowMinutes(now)
  const out: Block[] = []
  for (const b of blocks) {
    const over = b.id !== keepId && b.date !== '' && !b.done && (b.date < today || (b.date === today && toMin(b.start) + b.minutes <= mins))
    if (!over) {
      out.push(b)
      continue
    }
    const logged = Math.floor(b.loggedSeconds / 60)
    if (logged > 0) {
      out.push({ ...b, minutes: logged, done: true, partial: true })
    }
    const owed = b.minutes - logged
    if (owed > 0) {
      out.push({ id: uid(), taskId: b.taskId, date: '', start: '', minutes: owed, loggedSeconds: 0, done: false })
    }
  }
  return out
}

/** Close a block stopped early: keep what was done, re-queue the rest. */
export function splitBlock(block: Block): Block[] {
  const logged = Math.floor(block.loggedSeconds / 60)
  if (logged >= block.minutes) return [{ ...block, done: true }]
  if (logged === 0) return [block]
  return [
    { ...block, minutes: logged, done: true, partial: true },
    { id: uid(), taskId: block.taskId, date: '', start: '', minutes: block.minutes - logged, loggedSeconds: 0, done: false },
  ]
}

export function isLate(block: Block, task: Task | undefined): boolean {
  return !!task && block.date !== '' && !block.done && block.date > task.dueDate
}
