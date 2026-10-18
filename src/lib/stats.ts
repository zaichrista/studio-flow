import type { AppData, Project, Task } from '../types'
import { addDays, iso, monday } from './dates'

const secs = (e: { start: number; end: number }) => Math.max(0, Math.round((e.end - e.start) / 1000))

export function activeSeconds(d: AppData, now = Date.now()): number {
  return d.active ? Math.max(0, Math.round((now - d.active.startedAt) / 1000)) : 0
}

export function taskSeconds(d: AppData, taskId: string, now = Date.now()): number {
  const logged = d.entries.filter((e) => e.taskId === taskId).reduce((a, e) => a + secs(e), 0)
  return logged + (d.active?.taskId === taskId ? activeSeconds(d, now) : 0)
}

export function projectSeconds(d: AppData, projectId: string, now = Date.now()): number {
  return d.tasks
    .filter((t) => t.projectId === projectId)
    .reduce((a, t) => a + taskSeconds(d, t.id, now), 0)
}

export function secondsOn(d: AppData, from: string, to: string, now = Date.now()): number {
  const inRange = (ms: number) => {
    const day = iso(new Date(ms))
    return day >= from && day <= to
  }
  const logged = d.entries.filter((e) => inRange(e.start)).reduce((a, e) => a + secs(e), 0)
  return logged + (d.active && inRange(d.active.startedAt) ? activeSeconds(d, now) : 0)
}

export const secondsToday = (d: AppData, now = Date.now()) =>
  secondsOn(d, iso(new Date(now)), iso(new Date(now)), now)

export function secondsThisWeek(d: AppData, now = Date.now()): number {
  const start = monday(iso(new Date(now)))
  return secondsOn(d, start, addDays(start, 6), now)
}

export function counts(d: AppData) {
  const open = d.tasks.filter((t) => !t.done)
  const subsOpen = open.reduce((a, t) => a + t.subtasks.filter((s) => !s.done).length, 0)
  return {
    tasksOpen: open.length,
    tasksDone: d.tasks.length - open.length,
    subtasksOpen: subsOpen,
    subtasksTotal: d.tasks.reduce((a, t) => a + t.subtasks.length, 0),
    subtasksDone: d.tasks.reduce((a, t) => a + t.subtasks.filter((s) => s.done).length, 0),
  }
}

export function taskProgress(t: Task): number {
  if (t.done) return 1
  if (t.subtasks.length === 0) return 0
  return t.subtasks.filter((s) => s.done).length / t.subtasks.length
}

/** What a project really pays per hour of tracked time, or null before any time is tracked. */
export function effectiveRate(d: AppData, p: Project, now = Date.now()): number | null {
  const hours = projectSeconds(d, p.id, now) / 3600
  return hours > 0.05 && p.pay > 0 ? p.pay / hours : null
}

export function monthSummary(d: AppData, month: string) {
  const rows = d.txns.filter((t) => t.date.startsWith(month))
  const income = rows.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const expense = rows.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0)
  const byCategory = new Map<string, number>()
  for (const t of rows.filter((t) => t.kind === 'expense')) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount)
  }
  return {
    rows,
    income,
    expense,
    net: income - expense,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  }
}

export const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n)
