import type { AppData, Task } from '../types'
import { getVapidKey, sendTestPush, syncReminders } from './api'
import type { Reminder } from './api'
import { blockStart } from './actions'
import { addDays, iso, smallDate, stamp } from './dates'
import { workDates } from './scheduler'
import { awaitingPayment, invoiceDue, money, nextTaxDay } from './stats'

const SUB_KEY = 'studio-flow:push'

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const isStandalone = () =>
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function pushState(): PushState {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return localStorage.getItem(SUB_KEY) && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function storedSub(): PushSubscriptionJSON | null {
  try {
    const raw = localStorage.getItem(SUB_KEY)
    return raw ? (JSON.parse(raw) as PushSubscriptionJSON) : null
  } catch {
    return null
  }
}

/** Must be called from a tap: iPadOS only shows the permission prompt for user gestures. */
export async function enablePush(data: AppData): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed on this device.')
  const { publicKey } = await getVapidKey(data.settings)
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
  const json = sub.toJSON()
  localStorage.setItem(SUB_KEY, JSON.stringify(json))
  await syncReminders(data.settings, json, buildReminders(data))
}

export async function disablePush(data: AppData): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  const json = storedSub()
  await sub?.unsubscribe()
  localStorage.removeItem(SUB_KEY)
  if (json) await syncReminders(data.settings, json, []).catch(() => {})
}

export async function testPush(data: AppData): Promise<void> {
  const json = storedSub()
  if (!json) throw new Error('Turn notifications on first.')
  await sendTestPush(data.settings, json)
}

/** What to do first when a block begins: where you left off, the first step, or the next subtask. */
export function startHint(task: Task): string | null {
  if (task.resumeNote?.trim()) return `Pick up from: ${task.resumeNote.trim()}`
  if (task.firstStep?.trim()) return `Start by: ${task.firstStep.trim()}`
  const next = task.subtasks.find((x) => !x.done)
  return next ? `Start by: ${next.title}` : null
}

/** A morning time on the first work day on or after `date`, so money nudges stay in work hours. */
function workMorning(d: AppData, date: string): number {
  const day = workDates(date, 1, d.settings)[0] ?? date
  return stamp(day, '10:00')
}

/** Everything the worker should nudge about, with the exact time to send it. */
export function buildReminders(d: AppData, now = Date.now()): Reminder[] {
  const s = d.settings
  const lead = s.headsUpMinutes * 60_000
  const today = iso(new Date(now))
  const out: Reminder[] = []
  const add = (r: Reminder) => r.at >= now && out.push(r)

  for (const b of d.blocks) {
    if (!b.date || b.done || b.date === d.closedOn) continue
    const task = d.tasks.find((t) => t.id === b.taskId)
    if (!task) continue
    const start = blockStart(b)
    const hint = startHint(task)
    if (lead > 0) {
      add({
        id: `soon:${b.id}`,
        at: start - lead,
        title: `In ${s.headsUpMinutes} minutes: ${task.title}`,
        body: hint ? `Finish the thought you're on. ${hint}` : "Finish the thought you're on, get some water.",
      })
    }
    add({
      id: `block:${b.id}`,
      at: start,
      title: `Time for ${task.title}`,
      body: `${hint ? `${hint}. ` : ''}Tap to start the timer.`,
    })
  }

  const a = d.active
  if (a?.trial) {
    add({
      id: 'trial',
      at: a.startedAt + a.trial * 60_000,
      title: `That's ${a.trial} minutes.`,
      body: "Keep going if it's flowing. Stopping here counts too.",
    })
  }
  // One focus notification that refreshes itself while you work (the nearest
  // thing to a live timer that web apps on iPad allow).
  if (a && s.progressMinutes > 0) {
    const task = d.tasks.find((t) => t.id === a.taskId)
    const b = a.blockId ? d.blocks.find((x) => x.id === a.blockId) : undefined
    if (task) {
      const total = b ? b.minutes : a.trial ?? 60
      const before = b ? Math.floor(b.loggedSeconds / 60) : 0
      const step = s.progressMinutes
      for (let k = 1; k <= 12; k++) {
        const ran = k * step
        const left = total - before - ran
        // The wrap-up and "block complete" nudges already cover the very end.
        if (Math.abs(left) < 4 || (s.wrapUpMinutes > 0 && Math.abs(left - s.wrapUpMinutes) < 4)) continue
        if (left < -90) break
        add({
          id: `tick:${k}`,
          tag: 'focus',
          at: a.startedAt + ran * 60_000,
          title: left > 0 ? `${task.title} · ${left} min left` : `${task.title} · ${-left} min over`,
          body: left > 0 ? `${before + ran} min done. Tap for focus mode.` : 'You\u2019ve given it your time. Stop when the thought is finished.',
        })
      }
    }
  }
  if (a?.blockId) {
    const b = d.blocks.find((x) => x.id === a.blockId)
    const task = d.tasks.find((t) => t.id === a.taskId)
    if (b && task) {
      const at = a.startedAt + Math.max(0, b.minutes * 60 - b.loggedSeconds) * 1000
      if (s.wrapUpMinutes > 0) {
        add({
          id: 'wrap',
          tag: 'focus',
          at: at - s.wrapUpMinutes * 60_000,
          title: `${s.wrapUpMinutes} minutes left`,
          body: `${task.title}. Jot down where you're up to, so it's easy to pick back up.`,
        })
      }
      add({ id: 'timer', tag: 'focus', at, title: 'Block complete', body: `${task.title}. That's your time. Stop when you're ready, then step away for a bit.` })
    }
  }

  if (s.shutdownNudge) {
    for (const day of workDates(today, 7, s)) {
      if (day === d.closedOn) continue
      add({ id: `shutdown:${day}`, at: stamp(day, s.dayEnd), title: "That's the day.", body: 'Two minutes to put work away, then the evening is yours.' })
    }
  }

  for (const p of awaitingPayment(d)) {
    const due = invoiceDue(p, today)
    if (!due) continue
    const amount = p.pay > 0 ? `${money(p.pay)}. ` : ''
    add({ id: `inv:${p.id}:due`, at: workMorning(d, due.due), title: `${p.name}: invoice due today`, body: `${amount}If it hasn't landed, a friendly nudge is fine.` })
    add({ id: `inv:${p.id}:late`, at: workMorning(d, addDays(due.due, 7)), title: `${p.name} is a week late paying`, body: `${amount}Time to chase. You did the work.` })
  }

  const taxDay = nextTaxDay(today)
  for (const before of [30, 7]) {
    add({
      id: `tax:${taxDay}:${before}`,
      at: workMorning(d, addDays(taxDay, -before)),
      title: `Tax day is ${smallDate(taxDay)}`,
      body: `${before} days to go. Your tax pot is on the Money page.`,
    })
  }

  return out.sort((x, y) => x.at - y.at).slice(0, 200)
}

/** Push the latest reminder list to the worker if notifications are on. */
export async function syncIfEnabled(d: AppData): Promise<void> {
  if (pushState() !== 'on' || !d.settings.workerUrl) return
  const sub = storedSub()
  if (!sub) return
  await syncReminders(d.settings, sub, buildReminders(d))
}
