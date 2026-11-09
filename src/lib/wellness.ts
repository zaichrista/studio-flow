import type { AppData } from '../types'
import { addDays, iso, toMin } from './dates'
import { allWindows } from './scheduler'

/** One gentle movement you can do at a desk, in a few words. */
export interface Move {
  id: string
  name: string
  how: string
  seconds: number
}

export const DESK: Move[] = [
  { id: 'eyes', name: 'Rest your eyes', how: 'Look at something far away, out of a window if you can. Let your eyes go soft. Blink slowly.', seconds: 20 },
  { id: 'neck', name: 'Neck rolls', how: 'Drop your right ear toward your shoulder, then roll slowly to the left. Keep your shoulders down.', seconds: 30 },
  { id: 'shoulders', name: 'Shoulder rolls', how: 'Lift your shoulders to your ears, roll them back and down. Big, slow circles.', seconds: 25 },
  { id: 'wrists', name: 'Wrists and fingers', how: 'Arms out, palms up, then down. Circle your wrists, spread your fingers wide, then make soft fists.', seconds: 30 },
  { id: 'chest', name: 'Chest opener', how: 'Sit tall. Clasp your hands behind your back and lift them a little as you breathe in.', seconds: 25 },
  { id: 'twist', name: 'Seated twist', how: 'Turn gently to the right, hand on the back of the chair. Breathe. Then switch sides.', seconds: 40 },
  { id: 'fold', name: 'Stand and fold', how: 'Stand up. Let your upper body hang forward, knees soft. Let your head be heavy.', seconds: 30 },
  { id: 'calves', name: 'Calf raises', how: 'Standing, rise onto your toes slowly and lower. Ten times, as slow as you like.', seconds: 25 },
  { id: 'reach', name: 'Big reach', how: 'Reach both arms up and over your head, lean a little each way, and take a deep breath in.', seconds: 20 },
]

export interface Routine {
  id: 'quick' | 'reset'
  name: string
  blurb: string
  moves: Move[]
}

const pick = (...ids: string[]) => ids.map((i) => DESK.find((m) => m.id === i)!)

export const ROUTINES: Routine[] = [
  { id: 'quick', name: 'One-minute stretch', blurb: 'Neck, shoulders and a big reach.', moves: pick('neck', 'shoulders', 'reach') },
  { id: 'reset', name: 'Three-minute desk reset', blurb: 'Eyes, neck, shoulders, wrists, a twist and a stand.', moves: pick('eyes', 'neck', 'shoulders', 'wrists', 'chest', 'twist', 'fold') },
]

export const routineSeconds = (r: Routine) => r.moves.reduce((a, m) => a + m.seconds, 0)

/** Prompts for the gratitude practice. One a day, steady all day. */
const GRATITUDE = [
  'What was one kind thing someone did or said lately?',
  'What is something small that went right today?',
  'What in your space are you glad to have?',
  'Who are you glad is in your life?',
  'What did your body let you do today?',
  'What is something you are looking forward to?',
  'What was good to taste, smell or hear today?',
]

export function gratitudePrompt(day = iso()): string {
  const n = Number(day.replace(/-/g, ''))
  return GRATITUDE[n % GRATITUDE.length]
}

/** The most recent days with good things written down, newest first. */
export function recentGood(d: AppData, count = 5, today = iso()): { date: string; items: string[] }[] {
  return Object.entries(d.days)
    .filter(([date, n]) => date <= today && n.good?.length)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, count)
    .map(([date, n]) => ({ date, items: n.good! }))
}

/** The break happening now, or the next one within half an hour. */
export function breakNow(d: AppData, minutes: number, day = iso()): { name: string; start: number; end: number; on: boolean } | null {
  if (allWindows(day, d.settings).length === 0) return null
  for (const b of [...d.settings.breaks].sort((x, y) => toMin(x.start) - toMin(y.start))) {
    const start = toMin(b.start)
    const end = start + b.minutes
    if (minutes >= start && minutes < end) return { name: b.name, start, end, on: true }
    if (minutes < start && start - minutes <= 30) return { name: b.name, start, end, on: false }
  }
  return null
}

const STAND = [
  'Stand up and let your shoulders drop. Two minutes, then back.',
  'Look away from the screen for twenty seconds. Out of a window if you can.',
  'Drink some water and roll your neck slowly.',
  'Stretch your wrists and fingers. They have been busy.',
  'Stand, reach up high, take one big breath.',
  'Walk to another room and back. Your brain likes it.',
]

/** Times to nudge you to move: every `every` minutes inside a work window, never during a break. */
export function moveTimes(d: AppData, day: string, every: number): number[] {
  if (every <= 0) return []
  const out: number[] = []
  const breaks = d.settings.breaks.map((b) => ({ from: toMin(b.start) - 10, to: toMin(b.start) + b.minutes }))
  for (const w of allWindows(day, d.settings)) {
    for (let t = w.from + every; t <= w.to - 20; t += every) {
      if (!breaks.some((b) => t >= b.from && t < b.to)) out.push(t)
    }
  }
  return out
}

export const standLine = (seed: number) => STAND[Math.abs(seed) % STAND.length]

const BREAK_LINES = [
  'Step away from the screen. A three-minute desk reset is waiting in Wellness.',
  'Leave the desk. Eat something proper, then take a few slow breaths.',
  'This one is yours. Look out of a window, or take a short walk.',
]
export const breakLine = (seed: number) => BREAK_LINES[Math.abs(seed) % BREAK_LINES.length]

export const nextDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i))
