import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData } from '../types'
import { emptyData, replan } from './actions'
import { DEFAULT_SETTINGS } from './scheduler'

const KEY = 'studio-flow:v2'

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.version === 1) {
        return { ...emptyData(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }
      }
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
  const replaceAll = useCallback((d: AppData) => setData(replan({ ...emptyData(), ...d })), [])
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
