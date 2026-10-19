import { describe, expect, it } from 'vitest'
import { addTask, emptyData, moveBlock, moveEvent, saveEvent } from './actions'
import { splitEstimate } from './estimate'

// Monday 2026-10-19, 08:00 local
const now = new Date(2026, 9, 19, 8, 0)

function withTask() {
  const d = addTask(emptyData(), { projectId: null, title: 'Draft brief', estimateMinutes: 60 }, now)
  return { d, block: d.blocks[0] }
}

describe('moveBlock', () => {
  it('puts a block exactly where it was dropped', () => {
    const { d, block } = withTask()
    const r = moveBlock(d, block.id, '2026-10-20', 14 * 60, now)
    expect('data' in r && r.data.blocks.find((b) => b.id === block.id)).toMatchObject({ date: '2026-10-20', start: '14:00' })
  })

  it('refuses the past and fixed time', () => {
    const { d, block } = withTask()
    expect('reason' in moveBlock(d, block.id, '2026-10-18', 10 * 60, now)).toBe(true)
    const shift = { ...d, events: [{ id: 'e1', title: 'Café', kind: 'shift' as const, date: '2026-10-20', start: '09:00', end: '13:00', repeatDays: [], until: '' }] }
    const r = moveBlock(shift, block.id, '2026-10-20', 10 * 60, now)
    expect('reason' in r && r.reason).toContain('Café')
  })

  it('nudges whatever was in the way to another slot', () => {
    let { d } = withTask()
    d = addTask(d, { projectId: null, title: 'Invoice chase', estimateMinutes: 60 }, now)
    const [a, b] = d.blocks
    const r = moveBlock(d, b.id, a.date, Number(a.start.slice(0, 2)) * 60 + Number(a.start.slice(3)), now)
    if (!('data' in r)) throw new Error(r.reason)
    const movedA = r.data.blocks.find((x) => x.id === a.id)!
    expect(movedA.date !== a.date || movedA.start !== a.start).toBe(true)
  })
})

describe('moveEvent', () => {
  const base = { title: 'Shift', kind: 'shift' as const, date: '2026-10-19', start: '09:00', end: '12:00', until: '' }

  it('moves a one-off event to a new day and time', () => {
    const d = saveEvent(emptyData(), { ...base, repeatDays: [] })
    const e = moveEvent(d, d.events[0].id, '2026-10-19', '2026-10-21', 13 * 60, 17 * 60).events[0]
    expect(e).toMatchObject({ date: '2026-10-21', start: '13:00', end: '17:00' })
  })

  it('swaps the weekday of a repeating event', () => {
    const d = saveEvent(emptyData(), { ...base, repeatDays: [1, 3] })
    const e = moveEvent(d, d.events[0].id, '2026-10-19', '2026-10-20', 9 * 60, 12 * 60).events[0]
    expect(e.repeatDays.sort()).toEqual([2, 3])
    expect(e.date).toBe('2026-10-19')
  })
})

describe('splitEstimate', () => {
  it('reads a time off the end', () => {
    expect(splitEstimate('Pitch deck 2h')).toEqual({ title: 'Pitch deck', minutes: 120 })
    expect(splitEstimate('Emails 20m')).toEqual({ title: 'Emails', minutes: 15 })
    expect(splitEstimate('Moodboard 1.5 hours')).toEqual({ title: 'Moodboard', minutes: 90 })
  })
  it('leaves plain titles alone', () => {
    expect(splitEstimate('Call Maya')).toEqual({ title: 'Call Maya' })
    expect(splitEstimate('Top 10')).toEqual({ title: 'Top 10' })
  })
})
