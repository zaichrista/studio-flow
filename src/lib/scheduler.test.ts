import { describe, expect, it } from 'vitest'
import type { CalEvent, Task } from '../types'
import {
  DEFAULT_SETTINGS as S,
  defaultDue,
  eventsOn,
  makeBlocks,
  placePending,
  rollOver,
  splitBlock,
  unplaceConflicts,
  workDates,
} from './scheduler'

// Monday 2026-10-19, 08:00 local
const monday8 = new Date(2026, 9, 19, 8, 0)

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  projectId: null,
  title: 'Logo',
  subtasks: [],
  estimateMinutes: 180,
  startDate: '2026-10-19',
  dueDate: '2026-10-21',
  done: false,
  createdAt: 1,
  ...over,
})

describe('work dates', () => {
  it('skips the weekend', () => {
    expect(workDates('2026-10-23', 3, S)).toEqual(['2026-10-23', '2026-10-26', '2026-10-27'])
  })
  it('gives tasks three working days by default', () => {
    expect(defaultDue('2026-10-22', S)).toBe('2026-10-26')
  })
  it('respects custom work days', () => {
    const s = { ...S, workDays: [2, 4] }
    expect(workDates('2026-10-19', 2, s)).toEqual(['2026-10-20', '2026-10-22'])
  })
})

describe('placement', () => {
  it('splits a 3 hour task into 60 minute blocks, one per day', () => {
    const t = task()
    const blocks = placePending([t], makeBlocks(t, S), S, monday8)
    expect(blocks.map((b) => [b.date, b.start, b.minutes])).toEqual([
      ['2026-10-19', '09:00', 60],
      ['2026-10-20', '09:00', 60],
      ['2026-10-21', '09:00', 60],
    ])
  })

  it('never overlaps lunch or other blocks', () => {
    const a = task({ id: 'a', estimateMinutes: 480, dueDate: '2026-10-19' })
    const placed = placePending([a], makeBlocks(a, S), S, monday8)
    const starts = placed.filter((b) => b.date === '2026-10-19').map((b) => b.start)
    expect(starts).not.toContain('13:00')
    for (const p of placed.filter((b) => b.date === '2026-10-19')) {
      expect(p.start >= '13:00' && p.start < '14:00').toBe(false)
    }
  })

  it('does not schedule into the past today', () => {
    const t = task({ estimateMinutes: 60, dueDate: '2026-10-19' })
    const now = new Date(2026, 9, 19, 10, 20)
    const [b] = placePending([t], makeBlocks(t, S), S, now)
    expect(b.date).toBe('2026-10-19')
    expect(b.start).toBe('10:30')
  })

  it('moves to the next working day when today is full or a rest day', () => {
    const t = task({ startDate: '2026-10-24', dueDate: '2026-10-26', estimateMinutes: 60 })
    const sat = new Date(2026, 9, 24, 9, 0)
    const [b] = placePending([t], makeBlocks(t, S), S, sat)
    expect(b.date).toBe('2026-10-26')
  })

  it('spills past the deadline instead of dropping work', () => {
    const t = task({ estimateMinutes: 60 * 9, dueDate: '2026-10-19' })
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    expect(placed.every((b) => b.date !== '')).toBe(true)
    expect(placed.some((b) => b.date > '2026-10-19')).toBe(true)
  })

  it('schedules the most urgent task first', () => {
    const urgent = task({ id: 'u', estimateMinutes: 60, dueDate: '2026-10-19', createdAt: 2 })
    const later = task({ id: 'l', estimateMinutes: 60, dueDate: '2026-10-21', createdAt: 1 })
    const placed = placePending([later, urgent], [...makeBlocks(later, S), ...makeBlocks(urgent, S)], S, monday8)
    expect(placed.find((b) => b.taskId === 'u')!.start).toBe('09:00')
  })
})

describe('partial blocks', () => {
  it('stopping at 45 of 60 keeps 45 and re-queues 15', () => {
    const t = task({ estimateMinutes: 60 })
    const [b] = placePending([t], makeBlocks(t, S), S, monday8)
    const [kept, rest] = splitBlock({ ...b, loggedSeconds: 45 * 60 })
    expect(kept).toMatchObject({ minutes: 45, done: true, partial: true })
    expect(rest).toMatchObject({ minutes: 15, date: '', done: false })
  })

  it('a full hour just completes the block', () => {
    const t = task({ estimateMinutes: 60 })
    const [b] = placePending([t], makeBlocks(t, S), S, monday8)
    expect(splitBlock({ ...b, loggedSeconds: 3600 })).toHaveLength(1)
  })

  it('never re-queues the block that is being timed', () => {
    const t = task({ estimateMinutes: 60 })
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    const rolled = rollOver(placed, new Date(2026, 9, 19, 15, 0), placed[0].id)
    expect(rolled).toEqual(placed)
  })

  it('missed blocks roll over with the time still owed', () => {
    const t = task({ estimateMinutes: 60 })
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    const rolled = rollOver(placed, new Date(2026, 9, 19, 15, 0))
    expect(rolled).toHaveLength(1)
    expect(rolled[0]).toMatchObject({ date: '', minutes: 60 })
    const again = placePending([t], rolled, S, new Date(2026, 9, 19, 15, 0))
    expect(again[0]).toMatchObject({ date: '2026-10-19', start: '15:00' })
  })
})

const shift = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  title: 'Café shift',
  kind: 'shift',
  date: '2026-10-19',
  start: '09:00',
  end: '15:00',
  repeatDays: [],
  until: '',
  ...over,
})

const overlaps = (a: { start: string; minutes: number }, from: string, to: string) => {
  const [h, m] = a.start.split(':').map(Number)
  const s0 = h * 60 + m
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return s0 < th * 60 + tm && s0 + a.minutes > fh * 60 + fm
}

describe('breaks', () => {
  it('keeps dinner free when the working day runs late', () => {
    const late = { ...S, dayEnd: '21:00' }
    const t = task({ estimateMinutes: 60 * 12, dueDate: '2026-10-19' })
    const placed = placePending([t], makeBlocks(t, late), late, monday8)
    const today = placed.filter((b) => b.date === '2026-10-19')
    expect(today.length).toBeGreaterThan(8)
    expect(today.some((b) => overlaps(b, '18:30', '19:30'))).toBe(false)
    expect(today.some((b) => overlaps(b, '13:00', '14:00'))).toBe(false)
  })

  it('honours any number of custom breaks', () => {
    const s = { ...S, breaks: [{ id: 'w', name: 'Walk', start: '10:00', minutes: 30 }] }
    const t = task({ estimateMinutes: 60 * 3, dueDate: '2026-10-19' })
    const placed = placePending([t], makeBlocks(t, s), s, monday8)
    expect(placed.some((b) => b.date === '2026-10-19' && overlaps(b, '10:00', '10:30'))).toBe(false)
  })
})

describe('fixed events', () => {
  it('plans work around a shift', () => {
    const t = task({ estimateMinutes: 60 * 3, dueDate: '2026-10-19' })
    const placed = placePending([t], makeBlocks(t, S), S, monday8, [shift()])
    const mon = placed.filter((b) => b.date === '2026-10-19')
    expect(mon.length).toBeGreaterThan(0)
    expect(mon.some((b) => overlaps(b, '09:00', '15:00'))).toBe(false)
  })

  it('repeats weekly on chosen days only, until an end date', () => {
    const e = shift({ repeatDays: [2, 4], until: '2026-10-29' })
    expect(eventsOn([e], '2026-10-20')).toHaveLength(1) // Tue
    expect(eventsOn([e], '2026-10-22')).toHaveLength(1) // Thu
    expect(eventsOn([e], '2026-10-21')).toHaveLength(0) // Wed
    expect(eventsOn([e], '2026-10-13')).toHaveLength(0) // before it starts
    expect(eventsOn([e], '2026-11-03')).toHaveLength(0) // after it ends
  })

  it('a one-off shows only on its own day', () => {
    expect(eventsOn([shift()], '2026-10-19')).toHaveLength(1)
    expect(eventsOn([shift()], '2026-10-26')).toHaveLength(0)
  })

  it('shifts on rest days are still respected if work is spilled there', () => {
    const sat = shift({ date: '2026-10-24', start: '09:00', end: '17:00' })
    expect(eventsOn([sat], '2026-10-24')).toHaveLength(1)
  })

  it('moves blocks that a new event lands on, and re-places them', () => {
    const t = task({ estimateMinutes: 60, dueDate: '2026-10-21' })
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    expect(placed[0]).toMatchObject({ date: '2026-10-19', start: '09:00' })
    const events = [shift()]
    const cleared = unplaceConflicts(placed, S, events)
    expect(cleared[0].date).toBe('')
    const again = placePending([t], cleared, S, monday8, events)
    expect(again[0].date === '2026-10-19' ? again[0].start >= '15:00' : true).toBe(true)
  })

  it('never evicts the block being timed or one with logged time', () => {
    const t = task({ estimateMinutes: 60 })
    const [b] = placePending([t], makeBlocks(t, S), S, monday8)
    expect(unplaceConflicts([b], S, [shift()], b.id)[0].date).toBe('2026-10-19')
    expect(unplaceConflicts([{ ...b, loggedSeconds: 600 }], S, [shift()])[0].date).toBe('2026-10-19')
  })

  it('ignores a zero or negative length event', () => {
    expect(eventsOn([shift({ start: '10:00', end: '10:00' })], '2026-10-19')).toHaveLength(0)
  })
})
