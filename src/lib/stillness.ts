import type { AppData, DayNote } from '../types'
import { addDays, iso, monday } from './dates'
import { allWindows } from './scheduler'

/** No work window at all today: a real day off. */
export const isOffDay = (d: AppData, day = iso()): boolean => allWindows(day, d.settings).length === 0

export interface Session {
  id: 'breathe' | 'scan' | 'sit' | 'good' | 'down'
  name: string
  blurb: string
  minutes: number
}

export const SESSIONS: Session[] = [
  { id: 'breathe', name: 'One slow minute', blurb: 'In for 4, out for 6.', minutes: 1 },
  { id: 'scan', name: 'Body scan', blurb: 'Head to toe, letting go as you go.', minutes: 5 },
  { id: 'sit', name: 'Sit quietly', blurb: 'No goal. Just stay.', minutes: 10 },
  { id: 'good', name: 'Three good things', blurb: 'What went well, however small.', minutes: 0 },
  { id: 'down', name: 'Set it down', blurb: 'Park what is weighing on you.', minutes: 0 },
]

export const SCAN_LINES = [
  'Let your eyes soften. Let your breath be ordinary.',
  'Notice your forehead. Let it smooth out.',
  'Unclench your jaw. Let your tongue be heavy.',
  'Drop your shoulders away from your ears.',
  'Feel your arms. Let your hands be open.',
  'Notice your chest rise and fall. You don’t have to change it.',
  'Let your belly be soft.',
  'Feel your back against whatever holds you.',
  'Feel your legs, heavy and supported.',
  'Notice your feet. Warm, or cool, or neither.',
  'Take in the whole body at once. Rest here.',
  'One more slow breath. Then come back gently.',
]

export const SIT_LINES = [
  'Sit however is comfortable. Let your breath do its own thing.',
  'When your mind wanders, that’s normal. Come back to the breath.',
  'You have nowhere to be. This is the whole task.',
  'Notice sounds. Let them come and go.',
  'Soft shoulders. Soft face.',
  'Just this breath.',
]

/** Day-off ideas that aren't work in disguise. Three a day, steady all day. */
const OFF_IDEAS = [
  'A long walk with no podcast',
  'Phone in another room until noon',
  'Cook something slowly',
  'Call someone you like',
  'A bath, or a long shower',
  'Read a few pages of something that isn’t useful',
  'Sit by a window with a hot drink',
  'Tidy one small corner, then stop',
  'Play something on the piano just for the sound',
  'Go somewhere green',
  'Make something with no audience',
  'A nap, guilt-free',
  'Stretch on the floor for ten minutes',
  'Write three pages by hand, badly',
]

export function offDayIdeas(day = iso()): string[] {
  const n = Number(day.replace(/-/g, ''))
  return [0, 5, 9].map((o) => OFF_IDEAS[(n + o) % OFF_IDEAS.length])
}

/** What to offer right now, by time of day and how you arrived. */
export function suggest(hour: number, mood?: DayNote['mood']): Session['id'] {
  if (mood === 'heavy') return 'down'
  if (hour < 11) return 'breathe'
  if (hour >= 20) return 'good'
  if (hour >= 17) return 'scan'
  return mood === 'flat' ? 'scan' : 'sit'
}

export function stillMessage(off: boolean, closed: boolean, hour: number, mood?: DayNote['mood']): string {
  if (mood === 'heavy') return 'Heavy mornings are allowed. Set something down, or just breathe.'
  if (off) {
    if (hour < 11) return 'No job today, no studio today. Start slowly.'
    if (hour < 17) return 'This is a day off. Do one thing for the sake of it.'
    return 'Let the evening be long and soft.'
  }
  if (closed) return 'Work is away. Let your body catch up with that.'
  return 'A few quiet minutes make the rest of the day easier.'
}

/** Days this week with any stillness, and the minutes across them. */
export function stillWeek(d: AppData, day = iso()): { days: boolean[]; minutes: number; sits: number } {
  const from = monday(day)
  const days: boolean[] = []
  let minutes = 0
  let sits = 0
  for (let i = 0; i < 7; i++) {
    const n = d.days[addDays(from, i)]
    days.push(!!n?.sits)
    minutes += n?.still ?? 0
    sits += n?.sits ?? 0
  }
  return { days, minutes, sits }
}

/** Log a finished (or part-finished) session. Under a minute still counts as a sit. */
export function logStill(d: AppData, day: string, minutes: number): AppData {
  const n = d.days[day] ?? {}
  return { ...d, days: { ...d.days, [day]: { ...n, still: (n.still ?? 0) + Math.max(0, Math.round(minutes)), sits: (n.sits ?? 0) + 1 } } }
}

/** Save the evening's good things (up to three). */
export function saveGood(d: AppData, day: string, items: string[]): AppData {
  const good = items.map((s) => s.trim()).filter(Boolean).slice(0, 3)
  const n = { ...(d.days[day] ?? {}), good }
  if (!good.length) delete (n as DayNote).good
  else if (!n.goodThing) n.goodThing = good[0]
  return { ...d, days: { ...d.days, [day]: n } }
}
