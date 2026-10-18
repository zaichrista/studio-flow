import type { AppData } from '../types'
import { fromMin, iso, nowMinutes, toMin } from './dates'
import { isWorkDay } from './scheduler'

/** From this time until morning it counts as late at night. */
const LATE = 22 * 60
const EARLY = 5 * 60

export interface RestCheck {
  /** Really late (or very early): a firmer, kinder message */
  late: boolean
  title: string
  body: string
}

/**
 * Starting work outside your hours isn't blocked, just questioned once,
 * kindly. Returns null when it's a normal working moment.
 */
export function restCheck(d: AppData, now: Date = new Date()): RestCheck | null {
  const s = d.settings
  const day = iso(now)
  const m = nowMinutes(now)
  const clock = fromMin(m)
  if (m >= LATE || m < EARLY) {
    return {
      late: true,
      title: 'It’s late. Are you sure?',
      body: `It’s ${clock}. You need rest, and tomorrow-you will do this better and faster. If it’s nagging at you, put it down and let it wait until morning.`,
    }
  }
  if (d.closedOn === day) {
    return { late: false, title: 'You put today away', body: 'You already closed the day. It’s fine to do a little more, but the evening is yours too.' }
  }
  if (!isWorkDay(day, s)) {
    return { late: false, title: 'It’s a rest day', body: 'Today isn’t one of your work days. Rest counts as part of the work. Sure you want to start?' }
  }
  if (m >= toMin(s.dayEnd)) {
    return { late: false, title: 'Past your work day', body: `Your day ended at ${s.dayEnd}. A little overtime is fine now and then; just don’t let it become the plan.` }
  }
  if (m < toMin(s.dayStart) - 60) {
    return { late: false, title: 'Early start', body: `Your day starts at ${s.dayStart}. Have you eaten? Then go gently.` }
  }
  return null
}

/** After a late-night "start anyway", the timer checks in after this many minutes. */
export const LATE_CHECK_IN = 20
