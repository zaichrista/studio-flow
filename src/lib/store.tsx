import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData, Client, Project, Settings } from '../types'
import { emptyData, PALETTE, replan } from './actions'
import { uid } from './id'
import { DEFAULT_SETTINGS } from './scheduler'

const KEY = 'studio-flow:v2'

/** Older saves kept the client as a name on each project; those names become clients. */
function migrateClients(parsed: AppData): Pick<AppData, 'clients' | 'projects'> {
  const clients: Client[] = [...(parsed.clients ?? [])]
  const projects = (parsed.projects ?? []).map((raw) => {
    const { client: name, ...p } = raw as Project & { client?: string }
    if (p.clientId !== undefined) return p
    let clientId: string | null = null
    if (name?.trim()) {
      let c = clients.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
      if (!c) {
        c = { id: uid(), name: name.trim(), email: '', notes: '', color: PALETTE[(clients.length + 2) % PALETTE.length] }
        clients.push(c)
      }
      clientId = c.id
    }
    return { ...p, clientId }
  })
  return { clients, projects }
}

/** Bring a save or backup from any earlier version up to the current shape. */
export function upgrade(parsed: AppData): AppData {
  const saved = (parsed.settings ?? {}) as Partial<Settings> & {
    lunchStart?: string
    lunchMinutes?: number
    pronouns?: string
    notifyLeadMinutes?: number
  }
  // Older saves had a single lunch; it becomes the first break, and dinner is added.
  const breaks =
    saved.breaks ??
    DEFAULT_SETTINGS.breaks.map((b) =>
      b.id === 'lunch' && saved.lunchStart
        ? { ...b, start: saved.lunchStart, minutes: saved.lunchMinutes ?? b.minutes }
        : b,
    )
  // Removed settings from earlier versions are dropped rather than carried along.
  // The single "extra heads-up" became the heads-up before every block.
  const headsUpMinutes = saved.headsUpMinutes ?? (saved.notifyLeadMinutes || DEFAULT_SETTINGS.headsUpMinutes)
  const { lunchStart: _a, lunchMinutes: _b, pronouns: _c, notifyLeadMinutes: _d, ...rest } = saved
  void _a
  void _b
  void _c
  void _d
  const { clients, projects } = migrateClients(parsed)
  return {
    ...emptyData(),
    ...parsed,
    clients,
    projects,
    ideas: parsed.ideas ?? [],
    days: parsed.days ?? {},
    settings: { ...DEFAULT_SETTINGS, ...rest, headsUpMinutes, breaks, look: { ...DEFAULT_SETTINGS.look, ...saved.look } },
  }
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.version === 1) return upgrade(parsed)
    }
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return emptyData()
}

interface Store {
  data: AppData
  update: (fn: (d: AppData) => AppData) => void
  replaceAll: (d: AppData) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => replan(load()))
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* storage full or unavailable */
    }
  }, [data])

  // Ask Safari not to evict our data when the device is short on space.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  // Re-plan when the app comes back to the foreground (missed blocks, new day).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setData((d) => replan(d))
    }
    document.addEventListener('visibilitychange', onVisible)
    const tick = setInterval(() => setData((d) => replan(d)), 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(tick)
    }
  }, [])

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), [])
  const replaceAll = useCallback((d: AppData) => setData(replan(upgrade(d))), [])
  const value = useMemo(() => ({ data, update, replaceAll }), [data, update, replaceAll])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

/** Re-renders every second while a timer is running, otherwise stays still. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return now
}
