import { describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { addTask, applySorted, closeDay, emptyData, ideaToTask, markPaid, reopenDay, saveProject, sendInvoice, startTimer, stopTimer } from './actions'
import { buildReminders, startHint } from './push'
import { estimateRatio, invoiceDue, nextTaxDay, taxSetAside, taxYear } from './stats'

// Monday 2026-10-19, 08:00 local
const monday8 = new Date(2026, 9, 19, 8, 0)

const withProject = (pay = 800): AppData => saveProject(emptyData(), { name: 'Maya logo', pay })

describe('ideas', () => {
  it('keeps ideas from a sorted dump, on their project or loose', () => {
    const d = applySorted(emptyData(), {
      projects: [{ name: 'Maya logo', tasks: [], ideas: ['serif wordmark'] }],
      ideas: ['risograph zine'],
    }, monday8)
    expect(d.tasks).toHaveLength(0)
    expect(d.ideas.map((i) => i.text).sort()).toEqual(['risograph zine', 'serif wordmark'])
    expect(d.ideas.find((i) => i.text === 'serif wordmark')!.projectId).toBe(d.projects[0].id)
  })

  it('turns an idea into a scheduled task', () => {
    const d = applySorted(emptyData(), { projects: [], ideas: ['risograph zine'] }, monday8)
    const next = ideaToTask(d, d.ideas[0].id, monday8)
    expect(next.ideas).toHaveLength(0)
    expect(next.tasks[0].title).toBe('risograph zine')
    expect(next.blocks.every((b) => b.date !== '')).toBe(true)
  })
})

describe('honest estimates', () => {
  it('pads a task to match how long things really take', () => {
    const d = addTask(emptyData(), { projectId: null, title: 'Moodboard', estimateMinutes: 60, pad: 1.4 }, monday8)
    expect(d.tasks[0].estimateMinutes).toBe(90)
  })

  it('learns the ratio from finished, timed tasks', () => {
    let d = emptyData()
    for (let i = 0; i < 3; i++) {
      d = addTask(d, { projectId: null, title: `T${i}`, estimateMinutes: 60 }, monday8)
      const id = d.tasks[i].id
      d = { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)) }
      d = { ...d, entries: [...d.entries, { id: `e${i}`, taskId: id, blockId: null, start: 0, end: 90 * 60_000 }] }
    }
    expect(estimateRatio(d)).toEqual({ ratio: 1.5, count: 3 })
  })

  it('stays quiet until there are three tasks to learn from', () => {
    expect(estimateRatio(emptyData())).toBeNull()
  })
})

describe('invoices', () => {
  it('knows when an invoice is due and how late it is', () => {
    const base = withProject()
    const p = sendInvoice(base, base.projects[0].id, { sentOn: '2026-10-01', termsDays: 14 }).projects[0]
    expect(invoiceDue(p, '2026-10-10')).toEqual({ due: '2026-10-15', late: 0 })
    expect(invoiceDue(p, '2026-10-22')).toEqual({ due: '2026-10-15', late: 7 })
  })

  it('records the income when marked paid', () => {
    const base = withProject()
    const id = base.projects[0].id
    const d = markPaid(sendInvoice(base, id, { sentOn: '2026-10-01', termsDays: 14 }), id, '2026-10-12')
    expect(d.projects[0].invoice?.paidOn).toBe('2026-10-12')
    expect(d.txns).toEqual([expect.objectContaining({ kind: 'income', amount: 800, projectId: id, date: '2026-10-12' })])
    expect(invoiceDue(d.projects[0], '2026-10-30')).toBeNull()
  })
})

describe('tax', () => {
  it('finds the UK tax year and the next payment day', () => {
    expect(taxYear('2026-10-18')).toEqual({ from: '2026-04-06', to: '2027-04-05' })
    expect(taxYear('2027-03-01').from).toBe('2026-04-06')
    expect(nextTaxDay('2026-10-18')).toBe('2027-01-31')
    expect(nextTaxDay('2026-03-01')).toBe('2026-07-31')
  })

  it('sets aside the chosen share of income', () => {
    const d = { ...emptyData(), txns: [{ id: 'a', kind: 'income' as const, amount: 800, date: '2026-10-12', category: 'Client work', note: '' }] }
    expect(taxSetAside(d, '2026-10-01', '2026-10-31')).toBe(200)
  })
})

describe('putting the day away', () => {
  it('moves the rest of today to another day and keeps today clear', () => {
    const d = addTask(emptyData(), { projectId: null, title: 'Logo', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    expect(d.blocks[0].date).toBe('2026-10-19')
    const closed = closeDay(d, monday8)
    expect(closed.closedOn).toBe('2026-10-19')
    expect(closed.blocks[0].date).toBe('2026-10-20')
    const more = addTask(closed, { projectId: null, title: 'Emails', estimateMinutes: 60 }, monday8)
    expect(more.blocks.every((b) => b.date !== '2026-10-19')).toBe(true)
    expect(reopenDay(more, monday8).closedOn).toBeUndefined()
  })

  it('stops a running timer and keeps the time', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Logo', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    const at9 = new Date(2026, 9, 19, 9, 0)
    d = startTimer(d, d.tasks[0].id, d.blocks[0].id, at9)
    const closed = closeDay(d, new Date(2026, 9, 19, 9, 30))
    expect(closed.active).toBeNull()
    expect(closed.entries).toHaveLength(1)
    expect(closed.blocks.find((b) => b.partial)?.minutes).toBe(30)
  })
})

describe('reminders', () => {
  it('sends a heads-up and a start nudge naming the first step', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Moodboard', estimateMinutes: 60, firstStep: 'Open Pinterest board', dueDate: '2026-10-19' }, monday8)
    d = { ...d, settings: { ...d.settings, shutdownNudge: false } }
    const r = buildReminders(d, monday8.getTime()).filter((x) => !x.id.startsWith('tax:'))
    expect(r.map((x) => x.id.split(':')[0])).toEqual(['soon', 'block'])
    expect(r[0].title).toBe('In 10 minutes: Moodboard')
    expect(r[1].body).toBe('Start by: Open Pinterest board. Tap to start the timer.')
    expect(r[1].at - r[0].at).toBe(10 * 60_000)
  })

  it('prefers where you left off over the first step', () => {
    expect(startHint({ id: 't', projectId: null, title: 'x', subtasks: [], estimateMinutes: 60, startDate: '', dueDate: '', done: false, createdAt: 0, firstStep: 'a', resumeNote: 'b' })).toBe('Pick up from: b')
  })

  it('goes quiet for a day that has been put away', () => {
    const d = closeDay(addTask(emptyData(), { projectId: null, title: 'Logo', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8), monday8)
    const r = buildReminders(d, monday8.getTime())
    expect(r.some((x) => new Date(x.at).getDate() === 19)).toBe(false)
  })

  it('nudges on the invoice due date and a week later', () => {
    const base = withProject()
    const d = sendInvoice(base, base.projects[0].id, { sentOn: '2026-10-19', termsDays: 14 })
    const inv = buildReminders(d, monday8.getTime()).filter((x) => x.id.startsWith('inv:'))
    expect(inv.map((x) => new Date(x.at).toDateString())).toEqual([
      new Date(2026, 10, 2).toDateString(),
      new Date(2026, 10, 9).toDateString(),
    ])
  })

  it('warns before the timed block ends', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Logo', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    const at9 = new Date(2026, 9, 19, 9, 0)
    d = startTimer(d, d.tasks[0].id, d.blocks[0].id, at9)
    const r = buildReminders(d, at9.getTime())
    const wrap = r.find((x) => x.id === 'wrap')!
    const done = r.find((x) => x.id === 'timer')!
    expect(done.at - wrap.at).toBe(5 * 60_000)
    void stopTimer
  })
})

describe('less friction', () => {
  it('guesses the kind of work from the words', async () => {
    const { guessKind } = await import('./kind')
    expect(guessKind('Reply to emails')).toBe('admin')
    expect(guessKind('Send invoice to Maya')).toBe('admin')
    expect(guessKind('Moodboard for the café')).toBe('ideas')
    expect(guessKind('Three logo concepts')).toBe('ideas')
    expect(guessKind('Final logo artwork')).toBe('focus')
    expect(guessKind('Design the menu')).toBe('focus')
  })

  it('puts focus work in the clearest hours and admin in the other half', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Reply to emails', dueDate: '2026-10-19' }, monday8)
    d = addTask(d, { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    const at = (title: string) => d.blocks.find((b) => b.taskId === d.tasks.find((t) => t.title === title)!.id)!
    expect(at('Final logo artwork').start).toBe('09:00')
    expect(at('Reply to emails').start >= '13:00').toBe(true)
    // Admin gets half an hour when no time is given.
    expect(at('Reply to emails').minutes).toBe(30)
  })

  it('flips the halves for an afternoon person', () => {
    const base = { ...emptyData(), settings: { ...emptyData().settings, clearest: 'afternoon' as const } }
    const d = addTask(base, { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    expect(d.blocks[0].start).toBe('14:00')
  })

  it('moves a block at least an hour on with "not now"', async () => {
    const { snoozeBlock } = await import('./actions')
    const at9 = new Date(2026, 9, 19, 9, 0)
    const d = addTask(emptyData(), { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: '2026-10-21' }, at9)
    const moved = snoozeBlock(d, d.blocks[0].id, at9)
    expect(moved.blocks[0].date).toBe('2026-10-19')
    expect(moved.blocks[0].start >= '10:00').toBe(true)
  })

  it('captures and places a thought in one go', async () => {
    const { quickCapture } = await import('./actions')
    const d = quickCapture(emptyData(), 'Reply to Maya tomorrow\nidea: neon sign', monday8)
    expect(d.tasks.map((t) => t.title)).toEqual(['Reply to Maya'])
    expect(d.tasks[0].dueDate).toBe('2026-10-20')
    expect(d.blocks[0].date).not.toBe('')
    expect(d.ideas.map((i) => i.text)).toEqual(['neon sign'])
    expect(d.dumps).toHaveLength(1)
  })

  it('checks in after "just 10 minutes"', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Final logo artwork', estimateMinutes: 60, dueDate: '2026-10-19' }, monday8)
    const at9 = new Date(2026, 9, 19, 9, 0)
    d = startTimer(d, d.tasks[0].id, d.blocks[0].id, at9, 10)
    const trial = buildReminders(d, at9.getTime()).find((r) => r.id === 'trial')!
    expect(trial.at - at9.getTime()).toBe(10 * 60_000)
    expect(trial.title).toBe("That's 10 minutes.")
  })
})
