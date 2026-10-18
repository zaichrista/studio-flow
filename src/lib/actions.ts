import type { AppData, Block, Project, SortedDump, Task, Txn } from '../types'
import { iso, nowMinutes, stamp, toMin } from './dates'
import { uid } from './id'
import {
  defaultDue,
  DEFAULT_SETTINGS,
  makeBlocks,
  placePending,
  rollOver,
  splitBlock,
} from './scheduler'

export const PALETTE = ['#9bb3a0', '#d9a88f', '#a9b8cc', '#d8c690', '#c4a9c4', '#b8cbbd']

export const emptyData = (): AppData => ({
  version: 1,
  settings: DEFAULT_SETTINGS,
  projects: [],
  tasks: [],
  blocks: [],
  entries: [],
  active: null,
  txns: [],
  dumps: [],
})

/** Re-queue missed blocks and place everything that is waiting. */
export function replan(d: AppData, now: Date = new Date()): AppData {
  const blocks = placePending(d.tasks, rollOver(d.blocks, now, d.active?.blockId ?? null), d.settings, now)
  return { ...d, blocks }
}

export function addDump(d: AppData, text: string): { data: AppData; id: string } {
  const id = uid()
  return { id, data: { ...d, dumps: [{ id, text, at: Date.now() }, ...d.dumps].slice(0, 50) } }
}

interface NewTask {
  projectId: string | null
  title: string
  subtasks?: string[]
  estimateMinutes?: number
  dueDate?: string
  daysToComplete?: number
}

export function addTask(d: AppData, t: NewTask, now: Date = new Date()): AppData {
  const today = iso(now)
  const subtasks = (t.subtasks ?? []).filter(Boolean).map((title) => ({ id: uid(), title, done: false }))
  const estimate = t.estimateMinutes && t.estimateMinutes > 0
    ? t.estimateMinutes
    : d.settings.blockMinutes * Math.max(1, subtasks.length)
  const dueDate =
    t.dueDate && t.dueDate >= today
      ? t.dueDate
      : defaultDue(today, d.settings, t.daysToComplete ?? d.settings.defaultTaskDays)
  const task: Task = {
    id: uid(),
    projectId: t.projectId,
    title: t.title.trim(),
    subtasks,
    estimateMinutes: estimate,
    startDate: today,
    dueDate,
    done: false,
    createdAt: now.getTime() + d.tasks.length,
  }
  const tasks = [...d.tasks, task]
  const blocks = placePending(tasks, [...d.blocks, ...makeBlocks(task, d.settings)], d.settings, now)
  return { ...d, tasks, blocks }
}

/** Turn the AI's tidy-up of a brain dump into projects, tasks and spending. */
export function applySorted(d: AppData, sorted: SortedDump, now: Date = new Date()): AppData {
  let next = d
  const projects = [...d.projects]

  for (const p of sorted.projects) {
    const name = p.name.trim()
    if (!name) continue
    let project = projects.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!project) {
      project = {
        id: uid(),
        name,
        client: p.client?.trim() ?? '',
        pay: p.pay && p.pay > 0 ? p.pay : 0,
        color: PALETTE[projects.length % PALETTE.length],
        archived: false,
      }
      projects.push(project)
    } else if (p.pay && p.pay > 0 && project.pay === 0) {
      project.pay = p.pay
    }
    next = { ...next, projects: [...projects] }
    for (const t of p.tasks) next = addTask(next, { ...t, projectId: project.id }, now)
  }

  for (const t of sorted.loose ?? []) next = addTask(next, { ...t, projectId: null }, now)

  const txns: Txn[] = (sorted.expenses ?? [])
    .filter((e) => e.amount > 0)
    .map((e) => ({
      id: uid(),
      kind: 'expense',
      amount: e.amount,
      date: iso(now),
      category: e.category?.trim() || 'Other',
      note: e.note,
    }))
  return { ...next, txns: [...next.txns, ...txns] }
}

export type Status = 'todo' | 'doing' | 'done'

export const statusOf = (t: Task): Status => (t.done ? 'done' : t.doing ? 'doing' : 'todo')

/** Move a task between To do, Doing and Done. */
export function setStatus(d: AppData, id: string, status: Status): AppData {
  const tasks = d.tasks.map((t) =>
    t.id === id ? { ...t, done: status === 'done', doing: status === 'doing' } : t,
  )
  // Finished tasks give their unstarted blocks back to the calendar.
  const blocks =
    status === 'done'
      ? d.blocks.filter((b) => b.taskId !== id || b.done || b.loggedSeconds > 0)
      : d.blocks
  const active = status === 'done' && d.active?.taskId === id ? null : d.active
  return { ...d, tasks, blocks, active }
}

export function toggleTask(d: AppData, id: string): AppData {
  const task = d.tasks.find((t) => t.id === id)
  return task ? setStatus(d, id, task.done ? 'todo' : 'done') : d
}

export function toggleSubtask(d: AppData, taskId: string, subId: string): AppData {
  return {
    ...d,
    tasks: d.tasks.map((t) =>
      t.id === taskId
        ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) }
        : t,
    ),
  }
}

export function addSubtask(d: AppData, taskId: string, title: string): AppData {
  return {
    ...d,
    tasks: d.tasks.map((t) =>
      t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: uid(), title, done: false }] } : t,
    ),
  }
}

export function deleteTask(d: AppData, id: string): AppData {
  const active = d.active?.taskId === id ? null : d.active
  return {
    ...d,
    active,
    tasks: d.tasks.filter((t) => t.id !== id),
    blocks: d.blocks.filter((b) => b.taskId !== id),
  }
}

export function saveProject(d: AppData, p: Partial<Project> & { id?: string; name: string }): AppData {
  if (p.id && d.projects.some((x) => x.id === p.id)) {
    return { ...d, projects: d.projects.map((x) => (x.id === p.id ? { ...x, ...p } : x)) }
  }
  const project: Project = {
    id: uid(),
    name: p.name,
    client: p.client ?? '',
    pay: p.pay ?? 0,
    color: p.color ?? PALETTE[d.projects.length % PALETTE.length],
    archived: false,
  }
  return { ...d, projects: [...d.projects, project] }
}

export function deleteProject(d: AppData, id: string): AppData {
  return {
    ...d,
    projects: d.projects.filter((p) => p.id !== id),
    tasks: d.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
  }
}

/** The planned block for this task that is happening around now, if any. */
export function blockForNow(d: AppData, taskId: string, now: Date = new Date()): Block | undefined {
  const today = iso(now)
  const m = nowMinutes(now)
  return d.blocks.find(
    (b) =>
      b.taskId === taskId &&
      b.date === today &&
      !b.done &&
      m >= toMin(b.start) - 20 &&
      m < toMin(b.start) + b.minutes,
  )
}

export function startTimer(d: AppData, taskId: string, blockId?: string | null, now: Date = new Date()): AppData {
  const stopped = d.active ? stopTimer(d, now) : d
  const linked = blockId === undefined ? blockForNow(stopped, taskId, now)?.id ?? null : blockId
  const started = {
    ...stopped,
    tasks: stopped.tasks.map((t) => (t.id === taskId && !t.done ? { ...t, doing: true } : t)),
  }
  return { ...started, active: { taskId, blockId: linked, startedAt: now.getTime() } }
}

export function stopTimer(d: AppData, now: Date = new Date()): AppData {
  const a = d.active
  if (!a) return d
  const end = now.getTime()
  const seconds = Math.max(0, Math.round((end - a.startedAt) / 1000))
  const entries = [...d.entries, { id: uid(), taskId: a.taskId, blockId: a.blockId, start: a.startedAt, end }]
  let blocks = d.blocks
  if (a.blockId) {
    blocks = d.blocks.flatMap((b) =>
      b.id === a.blockId ? splitBlock({ ...b, loggedSeconds: b.loggedSeconds + seconds }) : [b],
    )
  }
  const next = { ...d, active: null, entries, blocks }
  return replan(next, now)
}

export function addTxn(d: AppData, t: Omit<Txn, 'id'>): AppData {
  return { ...d, txns: [{ ...t, id: uid() }, ...d.txns] }
}

export function deleteTxn(d: AppData, id: string): AppData {
  return { ...d, txns: d.txns.filter((t) => t.id !== id) }
}

/** Epoch ms when a block starts. */
export const blockStart = (b: Block) => stamp(b.date, b.start)

