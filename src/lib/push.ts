import type { AppData } from '../types'
import { getVapidKey, sendTestPush, syncReminders } from './api'
import type { Reminder } from './api'
import { blockStart } from './actions'
import { fmtDuration } from './dates'

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

/** Everything the worker should nudge about, with the exact time to send it. */
export function buildReminders(d: AppData, now = Date.now()): Reminder[] {
  const lead = d.settings.notifyLeadMinutes * 60_000
  const out: Reminder[] = []
  for (const b of d.blocks) {
    if (!b.date || b.done) continue
    const task = d.tasks.find((t) => t.id === b.taskId)
    if (!task) continue
    const start = blockStart(b)
    const at = start - lead
    if (at < now) continue
    out.push({
      id: `block:${b.id}`,
      at,
      title: `Coming up at ${b.start}`,
      body: `${task.title} · ${fmtDuration(b.minutes * 60)}`,
    })
  }
  const a = d.active
  if (a?.blockId) {
    const b = d.blocks.find((x) => x.id === a.blockId)
    const task = d.tasks.find((t) => t.id === a.taskId)
    if (b && task) {
      const at = a.startedAt + Math.max(0, b.minutes * 60 - b.loggedSeconds) * 1000
      if (at > now) {
        out.push({ id: 'timer', at, title: 'Block complete', body: `${task.title} — that's your hour. Stop the timer when you're ready.` })
      }
    }
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
