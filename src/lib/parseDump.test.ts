import { describe, expect, it } from 'vitest'
import { parseDump } from './parseDump'

// Monday 19 Oct 2026
const now = new Date(2026, 9, 19, 10, 0)
const p = (t: string) => parseDump(t, now)

describe('parseDump', () => {
  it('turns plain lines into loose tasks', () => {
    const r = p('Reply to emails\nTidy portfolio')
    expect(r.loose?.map((t) => t.title)).toEqual(['Reply to emails', 'Tidy portfolio'])
    expect(r.projects).toEqual([])
  })

  it('groups tasks under a project heading with its fee', () => {
    const r = p('Maya logo £800:\n  Moodboard\n- Three concepts\n\nInvoice café')
    expect(r.projects).toHaveLength(1)
    expect(r.projects[0]).toMatchObject({ name: 'Maya logo', pay: 800 })
    expect(r.projects[0].tasks.map((t) => t.title)).toEqual(['Moodboard', 'Three concepts'])
    expect(r.loose?.[0].title).toBe('Invoice café')
  })

  it('treats indented lines as subtasks of the task above', () => {
    const r = p('Social pack\n  Stories\n  Feed posts')
    expect(r.loose?.[0]).toMatchObject({ title: 'Social pack', subtasks: ['Stories', 'Feed posts'] })
  })

  it('reads deadlines', () => {
    expect(p('Send concepts by Friday').loose![0]).toMatchObject({ title: 'Send concepts', dueDate: '2026-10-23' })
    expect(p('Call printer tomorrow').loose![0]).toMatchObject({ title: 'Call printer', dueDate: '2026-10-20' })
    expect(p('Finish deck due 25 Oct').loose![0]).toMatchObject({ title: 'Finish deck', dueDate: '2026-10-25' })
    expect(p('Pitch 3/11').loose![0].dueDate).toBe('2026-11-03')
  })

  it('reads time estimates and days allowed', () => {
    expect(p('Moodboard 2h').loose![0]).toMatchObject({ title: 'Moodboard', estimateMinutes: 120 })
    expect(p('Edit video 1.5 hours').loose![0].estimateMinutes).toBe(90)
    expect(p('Proofread 40 min').loose![0].estimateMinutes).toBe(45)
    expect(p('Brand guide, give me 5 days').loose![0]).toMatchObject({ title: 'Brand guide', daysToComplete: 5 })
  })

  it('reads "Project: task" on one line', () => {
    const r = p('Reach: export files by Thursday')
    expect(r.projects[0]).toMatchObject({ name: 'Reach' })
    expect(r.projects[0].tasks[0]).toMatchObject({ title: 'export files', dueDate: '2026-10-22' })
  })

  it('files spending as expenses, not tasks', () => {
    const r = p('Buy Procreate brushes £12\nPaid £54.20 for groceries')
    expect(r.loose).toBeUndefined()
    expect(r.expenses).toEqual([
      { amount: 12, note: 'Buy Procreate brushes', category: 'Software' },
      { amount: 54.2, note: 'Paid for groceries', category: 'Food' },
    ])
  })

  it('handles the messy realistic case', () => {
    const r = p(`Maya café logo £800:
  concepts by Friday 3h
    collect references
    pick palette
  send for review

invoice the cafe
Buy fonts £30`)
    expect(r.projects[0].pay).toBe(800)
    expect(r.projects[0].tasks[0]).toMatchObject({
      title: 'concepts', dueDate: '2026-10-23', estimateMinutes: 180,
      subtasks: ['collect references', 'pick palette'],
    })
    expect(r.projects[0].tasks[1].title).toBe('send for review')
    expect(r.loose?.[0].title).toBe('invoice the cafe')
    expect(r.expenses?.[0]).toMatchObject({ amount: 30, category: 'Software' })
  })

  it('returns nothing for empty input', () => {
    expect(p('  \n\n')).toEqual({ projects: [] })
  })
})
