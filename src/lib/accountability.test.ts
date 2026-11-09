import { describe, expect, it } from 'vitest'
import { addTask, closeDay, emptyData, replan, saveProject, setMusts, startTimer } from './actions'
import { mustsToday, scoreboard, status, streak } from './accountability'
import { buildReminders } from './push'
import { DEFAULT_SETTINGS } from './scheduler'
import { blockLine, verdict } from './tone'
import { noJobData } from './fixtures'

const at = (h: number, m = 0, day = 19) => new Date(2026, 9, day, h, m)

/** A job task planned for Monday 19 Oct 10:00. */
const jobDay = (tone: 'gentle' | 'firm' | 'brutal' = 'brutal') => {
  let d = saveProject({ ...emptyData(), settings: { ...DEFAULT_SETTINGS, tone, shutdownNudge: false, budget: { ...DEFAULT_SETTINGS.budget, rent: 900 } } }, { name: 'Day job', lane: 'job' })
  d = addTask(d, { projectId: d.projects[0].id, title: 'Quarterly report', estimateMinutes: 60, dueDate: '2026-10-19' }, at(8))
  return d
}

describe('missed blocks are written down', () => {
  it('records a block that passes unstarted, and leaves one that was worked', () => {
    const d = jobDay()
    const b = d.blocks[0]
    expect(b.date).toBe('2026-10-19')
    const after = replan(d, at(12, 30))
    expect(after.misses).toHaveLength(1)
    expect(after.misses[0]).toMatchObject({ id: b.id, date: '2026-10-19', taskId: d.tasks[0].id })
    // Worked on: no miss.
    const worked = { ...d, blocks: d.blocks.map((x) => ({ ...x, loggedSeconds: 600 })) }
    expect(replan(worked, at(12, 30)).misses).toHaveLength(0)
  })

  it('does not count blocks put away deliberately at the end of the day', () => {
    const d = jobDay()
    const closed = closeDay(d, at(8, 30))
    expect(closed.misses).toHaveLength(0)
  })

  it('shows up in the scoreboard and breaks the streak', () => {
    const d = replan(jobDay(), at(12, 30))
    const s = scoreboard(d, at(12, 30))
    expect(s.today.missed).toBe(1)
    expect(s.missedWeek).toBe(1)
    expect(streak(d, '2026-10-20')).toBe(0)
  })
})

describe('being told off, in proportion', () => {
  it('says nothing about a block that is on time, and escalates as it slips', () => {
    const d = jobDay()
    const start = d.blocks[0].start
    const [h, m] = start.split(':').map(Number)
    expect(status(d, at(h, m))!.level).toBe(0)
    expect(status(d, at(h, m + 7))!.level).toBe(1)
    expect(status(d, at(h, m + 20))!.level).toBe(2)
    expect(status(d, at(h, m + 20))!.text).toContain('20 minutes late')
  })

  it('goes quiet once you start', () => {
    let d = jobDay()
    const b = d.blocks[0]
    d = startTimer(d, b.taskId, b.id, at(10, 5))
    expect(status(d, at(10, 20))).toBeNull()
  })

  it('brutal nags twice, firm once, gentle never', () => {
    const nags = (tone: 'gentle' | 'firm' | 'brutal') => buildReminders(jobDay(tone), at(8).getTime()).filter((r) => r.id.startsWith('nag:'))
    expect(nags('brutal').map((r) => r.id.split(':')[2])).toEqual(['1', '2'])
    expect(nags('firm')).toHaveLength(1)
    expect(nags('gentle')).toHaveLength(0)
  })

  it('nags replace each other and tap through to starting the block', () => {
    const r = buildReminders(jobDay(), at(8).getTime())
    const block = r.find((x) => x.id.startsWith('block:'))!
    const nag = r.find((x) => x.id.startsWith('nag:'))!
    expect(nag.tag).toBe(block.id)
    expect(nag.at).toBeGreaterThan(block.at)
  })

  it('stops nagging a block that is already running', () => {
    let d = jobDay()
    const b = d.blocks[0]
    d = startTimer(d, b.taskId, b.id, at(8, 1))
    expect(buildReminders(d, at(8, 1).getTime()).some((r) => r.id.startsWith('nag:'))).toBe(false)
  })

  it('clocks you in on job days with the rent in the message, but only when firm or brutal', () => {
    const brutal = buildReminders(jobDay('brutal'), at(7).getTime()).find((r) => r.id === 'clockin:2026-10-19')!
    expect(brutal.title).toContain('09:00')
    expect(brutal.body).toContain('£900')
    expect(buildReminders(jobDay('gentle'), at(7).getTime()).some((r) => r.id.startsWith('clockin:'))).toBe(false)
  })

  it('never insults, whatever the tone', () => {
    for (const tone of ['gentle', 'firm', 'brutal'] as const) {
      for (const level of [0, 1, 2] as const) {
        const l = blockLine(tone, level, 'Report', 15, { rent: 900 }, 3)
        expect(`${l.title} ${l.body}`).not.toMatch(/lazy|useless|pathetic|stupid|failure/i)
      }
    }
  })
})

describe('your three', () => {
  it('counts the promises kept', () => {
    let d = jobDay()
    const id = d.tasks[0].id
    d = setMusts(d, '2026-10-19', [id, id, id, id].slice(0, 4))
    expect(mustsToday(d, '2026-10-19')).toEqual({ ids: [id, id, id], kept: 0 })
    d = { ...d, blocks: d.blocks.map((b) => ({ ...b, done: true })) }
    expect(mustsToday(d, '2026-10-19').kept).toBe(3)
  })

  it('has a plain verdict', () => {
    expect(verdict('brutal', 1, 3)).toContain('2 didn\'t happen')
    expect(verdict('firm', 3, 3)).toContain('standard')
    expect(verdict('firm', 0, 0)).toBe('')
  })
})

describe('no job, no clock-in', () => {
  it('stays quiet', () => {
    const d = noJobData()
    expect(buildReminders(d, at(7).getTime()).some((r) => r.id.startsWith('clockin:'))).toBe(false)
  })
})
