import type { AppData, Idea, Lane } from '../types'
import { quickCapture } from './actions'
import { uid } from './id'
import { parseDump } from './parseDump'

/** The four places a thought can go. */
export type SweepKind = 'task' | 'idea' | 'spend' | 'worry'
export interface SweepItem {
  text: string
  kind: SweepKind
}

export const KIND_LABEL: Record<SweepKind, string> = {
  task: 'To do',
  idea: 'Idea',
  spend: 'Spend',
  worry: 'Set down',
}
export const KIND_ORDER: SweepKind[] = ['task', 'idea', 'spend', 'worry']

/** Prompts that walk you round your head, so nothing is left rattling about in there. */
export const SWEEP_PROMPTS: { label: string; ask: string; kind: SweepKind }[] = [
  { label: 'Work', ask: "What's still open at work?", kind: 'task' },
  { label: 'Money', ask: 'Anything to pay, buy or chase?', kind: 'spend' },
  { label: 'People', ask: 'Who are you waiting to reply to?', kind: 'task' },
  { label: 'Home', ask: 'What keeps nagging at home?', kind: 'task' },
  { label: 'Someday', ask: 'What would be nice to try?', kind: 'idea' },
  { label: 'Weighing on me', ask: "What's sitting on your chest? It doesn't have to be fixed.", kind: 'worry' },
]

const WORRY = /\b(worried|worry|worrying|anxious|anxiety|stress(?:ed|ful)?|scared|afraid|overwhelmed|dread|panick?ing|can'?t stop thinking|what if i (?:fail|can'?t|don'?t)|not good enough)\b/i

/** A fair first guess at where a thought belongs; one tap changes it. */
export function guessKind(text: string): SweepKind {
  if (WORRY.test(text)) return 'worry'
  const r = parseDump(text)
  if (r.expenses?.length) return 'spend'
  if (r.ideas?.length || r.projects.some((p) => p.ideas?.length)) return 'idea'
  return 'task'
}

/** Split spoken or pasted text into separate thoughts. */
export function splitThoughts(text: string): string[] {
  return text
    .split(/[\n.;]+|\band then\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Put every thought where it goes: tasks, ideas and spends through the usual
 * sorter and onto the calendar; worries are only set down, never scheduled.
 */
export function sweep(d: AppData, items: SweepItem[], now: Date = new Date(), lane?: Lane): AppData {
  const doing = items.filter((i) => i.kind !== 'worry')
  const text = doing.map((i) => (i.kind === 'idea' ? `idea: ${i.text}` : i.text)).join('\n')
  const next = text ? quickCapture(d, text, now, lane) : d
  const worries: Idea[] = items
    .filter((i) => i.kind === 'worry')
    .map((i) => ({ id: uid(), text: i.text, projectId: null, at: now.getTime(), kind: 'worry' as const }))
  return worries.length ? { ...next, ideas: [...worries.reverse(), ...next.ideas] } : next
}

/** Let a set-down worry go. */
export const releaseWorry = (d: AppData, id: string): AppData => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) })

/** Set one worry down on its own. */
export const setDown = (d: AppData, text: string, now: Date = new Date()): AppData =>
  sweep(d, [{ text, kind: 'worry' }], now)

/** A sentence on where it all went. */
export function sweepSummary(items: SweepItem[]): string {
  const n = (k: SweepKind) => items.filter((i) => i.kind === k).length
  const part = (count: number, one: string, many = `${one}s`) => (count ? `${count} ${count === 1 ? one : many}` : '')
  const parts = [part(n('task'), 'task'), part(n('idea'), 'idea'), part(n('spend'), 'spend'), n('worry') ? `${n('worry')} set down` : ''].filter(Boolean)
  return parts.length ? `Out of your head: ${parts.join(', ')}.` : 'Saved.'
}
