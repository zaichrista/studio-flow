import type { AppData } from '../types'
import { addDays, iso, shortDay } from './dates'

/** Where a task sits on the calendar: "Today 19:00", "Thu 10:00", or that it's waiting for room. */
export function slotLabel(d: AppData, taskId: string): { text: string; blockId: string | null } | null {
  const task = d.tasks.find((t) => t.id === taskId)
  if (!task || task.done) return null
  const open = d.blocks.filter((b) => b.taskId === taskId && !b.done)
  if (open.length === 0) return null
  const placed = open.filter((b) => b.date).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  if (placed.length === 0) return { text: 'Waiting for a slot', blockId: open[0].id }
  const b = placed[0]
  const today = iso()
  const day = b.date === today ? 'Today' : b.date === addDays(today, 1) ? 'Tomorrow' : shortDay(b.date)
  return { text: `${day} ${b.start}`, blockId: b.id }
}

let pending: string | null = null

/** Ask the calendar to open on a block (the task chip's link). */
export const jumpToBlock = (id: string) => {
  pending = id
}

/** The block the calendar was asked to show, once. */
export const takeJump = (): string | null => {
  const id = pending
  pending = null
  return id
}
