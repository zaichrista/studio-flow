import { describe, expect, it } from 'vitest'
import { addTask, emptyData, saveProject, sendInvoice, setDayNote, setStatus, toggleSubtask } from './actions'
import { iso } from './dates'
import { intentionIdeas, lastGoodThing, winsToday, worthKnowing } from './today'

const monday8 = new Date(2026, 9, 19, 8, 0)
const today = '2026-10-19'

describe('daily intention', () => {
  it('keeps one note per day and clears empty ones', () => {
    let d = setDayNote(emptyData(), today, { intention: 'One thing at a time' })
    expect(d.days[today]).toEqual({ intention: 'One thing at a time' })
    d = setDayNote(d, today, { goodThing: 'Finished on time' })
    expect(d.days[today]).toEqual({ intention: 'One thing at a time', goodThing: 'Finished on time' })
    d = setDayNote(setDayNote(d, today, { intention: ' ' }), today, { goodThing: '' })
    expect(d.days[today]).toBeUndefined()
  })

  it('suggests something from the day first, then gentle ones', () => {
    const d = addTask(emptyData(), { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: today }, monday8)
    const ideas = intentionIdeas(d, today)
    expect(ideas).toHaveLength(3)
    expect(ideas[0]).toBe('Move Final logo artwork forward')
    expect(new Set(ideas).size).toBe(3)
  })

  it("finds the last good thing, skipping rest days", () => {
    const d = setDayNote(emptyData(), '2026-10-16', { goodThing: 'A kind email' })
    expect(lastGoodThing(d, today)).toEqual({ date: '2026-10-16', text: 'A kind email' })
    expect(lastGoodThing(emptyData(), today)).toBeNull()
  })
})

describe('small wins', () => {
  it("lists what got done today, and nothing from other days", () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Moodboard', subtasks: ['Collect references', 'Pick palette'], dueDate: today }, monday8)
    d = addTask(d, { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: today }, monday8)
    d = toggleSubtask(d, d.tasks[0].id, d.tasks[0].subtasks[0].id)
    d = setStatus(d, d.tasks[1].id, 'done')
    // Ticks are stamped with the real clock, so read them back for the real today.
    const wins = winsToday(d, iso())
    expect(wins.map((w) => w.text)).toEqual(['Collect references (Moodboard)', 'Finished Final logo artwork'])
    expect(winsToday(d, '2020-01-01')).toEqual([])
  })
})

describe('worth knowing', () => {
  it('flags a late invoice first and keeps to three things', () => {
    const base = saveProject(emptyData(), { name: 'Bloom zine', pay: 450 })
    const d = sendInvoice(base, base.projects[0].id, { sentOn: '2026-09-20', termsDays: 14 })
    const heads = worthKnowing(d, today)
    expect(heads[0].text).toBe('Bloom zine is 15 days late paying. A friendly chase is fair.')
    expect(heads[0].page).toBe('money')
    expect(heads.length).toBeLessThanOrEqual(3)
  })

  it('mentions tax day only within a month of it', () => {
    expect(worthKnowing(emptyData(), today).some((h) => h.id === 'tax')).toBe(false)
    expect(worthKnowing(emptyData(), '2027-01-10').find((h) => h.id === 'tax')?.text).toBe('Tax day is 31 Jan, in 21 days.')
  })
})
