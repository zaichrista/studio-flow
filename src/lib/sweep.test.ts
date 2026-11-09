import { describe, expect, it } from 'vitest'
import { emptyData } from './actions'
import { guessKind, releaseWorry, splitThoughts, sweep, sweepSummary } from './sweep'
import { isOffDay, logStill, offDayIdeas, saveGood, stillWeek, suggest } from './stillness'
import { upgrade } from './store'

const mon = new Date(2026, 9, 19, 10, 0)

describe('sweep: a new way to empty your head', () => {
  it('guesses where each thought goes', () => {
    expect(guessKind('Reply to Maya')).toBe('task')
    expect(guessKind('idea: a risograph zine')).toBe('idea')
    expect(guessKind('Bought brushes £12')).toBe('spend')
    expect(guessKind("I'm so anxious about the review")).toBe('worry')
  })

  it('splits spoken text into separate thoughts', () => {
    expect(splitThoughts('call the bank. buy paper and then email Sam')).toEqual(['call the bank', 'buy paper', 'email Sam'])
  })

  it('files tasks and ideas, and only sets worries down', () => {
    const next = sweep(emptyData(), [
      { text: 'Reply to Maya', kind: 'task' },
      { text: 'a risograph zine', kind: 'idea' },
      { text: 'The review next week', kind: 'worry' },
    ], mon)
    expect(next.tasks.map((t) => t.title)).toContain('Reply to Maya')
    expect(next.ideas.filter((i) => i.kind !== 'worry').map((i) => i.text)).toContain('a risograph zine')
    const worry = next.ideas.find((i) => i.kind === 'worry')
    expect(worry?.text).toBe('The review next week')
    // a worry is never a task and never on the calendar
    expect(next.tasks.some((t) => t.title.includes('review'))).toBe(false)
    expect(releaseWorry(next, worry!.id).ideas.some((i) => i.kind === 'worry')).toBe(false)
  })

  it('says what happened', () => {
    expect(sweepSummary([{ text: 'a', kind: 'task' }, { text: 'b', kind: 'worry' }])).toBe('Out of your head: 1 task, 1 set down.')
  })
})

describe('stillness', () => {
  it('sees a weekend as a day off when weekend work is off', () => {
    const d = emptyData()
    d.settings.weekendWork = false
    expect(isOffDay(d, '2026-10-24')).toBe(true)
    expect(isOffDay(d, '2026-10-19')).toBe(false)
  })

  it('tallies the week', () => {
    let d = emptyData()
    d = logStill(d, '2026-10-19', 5)
    d = logStill(d, '2026-10-19', 1)
    d = logStill(d, '2026-10-24', 10)
    const w = stillWeek(d, '2026-10-24')
    expect(w).toMatchObject({ minutes: 16, sits: 3 })
    expect(w.days).toEqual([true, false, false, false, false, true, false])
  })

  it('keeps up to three good things', () => {
    const d = saveGood(emptyData(), '2026-10-19', ['coffee', 'a message', 'sun', 'extra'])
    expect(d.days['2026-10-19'].good).toEqual(['coffee', 'a message', 'sun'])
    expect(d.days['2026-10-19'].goodThing).toBe('coffee')
  })

  it('offers something suited to the hour and the mood', () => {
    expect(suggest(8)).toBe('breathe')
    expect(suggest(21)).toBe('good')
    expect(suggest(14, 'heavy')).toBe('down')
    expect(offDayIdeas('2026-10-24')).toHaveLength(3)
  })
})

describe('Sharp is retired', () => {
  it('moves anyone on Sharp to Blush, and new users start on Blush', () => {
    expect(emptyData().settings.look.palette).toBe('blush')
    const saved = { ...emptyData(), settings: { ...emptyData().settings, look: { ...emptyData().settings.look, palette: 'sharp' as never } } }
    expect(upgrade(saved).settings.look.palette).toBe('blush')
  })
})

describe('Follow the sun migration', () => {
  it('moves everyone onto it once, then respects a later choice', () => {
    const base = emptyData()
    const old = { ...base, settings: { ...base.settings, look: { ...base.settings.look, theme: 'dark' as const, sky: undefined as never } } }
    expect(upgrade(old).settings.look.theme).toBe('sun')
    const chosen = { ...base, settings: { ...base.settings, look: { ...base.settings.look, theme: 'dark' as const, sky: true } } }
    expect(upgrade(chosen).settings.look.theme).toBe('dark')
  })
})
