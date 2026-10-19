import type { AppData, Block, CalEvent, Client, DayNote, Idea, Invoice, Project, SortedDump, Task, TaskKind, Txn } from '../types'
import { fromMin, iso, nowMinutes, stamp, toMin, weekday } from './dates'
import { uid } from './id'
import { guessKind } from './kind'
import { parseDump } from './parseDump'
import {
  defaultDue,
  eventsOn,
  DEFAULT_SETTINGS,
  makeBlocks,
  placePending,
  rollOver,
  splitBlock,
  unplaceConflicts,
} from './scheduler'

export const PALETTE = ['#9bb3a0', '#d9a88f', '#a9b8cc', '#d8c690', '#c4a9c4', '#b8cbbd']

export const emptyData = (): AppData => ({
  version: 1,
  settings: DEFAULT_SETTINGS,
  clients: [],
  projects: [],
  tasks: [],
  blocks: [],
  events: [],
  entries: [],
  active: null,
  txns: [],
  dumps: [],
  ideas: [],
  days: {},
})

const closedToday = (d: AppData, now: Date) => d.closedOn === iso(now)

/** Place waiting blocks, keeping a put-away day clear. */
const place = (d: AppData, tasks: Task[], blocks: Block[], now: Date) =>
  placePending(tasks, blocks, d.settings, now, d.events, closedToday(d, now))

/** Re-queue missed blocks and place everything that is waiting. */
export function replan(d: AppData, now: Date = new Date()): AppData {
  const keep = d.active?.blockId ?? null
  const rolled = rollOver(d.blocks, now, keep)
  const clear = unplaceConflicts(rolled, d.settings, d.events, keep)
  return { ...d, blocks: place(d, d.tasks, clear, now) }
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
  firstStep?: string
  kind?: TaskKind
  /** Multiply the estimate by this, to match how long things really take */
  pad?: number
}

/** Admin is quick; without an estimate it gets half an hour rather than a full block. */
const ADMIN_MINUTES = 30

/** Round to the scheduler's 15-minute grid, never below 15. */
const quarter = (m: number) => Math.max(15, Math.round(m / 15) * 15)

export function addTask(d: AppData, t: NewTask, now: Date = new Date()): AppData {
  const today = iso(now)
  const subtasks = (t.subtasks ?? []).filter(Boolean).map((title) => ({ id: uid(), title, done: false }))
  const kind: TaskKind = t.kind && ['focus', 'ideas', 'admin'].includes(t.kind) ? t.kind : guessKind(t.title)
  const planned = t.estimateMinutes && t.estimateMinutes > 0
    ? t.estimateMinutes
    : kind === 'admin' && subtasks.length === 0
      ? Math.min(ADMIN_MINUTES, d.settings.blockMinutes)
      : d.settings.blockMinutes * Math.max(1, subtasks.length)
  const estimate = t.pad && t.pad > 1 ? quarter(planned * t.pad) : planned
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
    ...(t.firstStep?.trim() ? { firstStep: t.firstStep.trim() } : {}),
    kind,
  }
  const tasks = [...d.tasks, task]
  const blocks = place(d, tasks, [...d.blocks, ...makeBlocks(task, d.settings)], now)
  return { ...d, tasks, blocks }
}

/** Turn the AI's tidy-up of a brain dump into projects, tasks and spending. */
export function applySorted(d: AppData, sorted: SortedDump, now: Date = new Date(), pad?: number): AppData {
  let next = d
  const projects = [...d.projects]
  const ideas: Idea[] = []
  const keepIdea = (text: string, projectId: string | null) => {
    if (text.trim()) ideas.push({ id: uid(), text: text.trim(), projectId, at: now.getTime() + ideas.length })
  }

  for (const p of sorted.projects) {
    const name = p.name.trim()
    if (!name) continue
    let project = projects.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!project) {
      const made = p.client?.trim() ? clientNamed(next, p.client) : { data: next, id: null }
      next = made.data
      project = {
        id: uid(),
        name,
        clientId: made.id,
        pay: p.pay && p.pay > 0 ? p.pay : 0,
        color: PALETTE[projects.length % PALETTE.length],
        archived: false,
      }
      projects.push(project)
    } else if (p.pay && p.pay > 0 && project.pay === 0) {
      project.pay = p.pay
    }
    next = { ...next, projects: [...projects] }
    for (const t of p.tasks) next = addTask(next, { ...t, projectId: project.id, pad }, now)
    for (const i of p.ideas ?? []) keepIdea(i, project.id)
  }

  for (const t of sorted.loose ?? []) next = addTask(next, { ...t, projectId: null, pad }, now)
  for (const i of sorted.ideas ?? []) keepIdea(i, null)

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
  return { ...next, txns: [...next.txns, ...txns], ideas: [...ideas.reverse(), ...next.ideas] }
}

export function deleteIdea(d: AppData, id: string): AppData {
  return { ...d, ideas: d.ideas.filter((i) => i.id !== id) }
}

/** An idea grows up: it becomes a task on the calendar and leaves the bin. */
export function ideaToTask(d: AppData, id: string, now: Date = new Date()): AppData {
  const idea = d.ideas.find((i) => i.id === id)
  if (!idea) return d
  return deleteIdea(addTask(d, { projectId: idea.projectId, title: idea.text }, now), id)
}

/** Edit the small bits of a task: its first step, where you were up to. */
export function patchTask(d: AppData, id: string, patch: Partial<Pick<Task, 'firstStep' | 'resumeNote' | 'title' | 'kind' | 'projectId'>>): AppData {
  const next = { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
  if (!patch.kind) return next
  // A new kind may want a different part of the day: move its untouched blocks.
  const blocks = next.blocks.map((b) =>
    b.taskId === id && !b.done && b.loggedSeconds === 0 && b.id !== d.active?.blockId ? { ...b, date: '', start: '' } : b,
  )
  return replan({ ...next, blocks })
}

/**
 * Put it down from anywhere: sort with the built-in rules and place it,
 * no review step. (The Dump page still offers the careful version.)
 */
export function quickCapture(d: AppData, text: string, now: Date = new Date()): AppData {
  return applySorted(addDump(d, text).data, parseDump(text, now), now)
}

/** Not now: this block moves to the next free slot at least `minutes` from now. */
export function snoozeBlock(d: AppData, id: string, now: Date = new Date(), minutes = 60): AppData {
  const after = now.getTime() + minutes * 60_000
  const blocks = d.blocks.map((b) => (b.id === id ? { ...b, date: '', start: '', after } : b))
  return replan({ ...d, blocks }, now)
}

export type Status = 'todo' | 'doing' | 'done'

export const statusOf = (t: Task): Status => (t.done ? 'done' : t.doing ? 'doing' : 'todo')

/** Move a task between To do, Doing and Done. */
export function setStatus(d: AppData, id: string, status: Status): AppData {
  const tasks = d.tasks.map((t) =>
    t.id === id
      ? { ...t, done: status === 'done', doing: status === 'doing', doneAt: status === 'done' ? (t.done ? t.doneAt : Date.now()) : undefined }
      : t,
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
        ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done, doneAt: s.done ? undefined : Date.now() } : s)) }
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
    clientId: p.clientId ?? null,
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

export function startTimer(d: AppData, taskId: string, blockId?: string | null, now: Date = new Date(), trial?: number): AppData {
  const stopped = d.active ? stopTimer(d, now) : d
  const linked = blockId === undefined ? blockForNow(stopped, taskId, now)?.id ?? null : blockId
  const started = {
    ...stopped,
    tasks: stopped.tasks.map((t) => (t.id === taskId && !t.done ? { ...t, doing: true } : t)),
  }
  return { ...started, active: { taskId, blockId: linked, startedAt: now.getTime(), ...(trial ? { trial } : {}) } }
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


/** Add or change a fixed event; work that now clashes with it moves aside. */
export function saveEvent(d: AppData, e: Omit<CalEvent, 'id'> & { id?: string }): AppData {
  const event: CalEvent = { ...e, id: e.id ?? uid() }
  const events = d.events.some((x) => x.id === event.id)
    ? d.events.map((x) => (x.id === event.id ? event : x))
    : [...d.events, event]
  return replan({ ...d, events })
}

/**
 * Put a work block exactly where it was dropped. Fixed time (events, breaks)
 * and the past can't be taken, so those return a reason instead. Other work
 * already there steps aside to the next free slot.
 */
export function moveBlock(
  d: AppData,
  id: string,
  date: string,
  start: number,
  now: Date = new Date(),
): { data: AppData } | { reason: string } {
  const block = d.blocks.find((b) => b.id === id)
  if (!block) return { reason: 'That block has gone.' }
  const end = start + block.minutes
  const today = iso(now)
  if (date < today || (date === today && start < nowMinutes(now))) return { reason: "That time has already passed." }
  if (end > 24 * 60) return { reason: "That would run past midnight." }
  const clash = eventsOn(d.events, date).find((o) => start < o.to && end > o.from)
  if (clash) return { reason: `That time belongs to ${clash.event.title}.` }
  const rest = d.settings.breaks.find((b) => b.minutes > 0 && start < toMin(b.start) + b.minutes && end > toMin(b.start))
  if (rest) return { reason: `That's your ${rest.name.toLowerCase()}.` }
  const keep = d.active?.blockId ?? null
  const blocks = d.blocks.map((b) => {
    if (b.id === id) return { ...b, date, start: fromMin(start), after: undefined }
    // Whatever was in the way moves on, unless it's underway.
    const inWay = b.date === date && !b.done && b.id !== keep && b.loggedSeconds === 0 &&
      toMin(b.start) < end && toMin(b.start) + b.minutes > start
    return inWay ? { ...b, date: '', start: '' } : b
  })
  return { data: replan({ ...d, blocks }, now) }
}

/**
 * Move one occurrence of an event (or stretch it). A one-off simply moves; a
 * repeating event moves every repeat, swapping the weekday if it changed days.
 */
export function moveEvent(d: AppData, id: string, fromDate: string, toDate: string, start: number, end: number): AppData {
  const e = d.events.find((x) => x.id === id)
  if (!e) return d
  const times = { start: fromMin(start), end: fromMin(Math.min(end, 24 * 60 - 1)) }
  if (e.repeatDays.length === 0) return saveEvent(d, { ...e, ...times, date: toDate })
  const was = weekday(fromDate)
  const now = weekday(toDate)
  const repeatDays = was === now ? e.repeatDays : [...new Set(e.repeatDays.map((n) => (n === was ? now : n)))]
  return saveEvent(d, { ...e, ...times, repeatDays })
}

export function deleteEvent(d: AppData, id: string): AppData {
  return replan({ ...d, events: d.events.filter((e) => e.id !== id) })
}


/** The invoice has gone out. */
export function sendInvoice(d: AppData, projectId: string, invoice: Omit<Invoice, 'paidOn'>): AppData {
  return { ...d, projects: d.projects.map((p) => (p.id === projectId ? { ...p, invoice } : p)) }
}

export function unsendInvoice(d: AppData, projectId: string): AppData {
  return {
    ...d,
    projects: d.projects.map((p) => (p.id === projectId ? { ...p, invoice: undefined } : p)),
    txns: d.txns.filter((t) => !(t.projectId === projectId && t.kind === 'income' && t.category === 'Client work')),
  }
}

/** The money landed: mark it paid and record the income in Money. */
export function markPaid(d: AppData, projectId: string, date: string = iso()): AppData {
  const p = d.projects.find((x) => x.id === projectId)
  if (!p) return d
  const invoice: Invoice = { sentOn: p.invoice?.sentOn ?? date, termsDays: p.invoice?.termsDays ?? 14, paidOn: date }
  const withPaid = { ...d, projects: d.projects.map((x) => (x.id === projectId ? { ...x, invoice } : x)) }
  if (p.pay <= 0) return withPaid
  return addTxn(withPaid, { kind: 'income', amount: p.pay, date, category: 'Client work', note: p.name, projectId })
}

/**
 * Put the day away: anything still planned for later today moves to another
 * day, and nothing new lands on today.
 */
export function closeDay(d: AppData, now: Date = new Date()): AppData {
  const today = iso(now)
  const keep = d.active?.blockId ?? null
  const blocks = d.blocks.map((b) =>
    b.date === today && !b.done && b.loggedSeconds === 0 && b.id !== keep ? { ...b, date: '', start: '' } : b,
  )
  const put = setDayNote({ ...d, blocks, closedOn: today }, today, { closedAt: now.getTime() })
  return put.active ? stopTimer(put, now) : replan(put, now)
}

/** Changed your mind: today is open for work again. */
export function reopenDay(d: AppData, now: Date = new Date()): AppData {
  return replan({ ...d, closedOn: undefined }, now)
}

/** Write the day's intention or good thing. Empty text clears it. */
export function setDayNote(d: AppData, date: string, patch: Partial<DayNote>): AppData {
  const note: DayNote = { ...d.days[date], ...patch }
  for (const k of Object.keys(note) as (keyof DayNote)[]) {
    const v = note[k]
    if (v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)) delete note[k]
  }
  const days = { ...d.days }
  if (Object.keys(note).length) days[date] = note
  else delete days[date]
  return { ...d, days }
}

/** Tick or untick one little act of care for today. */
export function toggleCare(d: AppData, date: string, key: string): AppData {
  const care = d.days[date]?.care ?? []
  return setDayNote(d, date, { care: care.includes(key) ? care.filter((c) => c !== key) : [...care, key] })
}

/** The client with this name (any case), made if it doesn't exist yet. */
export function clientNamed(d: AppData, name: string): { data: AppData; id: string } {
  const clean = name.trim()
  const found = d.clients.find((c) => c.name.toLowerCase() === clean.toLowerCase())
  if (found) return { data: d, id: found.id }
  const client: Client = { id: uid(), name: clean, email: '', notes: '', color: PALETTE[(d.clients.length + 2) % PALETTE.length] }
  return { data: { ...d, clients: [...d.clients, client] }, id: client.id }
}

export function saveClient(d: AppData, c: Partial<Client> & { name: string; id?: string }): { data: AppData; id: string } {
  if (c.id && d.clients.some((x) => x.id === c.id)) {
    return { data: { ...d, clients: d.clients.map((x) => (x.id === c.id ? { ...x, ...c } : x)) }, id: c.id }
  }
  const made = clientNamed(d, c.name)
  return { data: { ...made.data, clients: made.data.clients.map((x) => (x.id === made.id ? { ...x, ...c, id: made.id } : x)) }, id: made.id }
}

/** Remove a client; their projects stay, without a client. */
export function deleteClient(d: AppData, id: string): AppData {
  return {
    ...d,
    clients: d.clients.filter((c) => c.id !== id),
    projects: d.projects.map((p) => (p.clientId === id ? { ...p, clientId: null } : p)),
  }
}

/**
 * Change a task after the fact. A new estimate or due date re-plans the
 * blocks that haven't been started; time already worked stays where it is.
 */
export function editTask(
  d: AppData,
  id: string,
  patch: { title?: string; estimateMinutes?: number; dueDate?: string },
  now: Date = new Date(),
): AppData {
  const task = d.tasks.find((t) => t.id === id)
  if (!task) return d
  const next: Task = {
    ...task,
    ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
    ...(patch.estimateMinutes && patch.estimateMinutes > 0 ? { estimateMinutes: quarter(patch.estimateMinutes) } : {}),
    ...(patch.dueDate ? { dueDate: patch.dueDate } : {}),
  }
  const tasks = d.tasks.map((t) => (t.id === id ? next : t))
  const replanBlocks = next.estimateMinutes !== task.estimateMinutes || next.dueDate !== task.dueDate
  if (!replanBlocks || task.done) return { ...d, tasks }
  const keep = d.active?.blockId ?? null
  const fixed = d.blocks.filter((b) => b.taskId !== id || b.done || b.loggedSeconds > 0 || b.id === keep)
  const worked = fixed.filter((b) => b.taskId === id).reduce((a, b) => a + (b.done ? b.minutes : Math.floor(b.loggedSeconds / 60)), 0)
  const owed = next.estimateMinutes - worked
  const fresh = owed >= 15 ? makeBlocks({ ...next, estimateMinutes: owed }, d.settings) : []
  return replan({ ...d, tasks, blocks: [...fixed, ...fresh] }, now)
}

export function renameSubtask(d: AppData, taskId: string, subId: string, title: string): AppData {
  return {
    ...d,
    tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, title } : s)) } : t)),
  }
}

export function deleteSubtask(d: AppData, taskId: string, subId: string): AppData {
  return { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t)) }
}
