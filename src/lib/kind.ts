import type { Settings, Task, TaskKind } from '../types'

const ADMIN = /\b(e-?mails?|inbox|reply|replies|respond|invoices?|chase|call|phone|ring|book|booking|pay|bills?|send|post|admin|receipts?|tax|upload|order|follow[ -]?up|message|dm|text|forms?|sign|contract|quote|renew|cancel|backup|file|tidy|organi[sz]e)\b/i
const IDEAS = /\b(brainstorm|ideas?|ideate|moodboards?|mood board|concepts?|sketch(es|ing)?|explore|exploration|research|inspiration|inspo|thumbnails?|riff|play|experiment|doodle|mind ?map|directions?)\b/i

/** A sensible guess from the words alone; anything else is focus work. */
export function guessKind(title: string): TaskKind {
  if (ADMIN.test(title)) return 'admin'
  if (IDEAS.test(title)) return 'ideas'
  return 'focus'
}

export const kindOf = (t: Pick<Task, 'kind' | 'title'>): TaskKind => t.kind ?? guessKind(t.title)

export const KIND_LABEL: Record<TaskKind, string> = { focus: 'Focus', ideas: 'Ideas', admin: 'Admin' }

/** Where midday falls: the start of a lunch-ish break, or 13:00. */
function midday(s: Settings): number {
  const lunch = s.breaks.find((b) => /lunch/i.test(b.name)) ?? s.breaks.find((b) => b.start >= '11:00' && b.start <= '14:30')
  const [h, m] = (lunch?.start ?? '13:00').split(':').map(Number)
  return h * 60 + m
}

/**
 * The part of the day a task would rather sit in, as minutes from midnight.
 * Focus work goes to your clearest half. Ideas go to the other half, where a
 * looser mind helps insight (Wieth & Zacks). Admin goes there too, so it
 * batches together instead of breaking up deep work.
 */
export function preferredWindow(kind: TaskKind, s: Settings): { from: number; to: number } | null {
  if (s.clearest === 'any') return null
  const mid = midday(s)
  const morning = { from: 0, to: mid }
  const afternoon = { from: mid, to: 24 * 60 }
  const clear = s.clearest === 'morning' ? morning : afternoon
  const other = s.clearest === 'morning' ? afternoon : morning
  return kind === 'focus' ? clear : other
}
