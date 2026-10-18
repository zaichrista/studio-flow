import type { SortedDump } from '../types'
import { addDays, iso } from './dates'

/**
 * Sorts a brain dump into projects, tasks, subtasks, fees, deadlines and
 * spending using plain rules — no AI, no network.
 *
 * What it understands:
 *   Maya logo £800:          a line ending in ":" starts a project (fee optional)
 *     Moodboard 2h by Friday  tasks under it, with hours and a deadline
 *       collect references    indented lines are subtasks of the task above
 *   Maya: send invoice       "Project: task" on one line
 *   Buy brushes £12          money plus a spending word = an expense
 *   Reply to emails          anything else is a task
 * A blank line ends a project's group.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const LEAD = '(?:by|due|before|on|until|for)'
const SPEND = /\b(spent|spend|bought|buy|paid|pay|cost|costs|renew|renewal|subscription|subscribe|order|ordered)\b/i

const CATEGORIES: [RegExp, string][] = [
  [/procreate|adobe|figma|font|licen[cs]e|software|app\b|plugin|subscription|canva|domain|hosting/i, 'Software'],
  [/brush|paper|pen|ink|print|canvas|paint|supplies|material/i, 'Supplies'],
  [/lunch|dinner|coffee|food|groceries|shopping/i, 'Food'],
  [/rent|bill|electric|gas|water|insurance|phone|internet/i, 'Bills'],
  [/train|bus|taxi|uber|flight|petrol|travel/i, 'Travel'],
]

type Item = NonNullable<SortedDump['loose']>[number]

function takeMoney(line: string): { rest: string; amount: number | null } {
  const m = line.match(/£\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/i)
  if (!m) return { rest: line, amount: null }
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return { rest: line.replace(m[0], ' '), amount: Number.isFinite(n) ? n : null }
}

function nextWeekday(from: Date, target: number): string {
  const diff = (target - from.getDay() + 7) % 7
  return addDays(iso(from), diff)
}

function takeDate(line: string, now: Date): { rest: string; date?: string } {
  const lead = `(?:${LEAD}\\s+)?`
  const attempts: [RegExp, (m: RegExpMatchArray) => string | undefined][] = [
    [new RegExp(`\\b${lead}(today|tonight)\\b`, 'i'), () => iso(now)],
    [new RegExp(`\\b${lead}tomorrow\\b`, 'i'), () => addDays(iso(now), 1)],
    [new RegExp(`\\b${lead}next week\\b`, 'i'), () => {
      const monday = addDays(iso(now), ((8 - now.getDay()) % 7) || 7)
      return addDays(monday, 4)
    }],
    [new RegExp(`\\b${lead}(?:next\\s+)?(${DAYS.join('|')})\\b`, 'i'), (m) => {
      const target = DAYS.indexOf(m[1].toLowerCase())
      const next = /next\s/i.test(m[0])
      const d = nextWeekday(now, target)
      return next && d <= addDays(iso(now), 6) ? addDays(d, 7) : d
    }],
    [new RegExp(`\\b${lead}(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*\\b`, 'i'), (m) => fromParts(now, Number(m[1]), MONTHS.indexOf(m[2].toLowerCase()))],
    [new RegExp(`\\b${lead}(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => fromParts(now, Number(m[2]), MONTHS.indexOf(m[1].toLowerCase()))],
    [new RegExp(`\\b${lead}(\\d{1,2})/(\\d{1,2})\\b`, 'i'), (m) => fromParts(now, Number(m[1]), Number(m[2]) - 1)],
  ]
  for (const [re, make] of attempts) {
    const m = line.match(re)
    if (m) {
      const date = make(m)
      if (date) return { rest: line.replace(m[0], ' '), date }
    }
  }
  return { rest: line }
}

function fromParts(now: Date, day: number, month: number): string | undefined {
  if (day < 1 || day > 31 || month < 0 || month > 11) return undefined
  let d = new Date(now.getFullYear(), month, day, 12)
  if (d.getMonth() !== month) return undefined
  if (iso(d) < iso(now)) d = new Date(now.getFullYear() + 1, month, day, 12)
  return iso(d)
}

function takeEstimate(line: string): { rest: string; minutes?: number } {
  let rest = line
  let minutes = 0
  const h = rest.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)
  if (h) {
    minutes += Math.round(Number(h[1]) * 60)
    rest = rest.replace(h[0], ' ')
  }
  const m = rest.match(/\b(\d+)\s*(?:m|min|mins|minutes)\b/i)
  if (m) {
    minutes += Number(m[1])
    rest = rest.replace(m[0], ' ')
  }
  return { rest, minutes: minutes > 0 ? Math.max(15, Math.round(minutes / 15) * 15) : undefined }
}

function takeDays(line: string): { rest: string; days?: number } {
  const m = line.match(/\b(?:in|over|within|give(?:\s+me)?|allow)?\s*(\d+)\s*(?:working\s+)?days?\b/i)
  if (!m) return { rest: line }
  return { rest: line.replace(m[0], ' '), days: Math.min(60, Math.max(1, Number(m[1]))) }
}

const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:\-–—•*·]+|[\s,.;:\-–—(]+$/g, '')
    .replace(/\b(?:by|due|before|on|until|for|in|over|within)$/i, '')
    .replace(/[\s,.;:\-–—(]+$/g, '')
    .trim()

function parseTask(line: string, now: Date): Item {
  const date = takeDate(line, now)
  const days = takeDays(date.rest)
  const est = takeEstimate(days.rest)
  const title = tidy(est.rest) || tidy(line)
  const item: Item = { title }
  if (date.date) item.dueDate = date.date
  if (days.days && !date.date) item.daysToComplete = days.days
  if (est.minutes) item.estimateMinutes = est.minutes
  return item
}

const category = (text: string) => CATEGORIES.find(([re]) => re.test(text))?.[1] ?? 'Other'

export function parseDump(text: string, now: Date = new Date()): SortedDump {
  const out: SortedDump = { projects: [], loose: [], expenses: [] }
  const byName = new Map<string, SortedDump['projects'][number]>()

  const project = (name: string, pay?: number) => {
    const key = name.toLowerCase()
    let p = byName.get(key)
    if (!p) {
      p = { name, tasks: [] }
      byName.set(key, p)
      out.projects.push(p)
    }
    if (pay && !p.pay) p.pay = pay
    return p
  }

  let current: ReturnType<typeof project> | null = null
  let lastTask: Item | null = null
  let taskIndent: number | null = null

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      current = null
      lastTask = null
      taskIndent = null
      continue
    }
    const indent = raw.match(/^[ \t]*/)![0].replace(/\t/g, '  ').length
    const line = raw.trim().replace(/^[-•*–]\s+/, '').replace(/^\d+[.)]\s+/, '')

    // Under a project heading the first indent level holds tasks; deeper
    // lines are subtasks of the task above. With no project, any indent is.
    if (current && indent > 0 && taskIndent === null) taskIndent = indent
    const base = current ? taskIndent ?? 0 : 0
    if (indent > base && lastTask) {
      lastTask.subtasks = [...(lastTask.subtasks ?? []), tidy(line)].filter(Boolean)
      continue
    }

    // "Maya logo £800:" starts a project.
    if (line.endsWith(':') && line.length > 1) {
      const { rest, amount } = takeMoney(line.slice(0, -1))
      const name = tidy(rest)
      if (name) {
        current = project(name, amount ?? undefined)
        lastTask = null
        taskIndent = null
        continue
      }
    }

    const { rest: noMoney, amount } = takeMoney(line)

    // Money plus a spending word is an expense, not a task.
    if (amount !== null && SPEND.test(line)) {
      const note = tidy(noMoney)
      out.expenses!.push({ amount, note: note || 'Spend', category: category(line) })
      lastTask = null
      continue
    }

    // "Maya: send invoice" puts a task straight into a project.
    let body = amount !== null && current ? noMoney : line
    let target = current
    const colon = body.match(/^([^:]{1,40}):\s+(.+)$/)
    if (colon && colon[1].trim().split(/\s+/).length <= 4) {
      target = project(tidy(colon[1]))
      body = colon[2]
    }
    if (amount !== null && target && !target.pay) target.pay = amount

    const task = parseTask(body, now)
    if (!task.title) continue
    if (target) target.tasks.push(task)
    else out.loose!.push(task)
    lastTask = task
  }

  out.projects = out.projects.filter((p) => p.tasks.length > 0 || p.pay)
  if (!out.loose!.length) delete out.loose
  if (!out.expenses!.length) delete out.expenses
  return out
}
