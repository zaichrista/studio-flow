import type { Settings, SortedDump } from '../types'

export interface Reminder {
  id: string
  /** Epoch ms when the push should be sent */
  at: number
  title: string
  body: string
  /** Notifications with the same tag replace each other instead of piling up */
  tag?: string
}

export class ApiError extends Error {}

function endpoint(s: Settings, path: string): string {
  if (!s.workerUrl.trim()) throw new ApiError('Add your worker address in Settings first.')
  return s.workerUrl.replace(/\/+$/, '') + path
}

async function call<T>(s: Settings, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(endpoint(s, path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.appToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach your worker. Check the address and your connection.')
  }
  if (res.status === 401) throw new ApiError('The worker rejected your passphrase. Check it in Settings.')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(text || `The worker answered with ${res.status}.`)
  }
  return (await res.json()) as T
}

export interface SortContext {
  today: string
  workDays: number[]
  defaultTaskDays: number
  projects: string[]
}

export const sortDump = (s: Settings, text: string, ctx: SortContext) =>
  call<SortedDump>(s, '/sort', { text, ...ctx })

export const getVapidKey = (s: Settings) => call<{ publicKey: string }>(s, '/vapid')

export const syncReminders = (s: Settings, subscription: PushSubscriptionJSON, reminders: Reminder[]) =>
  call<{ ok: true }>(s, '/sync', { subscription, reminders })

export const sendTestPush = (s: Settings, subscription: PushSubscriptionJSON) =>
  call<{ ok: true }>(s, '/test', { subscription })
