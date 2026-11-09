import { describe, expect, it } from 'vitest'
import type { AppData, Task } from '../types'
import { addTask, patchTask, saveProject } from './actions'
import { emptyData } from './actions'
import { toMin } from './dates'
import { DEFAULT_SETTINGS as S, defaultDue, lastWindowEnd, makeBlocks, placePending, weekLoad, windowsOn, workDates } from './scheduler'
import { upgrade } from './store'

const monday8 = new Date(2026, 9, 19, 8, 0)

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  projectId: null,
  title: 'Logo',
  subtasks: [],
  estimateMinutes: 120,
  startDate: '2026-10-19',
  dueDate: '2026-10-19',
  done: false,
  createdAt: 1,
  ...over,
})

describe('two lanes with a day job', () => {
  it('gives the job 9–5 on job days and freelance evenings, then weekends', () => {
    expect(windowsOn('2026-10-19', S, 'job')).toEqual([{ from: 540, to: 1020 }])
    expect(windowsOn('2026-10-19', S, 'freelance')).toEqual([{ from: 1140, to: 1290 }])
    expect(windowsOn('2026-10-24', S, 'job')).toEqual([])
    expect(windowsOn('2026-10-24', S, 'freelance')).toEqual([{ from: 600, to: 1020 }])
    expect(lastWindowEnd('2026-10-19', S)).toBe(1290)
    expect(lastWindowEnd('2026-10-24', S)).toBe(1020)
  })

  it('keeps weekends free when you say so', () => {
    const s = { ...S, weekendWork: false }
    expect(windowsOn('2026-10-24', s, 'freelance')).toEqual([])
    expect(workDates('2026-10-23', 2, s, 'freelance')).toEqual(['2026-10-23', '2026-10-26'])
  })

  it('plans job tasks inside job hours, around lunch', () => {
    const t = task({ lane: 'job', estimateMinutes: 240 })
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    for (const b of placed) {
      expect(b.date).toBe('2026-10-19')
      expect(toMin(b.start)).toBeGreaterThanOrEqual(540)
      expect(toMin(b.start) + b.minutes).toBeLessThanOrEqual(1020)
      expect(toMin(b.start) < 840 && toMin(b.start) + b.minutes > 780).toBe(false)
    }
  })

  it('plans freelance in the evening, never in the job day', () => {
    const t = task()
    const placed = placePending([t], makeBlocks(t, S), S, monday8)
    expect(placed.length).toBe(2)
    for (const b of placed) {
      expect(b.date).toBe('2026-10-19')
      expect(toMin(b.start)).toBeGreaterThanOrEqual(1140)
      expect(toMin(b.start) + b.minutes).toBeLessThanOrEqual(1290)
    }
  })

  it('uses the weekend when the deadline falls on one', () => {
    const t = task({ estimateMinutes: 60, startDate: '2026-10-24', dueDate: '2026-10-24' })
    const [b] = placePending([t], makeBlocks(t, S), S, monday8)
    expect(b.date).toBe('2026-10-24')
    expect(b.start).toBe('10:00')
  })

  it('counts days with room for the lane when giving a task time', () => {
    // Friday: evenings Fri, then Sat, Sun
    expect(defaultDue('2026-10-23', S, 3, 'freelance')).toBe('2026-10-25')
    expect(defaultDue('2026-10-23', S, 3, 'job')).toBe('2026-10-27')
  })

  it('the weekly limit is about freelance time, not the job', () => {
    const job = task({ id: 'j', lane: 'job', estimateMinutes: 480 })
    const free = task({ id: 'f', estimateMinutes: 120 })
    const blocks = placePending([job, free], [...makeBlocks(job, S), ...makeBlocks(free, S)], S, monday8)
    expect(weekLoad('2026-10-19', blocks, [])).toBeGreaterThan(weekLoad('2026-10-19', blocks, [], [job, free]))
    expect(weekLoad('2026-10-19', blocks, [], [job, free])).toBe(120)
  })
})

describe('lanes follow projects', () => {
  const withJobProject = (): AppData => saveProject(emptyData(), { name: 'Day job', lane: 'job' })

  it('a task in a job project is a job task', () => {
    const base = withJobProject()
    const d = addTask(base, { projectId: base.projects[0].id, title: 'Quarterly report', estimateMinutes: 60 }, monday8)
    expect(d.tasks[0].lane).toBe('job')
    expect(toMin(d.blocks[0].start)).toBeLessThan(1020)
  })

  it('moving a task into another lane re-plans its blocks', () => {
    let d = addTask(emptyData(), { projectId: null, title: 'Poster', estimateMinutes: 60 }, monday8)
    expect(toMin(d.blocks[0].start)).toBeGreaterThanOrEqual(1140)
    d = patchTask(d, d.tasks[0].id, { lane: 'job' })
    expect(d.tasks[0].lane).toBe('job')
    expect(d.blocks.every((b) => !b.date || toMin(b.start) < 1020)).toBe(true)
  })

  it('changing a project\'s lane carries its tasks', () => {
    let d = withJobProject()
    const id = d.projects[0].id
    d = addTask(d, { projectId: id, title: 'Report', estimateMinutes: 60 }, monday8)
    d = saveProject(d, { id, name: 'Day job', lane: 'freelance' })
    expect(d.tasks[0].lane).toBe('freelance')
  })
})

describe('upgrading an older save', () => {
  it('hands 9–5 to the job and re-plans what had not started', () => {
    const old = emptyData()
    const saved = {
      ...old,
      settings: { ...old.settings, breaks: [{ id: 'dinner', name: 'Dinner', start: '18:30', minutes: 60 }] },
      blocks: [
        { id: 'a', taskId: 't', date: '2030-01-07', start: '09:00', minutes: 60, loggedSeconds: 0, done: false },
        { id: 'b', taskId: 't', date: '2030-01-07', start: '10:00', minutes: 60, loggedSeconds: 0, done: true },
      ],
    } as AppData
    delete (saved.settings as Partial<typeof saved.settings>).hasJob
    const up = upgrade(saved)
    expect(up.settings.hasJob).toBe(true)
    expect(up.settings.breaks.some((b) => b.id === 'dinner')).toBe(false)
    expect(up.blocks.find((b) => b.id === 'a')!.date).toBe('')
    expect(up.blocks.find((b) => b.id === 'b')!.date).toBe('2030-01-07')
  })
})

describe('planning a task by pressing the calendar', () => {
  it('books one block exactly there, due that day', async () => {
    const { addTaskAt } = await import('./actions')
    const r = addTaskAt(emptyData(), { projectId: null, title: 'Deck', lane: 'freelance' }, '2026-10-24', 11 * 60, 90, monday8)
    if (!('data' in r)) throw new Error(r.reason)
    expect(r.data.tasks).toHaveLength(1)
    expect(r.data.tasks[0].dueDate).toBe('2026-10-24')
    expect(r.data.blocks.map((b) => [b.date, b.start, b.minutes])).toEqual([['2026-10-24', '11:00', 90]])
  })

  it('refuses lunch, events and the past, with a reason', async () => {
    const { addTaskAt } = await import('./actions')
    const lunch = addTaskAt(emptyData(), { projectId: null, title: 'Deck' }, '2026-10-24', 13 * 60, 60, monday8)
    expect('reason' in lunch && lunch.reason).toContain('lunch')
    const past = addTaskAt(emptyData(), { projectId: null, title: 'Deck' }, '2026-10-19', 7 * 60, 60, monday8)
    expect('reason' in past && past.reason).toContain('passed')
  })
})
