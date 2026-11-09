import type { Block, CalEvent, Lane, Settings, Task } from '../types'
import { addDays, fromMin, iso, monday, nowMinutes, toMin, weekday } from './dates'
import { uid } from './id'
import { kindOf, preferredWindow } from './kind'

const STEP = 15
/** How far past a deadline we'll look for room before giving up */
const OVERFLOW_DAYS = 60

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  why: '',
  hasJob: true,
  workDays: [1, 2, 3, 4, 5],
  dayStart: '09:00',
  dayEnd: '17:00',
  eveningStart: '19:00',
  eveningEnd: '21:30',
  weekendWork: true,
  weekendStart: '10:00',
  weekendEnd: '17:00',
  tone: 'firm',
  budget: { takeHome: 0, payDay: 25, rent: 0, bills: [], savings: 0 },
  breaks: [
    { id: 'lunch', name: 'Lunch', start: '13:00', minutes: 60 },
    { id: 'dinner', name: 'Dinner', start: '18:00', minutes: 60 },
  ],
  defaultTaskDays: 3,
  blockMinutes: 60,
  bufferMinutes: 10,
  maxWeekHours: 0,
  headsUpMinutes: 10,
  wrapUpMinutes: 5,
  progressMinutes: 15,
  shutdownNudge: true,
  clearest: 'morning',
  splash: 'always',
  taxPercent: 25,
  workerUrl: '',
  appToken: '',
  look: { nav: 'auto', density: 'cozy', palette: 'blush', today: 'focus', week: 'grid', board: 'columns', surface: 'soft', theme: 'sun', sky: true },
}

export const isWorkDay = (date: string, s: Settings) => s.workDays.includes(weekday(date))

export const laneOf = (t: Pick<Task, 'lane'> | undefined | null): Lane => t?.lane ?? 'freelance'

export interface Win {
  from: number
  to: number
}

/**
 * The stretches of a day a lane's work may be placed in, as minutes from
 * midnight. With a day job, 9–5 is the job's and freelance gets weeknights and
 * (optionally) days off. Without one there is a single work day.
 */
export function windowsOn(date: string, s: Settings, lane: Lane): Win[] {
  const job = isWorkDay(date, s)
  const day = { from: toMin(s.dayStart), to: toMin(s.dayEnd) }
  if (!s.hasJob || lane === 'job') return job ? [day] : []
  if (job) return toMin(s.eveningEnd) > toMin(s.eveningStart) ? [{ from: toMin(s.eveningStart), to: toMin(s.eveningEnd) }] : []
  return s.weekendWork && toMin(s.weekendEnd) > toMin(s.weekendStart) ? [{ from: toMin(s.weekendStart), to: toMin(s.weekendEnd) }] : []
}

/** Every window on a day, job and freelance together, earliest first. */
export function allWindows(date: string, s: Settings): Win[] {
  const lanes: Lane[] = s.hasJob ? ['job', 'freelance'] : ['job']
  return lanes.flatMap((l) => windowsOn(date, s, l)).sort((a, b) => a.from - b.from)
}

/** The minute the last stretch of work ends that day, or null on a day off. */
export function lastWindowEnd(date: string, s: Settings): number | null {
  const w = allWindows(date, s)
  return w.length ? w[w.length - 1].to : null
}

export const hasWindow = (date: string, s: Settings, lane: Lane) => windowsOn(date, s, lane).length > 0

/** The first `count` days with room for this lane's work on or after `from`. */
export function workDates(from: string, count: number, s: Settings, lane: Lane = 'job'): string[] {
  const out: string[] = []
  let d = from
  for (let guard = 0; out.length < count && guard < 400; guard++) {
    if (hasWindow(d, s, lane)) out.push(d)
    d = addDays(d, 1)
  }
  return out
}

/** Days with room from `from` up to and including `to` (at least one, unless there are none). */
export function workDatesBetween(from: string, to: string, s: Settings, lane: Lane = 'job'): string[] {
  const first = workDates(from, 1, s, lane)[0]
  if (!first) return []
  const out: string[] = []
  let d = first
  while (d <= to) {
    if (hasWindow(d, s, lane)) out.push(d)
    d = addDays(d, 1)
  }
  return out.length ? out : [first]
}

/** The due date for a task started on `start` using the default allowance. */
export function defaultDue(start: string, s: Settings, days = s.defaultTaskDays, lane: Lane = 'job'): string {
  const dates = workDates(start, Math.max(1, days), s, lane)
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

/** Occurrences of fixed events on one day, as minutes from midnight. */
export function eventsOn(events: CalEvent[], date: string): { event: CalEvent; from: number; to: number }[] {
  const out: { event: CalEvent; from: number; to: number }[] = []
  for (const e of events) {
    const happens = e.repeatDays.length
      ? e.repeatDays.includes(weekday(date)) && date >= e.date && (!e.until || date <= e.until)
      : e.date === date
    if (happens && toMin(e.end) > toMin(e.start)) out.push({ event: e, from: toMin(e.start), to: toMin(e.end) })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** Everything that already owns time on this day apart from work blocks. */
export function fixedBusy(date: string, s: Settings, events: CalEvent[]): Busy[] {
  const busy: Busy[] = eventsOn(events, date).map(({ from, to }) => ({ from, to }))
  for (const b of s.breaks) {
    if (b.minutes > 0) busy.push({ from: toMin(b.start), to: toMin(b.start) + b.minutes })
  }
  return busy
}

/**
 * Time already taken on a day. Work blocks and events keep a little breathing
 * room around them (`bufferMinutes`); breaks are rest already, so they don't.
 */
function busyFor(date: string, blocks: Block[], s: Settings, events: CalEvent[]): Busy[] {
  const pad = Math.max(0, s.bufferMinutes ?? 0)
  const busy = blocks
    .filter((b) => b.date === date && b.start)
    .map((b) => ({ from: toMin(b.start) - pad, to: toMin(b.start) + b.minutes + pad }))
  const fixed = eventsOn(events, date).map(({ from, to }) => ({ from: from - pad, to: to + pad }))
  const rest = s.breaks
    .filter((b) => b.minutes > 0)
    .map((b) => ({ from: toMin(b.start), to: toMin(b.start) + b.minutes }))
  return [...busy, ...fixed, ...rest]
}

/**
 * Minutes of work blocks and shifts in the Monday–Sunday week holding `date`.
 * Given the tasks, job blocks are left out: the weekly limit is about your own time.
 */
export function weekLoad(date: string, blocks: Block[], events: CalEvent[], tasks?: Task[]): number {
  const from = monday(date)
  const to = addDays(from, 6)
  const mine = (b: Block) => !tasks || laneOf(tasks.find((t) => t.id === b.taskId)) !== 'job'
  let total = blocks
    .filter((b) => b.date >= from && b.date <= to && mine(b))
    .reduce((n, b) => n + b.minutes, 0)
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const o of eventsOn(events, d)) if (o.event.kind === 'shift') total += o.to - o.from
  }
  return total
}

function findSlot(
  date: string,
  minutes: number,
  blocks: Block[],
  s: Settings,
  earliest: number,
  events: CalEvent[],
  prefer: { from: number; to: number } | null = null,
  lane: Lane = 'job',
): number | null {
  const busy = busyFor(date, blocks, s, events)
  const free = (t: number) => !busy.some((b) => t < b.to && t + minutes > b.from)
  for (const win of windowsOn(date, s, lane)) {
    const first = Math.max(win.from, Math.ceil(earliest / STEP) * STEP)
    // The preferred part of the day first, then anywhere that fits.
    if (prefer) {
      for (let t = Math.max(first, Math.ceil(prefer.from / STEP) * STEP); t + minutes <= Math.min(win.to, prefer.to); t += STEP) {
        if (free(t)) return t
      }
    }
    for (let t = first; t + minutes <= win.to; t += STEP) {
      if (free(t)) return t
    }
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
  events: CalEvent[] = [],
  /** The day has been put away: nothing new lands on it */
  closedToday = false,
): Block[] {
  const cap = (s.maxWeekHours ?? 0) * 60
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
    const lane = laneOf(task)
    // With a day job, freelance fills evenings and weekends; the clearest-hours preference is for the job day.
    const prefer = s.hasJob && lane === 'freelance' ? null : preferredWindow(kindOf(task), s)
    const from = task.startDate > today ? task.startDate : today
    const window = workDatesBetween(from, task.dueDate, s, lane)
    if (window.length === 0) continue
    const overflow = workDates(addDays(window[window.length - 1], 1), OVERFLOW_DAYS, s, lane)
    const W = window.length

    pending.forEach((block, i) => {
      const target = Math.floor((i * W) / pending.length)
      const candidates = [
        ...window.slice(target),
        ...window.slice(0, target),
        ...overflow,
      ]
      for (const date of candidates) {
        if (closedToday && date === today) continue
        if (lane === 'freelance' && cap > 0 && weekLoad(date, result, events, tasks) + block.minutes > cap) continue
        let earliest = date === today ? Math.ceil(nowMinutes(now) / STEP) * STEP : 0
        // "Not now": nothing before the moment it was pushed back to.
        if (block.after) {
          const wait = new Date(block.after)
          const waitDay = iso(wait)
          if (date < waitDay) continue
          if (date === waitDay) earliest = Math.max(earliest, nowMinutes(wait))
        }
        const slot = findSlot(date, block.minutes, result, s, earliest, events, prefer, lane)
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
/** Blocks whose time has passed without a minute being worked on them. */
export function missedBlocks(blocks: Block[], now: Date = new Date(), keepId: string | null = null): Block[] {
  const today = iso(now)
  const mins = nowMinutes(now)
  return blocks.filter(
    (b) =>
      b.id !== keepId &&
      b.date !== '' &&
      !b.done &&
      b.loggedSeconds === 0 &&
      (b.date < today || (b.date === today && toMin(b.start) + b.minutes <= mins)),
  )
}

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

/**
 * Blocks that now overlap a break or a fixed event (one was just added, or a
 * break was moved) go back in the queue. The block being timed stays put.
 */
export function unplaceConflicts(
  blocks: Block[],
  s: Settings,
  events: CalEvent[],
  keepId: string | null = null,
): Block[] {
  return blocks.map((b) => {
    if (!b.date || b.done || b.id === keepId || b.loggedSeconds > 0) return b
    const from = toMin(b.start)
    const to = from + b.minutes
    const hit = fixedBusy(b.date, s, events).some((x) => from < x.to && to > x.from)
    return hit ? { ...b, date: '', start: '' } : b
  })
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
