import { describe, expect, it } from 'vitest'
import { addTask, closeDay, emptyData, startTimer } from './actions'
import { buildReminders } from './push'
import { restCheck } from './rest'

describe('a gentle check outside your hours', () => {
  const d = emptyData()
  it('says nothing during the working day', () => {
    expect(restCheck(d, new Date(2026, 9, 19, 11, 0))).toBeNull()
  })
  it('asks kindly after the day ends', () => {
    expect(restCheck(d, new Date(2026, 9, 19, 18, 30))?.title).toBe('Past your work day')
  })
  it('is firmer late at night, and early in the morning', () => {
    const late = restCheck(d, new Date(2026, 9, 19, 23, 45))!
    expect(late.late).toBe(true)
    expect(late.body).toContain('23:45')
    expect(restCheck(d, new Date(2026, 9, 20, 3, 10))?.late).toBe(true)
  })
  it('notices rest days and a day already put away', () => {
    expect(restCheck(d, new Date(2026, 9, 24, 11, 0))?.title).toBe('It’s a rest day')
    const closed = closeDay(d, new Date(2026, 9, 19, 12, 0))
    expect(restCheck(closed, new Date(2026, 9, 19, 14, 0))?.title).toBe('You put today away')
  })
})

describe('focus notification', () => {
  it('refreshes every 15 minutes under one tag, counting into overtime', () => {
    const at9 = new Date(2026, 9, 19, 9, 0)
    let d = addTask(emptyData(), { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: '2026-10-19' }, new Date(2026, 9, 19, 8, 0))
    d = startTimer(d, d.tasks[0].id, d.blocks[0].id, at9)
    const ticks = buildReminders(d, at9.getTime()).filter((r) => r.id.startsWith('tick:'))
    expect(ticks.every((r) => r.tag === 'focus')).toBe(true)
    expect(ticks[0].title).toBe('Final logo artwork · 45 min left')
    expect(ticks[1].title).toBe('Final logo artwork · 30 min left')
    expect(ticks.some((r) => r.title.endsWith('15 min over'))).toBe(true)
    // Nothing right at the end, where "block complete" already speaks.
    expect(ticks.some((r) => r.title.endsWith('· 0 min left'))).toBe(false)
  })
})
