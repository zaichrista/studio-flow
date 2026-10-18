import { buildPushPayload } from '@block65/webcrypto-web-push'
import type { PushSubscription } from '@block65/webcrypto-web-push'

interface Env {
  REMINDERS: KVNamespace
  ANTHROPIC_API_KEY: string
  APP_TOKEN: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  ALLOWED_ORIGIN: string
  MODEL: string
  /** Minutes between cron checks; must match the cron in wrangler.toml */
  TICK_MINUTES: string
}

interface Reminder {
  id: string
  at: number
  title: string
  body: string
  /** Same tag = replaces the previous notification instead of stacking */
  tag?: string
}

interface Stored {
  subscription: PushSubscription
  reminders: Reminder[]
}

/** Reminders more than this late are dropped rather than sent out of date. */
const STALE_MS = 30 * 60_000
const MAX_DUMP_CHARS = 8000

const SORT_SYSTEM = `You tidy up a freelance designer's messy brain dump into a structured plan.

Rules:
- Group work under projects. If a line mentions a project or client that already exists (names provided), reuse that exact project name.
- "pay" is the fixed fee for the whole project in pounds sterling. Only set it if the text states an amount for the project. Never guess.
- Break big tasks into short, concrete subtasks only when the text implies several steps. Do not pad.
- "estimateMinutes" is the total working time for the task, in multiples of 15. Only set it if the text says how long it takes, or if it is obvious.
- "dueDate" is an ISO date (YYYY-MM-DD). Resolve words like "Friday" or "next week" against today's date. Only set it if the text gives a deadline.
- "daysToComplete" is a number of working days, only if the text says e.g. "give me 5 days for this".
- Anything that is not client or design work and is not a purchase goes in "loose".
- "firstStep" is the smallest concrete action that starts a task, under 8 words (e.g. "Open the Maya Figma file"). Take it from the user's words or the first subtask; leave it out if nothing obvious fits.
- "kind" is "focus" (making the actual work), "ideas" (brainstorming, moodboards, concepts, sketching, exploring) or "admin" (emails, invoices, calls, booking, sending). Always set it.
- Ideas, musings, "what if…" thoughts, inspiration and things to remember that are not actions go in "ideas", in the user's own words. Put them on the project they belong to, or in the top-level "ideas" if they belong to none. Never turn an idea into a task.
- Money the designer spent or must spend (software, supplies, bills) goes in "expenses" with an amount in pounds; leave out amounts you cannot read.
- Never invent tasks, amounts or dates. Keep the user's own wording for titles, tidied lightly.
- Put anything you could not place in "notes" as one short sentence.`

const SORT_SCHEMA = {
  type: 'object',
  properties: {
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          client: { type: 'string' },
          pay: { type: 'number' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                subtasks: { type: 'array', items: { type: 'string' } },
                estimateMinutes: { type: 'number' },
                dueDate: { type: 'string' },
                daysToComplete: { type: 'number' },
                firstStep: { type: 'string' },
                kind: { type: 'string', enum: ['focus', 'ideas', 'admin'] },
              },
              required: ['title'],
            },
          },
          ideas: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'tasks'],
      },
    },
    loose: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtasks: { type: 'array', items: { type: 'string' } },
          estimateMinutes: { type: 'number' },
          dueDate: { type: 'string' },
          daysToComplete: { type: 'number' },
          firstStep: { type: 'string' },
          kind: { type: 'string', enum: ['focus', 'ideas', 'admin'] },
        },
        required: ['title'],
      },
    },
    ideas: { type: 'array', items: { type: 'string' } },
    expenses: {
      type: 'array',
      items: {
        type: 'object',
        properties: { amount: { type: 'number' }, note: { type: 'string' }, category: { type: 'string' } },
        required: ['amount', 'note'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['projects'],
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = origin === env.ALLOWED_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return allowed
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        vary: 'origin',
      }
    : {}
}

function json(body: unknown, req: Request, env: Env, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(req, env) },
  })
}

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function keyFor(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return 'sub:' + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * KV's free tier allows far fewer list() calls than a once-a-minute cron makes,
 * so the subscriptions are tracked in one small index key that is simply read.
 */
const INDEX = 'index'

async function readIndex(env: Env): Promise<string[]> {
  return (await env.REMINDERS.get<string[]>(INDEX, 'json')) ?? []
}

async function indexAdd(env: Env, key: string): Promise<void> {
  const index = await readIndex(env)
  if (!index.includes(key)) await env.REMINDERS.put(INDEX, JSON.stringify([...index, key]))
}

async function indexRemove(env: Env, key: string): Promise<void> {
  const index = await readIndex(env)
  if (index.includes(key)) await env.REMINDERS.put(INDEX, JSON.stringify(index.filter((k) => k !== key)))
}

function validSubscription(s: unknown): s is PushSubscription {
  const sub = s as PushSubscription | undefined
  return (
    !!sub &&
    typeof sub.endpoint === 'string' &&
    sub.endpoint.startsWith('https://') &&
    typeof sub.keys?.p256dh === 'string' &&
    typeof sub.keys?.auth === 'string'
  )
}

async function push(env: Env, sub: PushSubscription, title: string, body: string, tag: string): Promise<number> {
  const payload = await buildPushPayload(
    { data: JSON.stringify({ title, body, tag }), options: { ttl: 60 * 30, urgency: 'high' } },
    sub,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  )
  const res = await fetch(sub.endpoint, payload)
  return res.status
}

async function sort(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    text?: string
    today?: string
    workDays?: number[]
    defaultTaskDays?: number
    projects?: string[]
  } | null
  const text = body?.text?.trim()
  if (!text) return json({ error: 'Nothing to sort.' }, req, env, 400)
  if (text.length > MAX_DUMP_CHARS) return json({ error: 'That dump is too long. Split it in two.' }, req, env, 413)

  const context = [
    `Today is ${body?.today ?? new Date().toISOString().slice(0, 10)}.`,
    body?.projects?.length ? `Existing projects: ${body.projects.join('; ')}.` : 'There are no existing projects yet.',
  ].join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.MODEL,
      max_tokens: 4096,
      system: SORT_SYSTEM,
      tools: [{ name: 'save_plan', description: 'Save the organised plan.', input_schema: SORT_SCHEMA }],
      tool_choice: { type: 'tool', name: 'save_plan' },
      messages: [{ role: 'user', content: `${context}\n\nBrain dump:\n${text}` }],
    }),
  })
  if (!res.ok) {
    console.error('anthropic error', res.status, await res.text())
    return json({ error: 'The AI could not sort that just now. Try again in a moment.' }, req, env, 502)
  }
  const out = (await res.json()) as { content: { type: string; input?: unknown }[] }
  const tool = out.content.find((c) => c.type === 'tool_use')
  if (!tool?.input) return json({ error: 'The AI sent back nothing usable.' }, req, env, 502)
  return json(tool.input, req, env)
}

async function sync(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { subscription?: unknown; reminders?: Reminder[] } | null
  if (!validSubscription(body?.subscription)) return json({ error: 'Bad subscription.' }, req, env, 400)
  const key = await keyFor(body!.subscription.endpoint)
  const reminders = (body!.reminders ?? [])
    .filter((r) => typeof r.at === 'number' && typeof r.id === 'string')
    .slice(0, 200)
    .map((r) => ({
      id: r.id,
      at: r.at,
      title: String(r.title).slice(0, 80),
      body: String(r.body).slice(0, 160),
      ...(typeof r.tag === 'string' ? { tag: r.tag.slice(0, 40) } : {}),
    }))
  if (reminders.length === 0) {
    await env.REMINDERS.delete(key)
    await indexRemove(env, key)
  } else {
    await env.REMINDERS.put(key, JSON.stringify({ subscription: body!.subscription, reminders } satisfies Stored))
    await indexAdd(env, key)
  }
  return json({ ok: true }, req, env)
}

async function test(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null
  if (!validSubscription(body?.subscription)) return json({ error: 'Bad subscription.' }, req, env, 400)
  const status = await push(env, body!.subscription, 'Studio Flow', 'Notifications are working. Take a breath.', 'test')
  return status < 300 ? json({ ok: true }, req, env) : json({ error: `Push service said ${status}.` }, req, env, 502)
}

async function sendDue(env: Env): Promise<void> {
  const now = Date.now()
  for (const name of await readIndex(env)) {
    const stored = await env.REMINDERS.get<Stored>(name, 'json')
    if (!stored) {
      await indexRemove(env, name)
      continue
    }
    // Nudges about what's coming (a block, its heads-up, the end of the day)
    // go out up to one tick early so they never arrive late. Anything else
    // (e.g. "your hour is up") is only sent once it is really due.
    const ahead = (Number(env.TICK_MINUTES) || 0) * 60_000
    const early = (r: Reminder) => /^(block|soon|shutdown):/.test(r.id)
    const isDue = (r: Reminder) => r.at <= now + (early(r) ? ahead : 0)
    const due = stored.reminders.filter(isDue)
    if (due.length === 0) continue
    const keep = stored.reminders.filter((r) => !isDue(r))
    let gone = false
    for (const r of due) {
      if (now - r.at > STALE_MS) continue
      try {
        const status = await push(env, stored.subscription, r.title, r.body, r.tag ?? r.id)
        if (status === 404 || status === 410) gone = true
      } catch (err) {
        console.error('push failed', err)
      }
    }
    if (gone || keep.length === 0) {
      await env.REMINDERS.delete(name)
      await indexRemove(env, name)
    } else {
      await env.REMINDERS.put(name, JSON.stringify({ subscription: stored.subscription, reminders: keep } satisfies Stored))
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) })

    const origin = req.headers.get('origin')
    if (origin && Object.keys(cors(req, env)).length === 0) return new Response('Forbidden', { status: 403 })

    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
    if (!sameSecret(bearer, env.APP_TOKEN)) return json({ error: 'Unauthorised' }, req, env, 401)

    const { pathname } = new URL(req.url)
    try {
      if (req.method === 'GET' && pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY }, req, env)
      if (req.method === 'POST' && pathname === '/sort') return await sort(req, env)
      if (req.method === 'POST' && pathname === '/sync') return await sync(req, env)
      if (req.method === 'POST' && pathname === '/test') return await test(req, env)
    } catch (err) {
      console.error(err)
      return json({ error: 'Something went wrong on the worker.' }, req, env, 500)
    }
    return json({ error: 'Not found' }, req, env, 404)
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await sendDue(env)
  },
}
