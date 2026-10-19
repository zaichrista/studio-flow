import type { AppData, Project, Task , Txn } from '../types'
import { addDays, iso, monday, parseISO } from './dates'

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

/**
 * How long finished tasks really took compared with their plan, from the
 * last few that had time tracked. Null until there are enough to say.
 */
export function estimateRatio(d: AppData, now = Date.now()): { ratio: number; count: number } | null {
  const recent = d.tasks
    .filter((t) => t.done && t.estimateMinutes > 0)
    .map((t) => ({ t, spent: taskSeconds(d, t.id, now) / 60 }))
    .filter((x) => x.spent >= 10)
    .sort((a, b) => b.t.createdAt - a.t.createdAt)
    .slice(0, 8)
  if (recent.length < 3) return null
  const planned = recent.reduce((a, x) => a + x.t.estimateMinutes, 0)
  const spent = recent.reduce((a, x) => a + x.spent, 0)
  const ratio = Math.min(3, Math.max(0.5, spent / planned))
  return { ratio: Math.round(ratio * 10) / 10, count: recent.length }
}

/** When an unpaid invoice is due, and how many days late it is (0 if not yet). */
export function invoiceDue(p: Project, today = iso()): { due: string; late: number } | null {
  if (!p.invoice || p.invoice.paidOn) return null
  const due = addDays(p.invoice.sentOn, p.invoice.termsDays)
  const late = Math.max(0, Math.round((parseISO(today).getTime() - parseISO(due).getTime()) / 86_400_000))
  return { due, late }
}

/** Projects with an invoice out and no payment yet. */
export const awaitingPayment = (d: AppData) => d.projects.filter((p) => p.invoice && !p.invoice.paidOn)

/** Every task finished but no invoice sent: time to bill. */
export const readyToInvoice = (d: AppData, p: Project) => {
  const tasks = d.tasks.filter((t) => t.projectId === p.id)
  return p.pay > 0 && !p.invoice && tasks.length > 0 && tasks.every((t) => t.done)
}

/** The UK tax year (6 April to 5 April) that holds `date`. */
export function taxYear(date = iso()): { from: string; to: string } {
  const y = Number(date.slice(0, 4))
  const start = date >= `${y}-04-06` ? y : y - 1
  return { from: `${start}-04-06`, to: `${start + 1}-04-05` }
}

/** The next Self Assessment payment day (31 January or 31 July). */
export function nextTaxDay(date = iso()): string {
  const y = Number(date.slice(0, 4))
  const days = [`${y}-01-31`, `${y}-07-31`, `${y + 1}-01-31`]
  return days.find((d) => d >= date)!
}

export const daysBetween = (from: string, to: string) =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000)

/** What to keep aside for tax from income between two dates. */
export function taxSetAside(d: AppData, from: string, to: string): number {
  const income = d.txns
    .filter((t) => t.kind === 'income' && t.date >= from && t.date <= to)
    .reduce((a, t) => a + t.amount, 0)
  return Math.round(income * (d.settings.taxPercent / 100) * 100) / 100
}

/** What a client has meant to you: projects, money in, money waiting, time given. */
/** Who a payment belongs to: the client picked for it, or its project's client. */
export function txnClient(d: AppData, t: Txn): string | null {
  if (t.clientId) return t.clientId
  return d.projects.find((p) => p.id === t.projectId)?.clientId ?? null
}

export function clientStats(d: AppData, clientId: string, now = Date.now()) {
  const projects = d.projects.filter((p) => p.clientId === clientId)
  const ids = new Set(projects.map((p) => p.id))
  const theirs = d.txns.filter((t) => txnClient(d, t) === clientId)
  const paid = theirs.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0)
  const spent = theirs.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0)
  const waiting = projects.filter((p) => p.invoice && !p.invoice.paidOn).reduce((a, p) => a + p.pay, 0)
  const seconds = projects.reduce((a, p) => a + projectSeconds(d, p.id, now), 0)
  const openTasks = d.tasks.filter((t) => t.projectId && ids.has(t.projectId) && !t.done).length
  const fees = projects.reduce((a, p) => a + p.pay, 0)
  const rate = seconds / 3600 > 0.05 && fees > 0 ? fees / (seconds / 3600) : null
  return { projects, paid, spent, waiting, seconds, openTasks, rate }
}
