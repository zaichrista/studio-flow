import type { AppData } from '../types'
import { addDays, iso, smallDate } from './dates'
import { isLate, weekLoad } from './scheduler'
import { awaitingPayment, daysBetween, invoiceDue, money, nextTaxDay, readyToInvoice } from './stats'

export interface Win {
  id: string
  text: string
}

const sameDay = (ms: number | undefined, day: string) => !!ms && iso(new Date(ms)) === day

/**
 * Today's small wins: finished tasks, ticked steps, blocks done, money in,
 * ideas kept. Seeing progress, however small, is what keeps motivation up
 * (Amabile & Kramer's "progress principle").
 */
export function winsToday(d: AppData, day = iso()): Win[] {
  const out: Win[] = []
  for (const t of d.tasks) {
    if (t.done && sameDay(t.doneAt, day)) out.push({ id: `t${t.id}`, text: `Finished ${t.title}` })
    const steps = t.subtasks.filter((x) => x.done && sameDay(x.doneAt, day))
    if (steps.length && !(t.done && sameDay(t.doneAt, day))) {
      out.push({ id: `s${t.id}`, text: steps.length === 1 ? `${steps[0].title} (${t.title})` : `${steps.length} steps on ${t.title}` })
    }
  }
  const blocks = d.blocks.filter((b) => b.date === day && b.done)
  if (blocks.length) {
    const mins = blocks.reduce((a, b) => a + b.minutes, 0)
    out.push({ id: 'blocks', text: `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} of focus, ${mins >= 60 ? `${Math.round((mins / 60) * 10) / 10}h` : `${mins}m`}` })
  }
  for (const p of d.projects) {
    if (p.invoice?.paidOn === day) out.push({ id: `paid${p.id}`, text: `${p.name} paid${p.pay ? `, ${money(p.pay)}` : ''}` })
    else if (p.invoice?.sentOn === day && !p.invoice.paidOn) out.push({ id: `inv${p.id}`, text: `Invoice sent for ${p.name}` })
  }
  const ideas = d.ideas.filter((i) => sameDay(i.at, day)).length
  if (ideas) out.push({ id: 'ideas', text: `${ideas} ${ideas === 1 ? 'idea' : 'ideas'} kept` })
  return out
}

export interface Heads {
  id: string
  text: string
  page: 'money' | 'work' | 'week'
}

/** The few things worth knowing today, gently, most pressing first. At most three. */
export function worthKnowing(d: AppData, day = iso()): Heads[] {
  const out: Heads[] = []
  for (const p of awaitingPayment(d)) {
    const due = invoiceDue(p, day)
    if (due && due.late > 0) out.push({ id: `late${p.id}`, text: `${p.name} is ${due.late} ${due.late === 1 ? 'day' : 'days'} late paying. A friendly chase is fair.`, page: 'money' })
    else if (due && due.due === day) out.push({ id: `due${p.id}`, text: `${p.name}'s invoice is due today.`, page: 'money' })
  }
  const late = [...new Set(d.blocks.filter((b) => isLate(b, d.tasks.find((t) => t.id === b.taskId))).map((b) => b.taskId))]
  if (late.length) {
    const names = late.map((id) => d.tasks.find((t) => t.id === id)?.title).filter(Boolean)
    out.push({ id: 'late', text: `${names.length === 1 ? names[0] : `${names.length} tasks`} won't make ${names.length === 1 ? 'its deadline' : 'their deadlines'}. Give ${names.length === 1 ? 'it' : 'one'} more days, or let something go.`, page: 'week' })
  }
  const cap = d.settings.maxWeekHours * 60
  if (cap > 0 && weekLoad(day, d.blocks, d.events) >= cap) out.push({ id: 'full', text: 'This week is full. New work will wait for next week.', page: 'week' })
  const ready = d.projects.filter((p) => readyToInvoice(d, p))
  if (ready.length) out.push({ id: 'ready', text: `${ready[0].name} is all done${ready[0].pay ? ` (${money(ready[0].pay)})` : ''}. Time to send the invoice?`, page: 'work' })
  const tax = nextTaxDay(day)
  const toTax = daysBetween(day, tax)
  if (toTax <= 30) out.push({ id: 'tax', text: `Tax day is ${smallDate(tax)}, in ${toTax} ${toTax === 1 ? 'day' : 'days'}.`, page: 'money' })
  return out.slice(0, 3)
}

const GENTLE = [
  'One thing at a time, and do it well',
  'Finish before starting something new',
  'Take lunch away from the screen',
  'Be kind to myself if it goes sideways',
  'Make something I like, not just something done',
  'Stop on time tonight',
]

/**
 * A few intentions to pick with one tap, so a blank box never stands in the
 * way: one drawn from the day's work, the rest gentle ones that change daily.
 */
export function intentionIdeas(d: AppData, day = iso()): string[] {
  const out: string[] = []
  const first = d.blocks
    .filter((b) => b.date === day && !b.done)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => d.tasks.find((t) => t.id === b.taskId))
    .find((t) => t && !t.done)
  if (first) out.push(`Move ${first.title} forward`)
  const chase = awaitingPayment(d).find((p) => (invoiceDue(p, day)?.late ?? 0) > 0)
  if (chase) out.push(`Chase ${chase.name}`)
  const seed = Number(day.replace(/-/g, '')) % GENTLE.length
  for (let i = 0; out.length < 3; i++) out.push(GENTLE[(seed + i) % GENTLE.length])
  return out
}

/** Yesterday's good thing, to start the day on (looks back up to a week, past rest days). */
export function lastGoodThing(d: AppData, day = iso()): { date: string; text: string } | null {
  for (let i = 1; i <= 7; i++) {
    const date = addDays(day, -i)
    const text = d.days[date]?.goodThing
    if (text) return { date, text }
  }
  return null
}
