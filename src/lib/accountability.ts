import type { AppData } from '../types'
import { addDays, iso, monday, nowMinutes, toMin } from './dates'
import { windowsOn } from './scheduler'
import { secondsThisWeek } from './stats'
import { dueLine } from './tone'

export interface DayRecord {
  date: string
  /** Blocks on the calendar that day, plus the ones that were missed */
  planned: number
  /** Done, or at least begun */
  started: number
  missed: number
}

const begun = (d: AppData, b: AppData['blocks'][number]) => b.done || b.loggedSeconds > 0 || d.active?.blockId === b.id

export function dayRecord(d: AppData, date: string): DayRecord {
  const blocks = d.blocks.filter((b) => b.date === date)
  const missed = (d.misses ?? []).filter((m) => m.date === date).length
  return { date, planned: blocks.length + missed, started: blocks.filter((b) => begun(d, b)).length, missed }
}

/** Past days in a row with something planned where every block was started. Rest days are skipped. */
export function streak(d: AppData, today = iso()): number {
  let n = 0
  for (let i = 1; i <= 60; i++) {
    const r = dayRecord(d, addDays(today, -i))
    if (r.planned === 0) continue
    if (r.missed > 0 || r.started < r.planned) break
    n++
  }
  return n
}

export interface Score {
  today: DayRecord
  missedWeek: number
  streak: number
  /** Minutes planned so far this week (done, begun or missed) against minutes actually worked */
  promised: number
  worked: number
}

export function scoreboard(d: AppData, now: Date = new Date()): Score {
  const today = iso(now)
  const from = monday(today)
  const to = addDays(from, 6)
  const mins = nowMinutes(now)
  const past = (date: string, start: string) => date < today || (date === today && toMin(start) <= mins)
  const promisedBlocks = d.blocks
    .filter((b) => b.date >= from && b.date <= to && (b.done || b.loggedSeconds > 0 || past(b.date, b.start)))
    .reduce((a, b) => a + b.minutes, 0)
  const missed = (d.misses ?? []).filter((m) => m.date >= from && m.date <= to)
  return {
    today: dayRecord(d, today),
    missedWeek: missed.length,
    streak: streak(d, today),
    promised: promisedBlocks + missed.reduce((a, m) => a + m.minutes, 0),
    worked: Math.round(secondsThisWeek(d, now.getTime()) / 60),
  }
}

export interface Status {
  /** 0 = on time, 1 = a little late, 2 = properly late */
  level: 0 | 1 | 2
  text: string
  blockId: string
  taskId: string
}

/** The block that should be under way right now but hasn't been started, said in the chosen tone. */
export function status(d: AppData, now: Date = new Date()): Status | null {
  if (d.active) return null
  const today = iso(now)
  const mins = nowMinutes(now)
  const b = d.blocks
    .filter((x) => x.date === today && !x.done && x.loggedSeconds === 0 && toMin(x.start) <= mins && toMin(x.start) + x.minutes > mins)
    .sort((a, c) => a.start.localeCompare(c.start))[0]
  if (!b) return null
  const task = d.tasks.find((t) => t.id === b.taskId)
  if (!task) return null
  const late = mins - toMin(b.start)
  return { level: late >= 15 ? 2 : late >= 5 ? 1 : 0, text: dueLine(d.settings.tone, task.title, late), blockId: b.id, taskId: b.taskId }
}

/** True while the job day is on and nothing is planned or running. */
export function idleOnTheClock(d: AppData, now: Date = new Date()): boolean {
  if (d.active || !d.settings.hasJob) return false
  const today = iso(now)
  const m = nowMinutes(now)
  const inJob = windowsOn(today, d.settings, 'job').some((w) => m >= w.from && m < w.to)
  return inJob && !d.blocks.some((b) => b.date === today && !b.done && toMin(b.start) + b.minutes > m)
}

/** The task ids promised today, and how many of them are done (finished, or all today's blocks done). */
export function mustsToday(d: AppData, today = iso()): { ids: string[]; kept: number } {
  const ids = (d.days[today]?.musts ?? []).filter((id) => d.tasks.some((t) => t.id === id))
  const kept = ids.filter((id) => {
    const t = d.tasks.find((x) => x.id === id)!
    if (t.done) return true
    const mine = d.blocks.filter((b) => b.taskId === id && b.date === today)
    return mine.length > 0 && mine.every((b) => b.done)
  }).length
  return { ids, kept }
}
