import type { Tone } from '../types'
import { money } from './stats'

/** Pick one line from a pool, steadily: the same seed gives the same line. */
const pick = <T,>(pool: T[], seed: number): T => pool[Math.abs(seed) % pool.length]

export const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)

export interface Line {
  title: string
  body: string
}

interface Ctx {
  /** Monthly rent, to say what showing up pays for (0 if not set) */
  rent: number
  /** What to start with, if known */
  hint?: string | null
}

/** How late a block can be before each level of nudge is sent, in minutes. */
export const NAG_AFTER: Record<Tone, number[]> = { gentle: [], firm: [10], brutal: [5, 15] }

/** What is said when a block begins (level 0) or when it still hasn't been started (1, 2). */
export function blockLine(tone: Tone, level: 0 | 1 | 2, task: string, late: number, c: Ctx, seed = 0): Line {
  const hint = c.hint ? `${c.hint}. ` : ''
  if (tone === 'gentle') {
    if (level === 0) return { title: `Time for ${task}`, body: `${hint}Tap to start the timer.` }
    return { title: `${task} is waiting`, body: 'Whenever you are ready. Even ten minutes counts.' }
  }
  if (tone === 'firm') {
    if (level === 0) return { title: `Start: ${task}`, body: `${hint}It's time. Tap to begin.` }
    return { title: `${task} hasn't started`, body: `It was due ${late} minutes ago. Begin now, even if it's only ten minutes.` }
  }
  if (level === 0) return { title: `Now: ${task}`, body: `${hint}No warm-up. Tap and go.` }
  if (level === 1) {
    return pick(
      [
        { title: `${task}. ${late} minutes late.`, body: 'You said you would. Open it and start.' },
        { title: `You're ${late} minutes behind on ${task}`, body: 'Every minute you wait is a minute you owe later. Start.' },
      ],
      seed,
    )
  }
  const lines: Line[] = [
    { title: `${task} is slipping`, body: `${late} minutes gone. This is how deadlines get missed. Start now, or it goes down as a miss.` },
    { title: `${late} minutes. Nothing done on ${task}.`, body: 'Stop negotiating with yourself. Open it.' },
  ]
  if (c.rent > 0) lines.push({ title: `Rent is ${money(c.rent)}`, body: `${task} is part of how it gets paid. You're ${late} minutes late. Start.` })
  return pick(lines, seed)
}

/** The nudge at the start of the job day, for firm and brutal tones. */
export function clockIn(tone: Tone, time: string, c: Pick<Ctx, 'rent'>): Line | null {
  if (tone === 'gentle') return null
  const rent = c.rent > 0 ? ` Rent is ${money(c.rent)}.` : ''
  if (tone === 'firm') return { title: 'Clock in', body: `Your job pays for everything else.${rent} Pick your three for today, then begin.` }
  return { title: `It's ${time}. You're on the clock.`, body: `${rent.trim()} Pick your three and start the first one. No negotiating.`.trim() }
}

/** One honest line for the end of the day. */
export function verdict(tone: Tone, kept: number, total: number): string {
  if (total === 0) return ''
  const all = kept >= total
  if (tone === 'gentle') return all ? `${kept} of ${total} done. Lovely.` : `${kept} of ${total} done. That's fine; tomorrow is another go.`
  if (tone === 'firm') return all ? `${kept} of ${total}. That's the standard.` : `${kept} of ${total}. Tomorrow starts with what you skipped.`
  return all ? `${kept} of ${total}. Now do it again tomorrow.` : `${kept} of ${total}. The other ${total - kept} didn't happen. They go first tomorrow.`
}

/** The in-app line on Today when a block is due or overdue. */
export function dueLine(tone: Tone, task: string, late: number): string {
  if (late < 1) return tone === 'gentle' ? `${task} is starting now.` : `${task}. Now.`
  if (tone === 'gentle') return `${task} was due ${late} ${late === 1 ? 'minute' : 'minutes'} ago. Whenever you are ready.`
  if (tone === 'firm') return `${task} was due ${late} ${late === 1 ? 'minute' : 'minutes'} ago. Start it.`
  return late < 15 ? `${late} minutes late on ${task}. Open it and start.` : `${late} minutes late on ${task}. This is what slipping looks like. Start.`
}
