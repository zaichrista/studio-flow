import { describe, expect, it } from 'vitest'
import { addTask, closeDay, emptyData, toggleCare } from './actions'
import { dayProgress, eveningsKept, plannedToday, zenLine } from './wellbeing'

const monday8 = new Date(2026, 9, 19, 8, 0)

describe('wellbeing', () => {
  it('gives one quiet line a day, the same all day', () => {
    expect(zenLine('2026-10-19')).toBe(zenLine('2026-10-19'))
    expect(zenLine('2026-10-19')).not.toBe(zenLine('2026-10-20'))
  })

  it('ticks and unticks little acts of care', () => {
    let d = toggleCare(emptyData(), '2026-10-19', 'water')
    d = toggleCare(d, '2026-10-19', 'outside')
    expect(d.days['2026-10-19'].care).toEqual(['water', 'outside'])
    d = toggleCare(toggleCare(d, '2026-10-19', 'water'), '2026-10-19', 'outside')
    expect(d.days['2026-10-19']).toBeUndefined()
  })

  it('counts evenings kept: put away by about the end of the day', () => {
    let d = closeDay(emptyData(), new Date(2026, 9, 19, 17, 10))
    d = closeDay(d, new Date(2026, 9, 20, 20, 30))
    // Wednesday not put away; Thursday is today and still open.
    expect(eveningsKept(d, '2026-10-22')).toEqual({ kept: 1, of: 3 })
    expect(eveningsKept(emptyData(), '2026-10-19')).toEqual({ kept: 0, of: 0 })
  })

  it('knows how much is planned today and where the day is', () => {
    const d = addTask(emptyData(), { projectId: null, title: 'Final logo artwork', estimateMinutes: 120, dueDate: '2026-10-19' }, monday8)
    expect(plannedToday(d, '2026-10-19')).toBe(120)
    expect(dayProgress(d, new Date(2026, 9, 19, 13, 0))).toBe(0.5)
    expect(dayProgress(d, monday8)).toBeLessThan(0)
  })
})
