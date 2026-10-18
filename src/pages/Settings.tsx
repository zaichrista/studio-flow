import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from '../components/Toast'
import { replan } from '../lib/actions'
import { disablePush, enablePush, pushState, testPush } from '../lib/push'
import type { PushState } from '../lib/push'
import { useStore } from '../lib/store'
import type { AppData, Settings as S } from '../types'

const DAYS = [
  [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S'],
] as const

const PUSH_COPY: Record<PushState, string> = {
  unsupported: 'This browser cannot receive push notifications.',
  'needs-install': 'On iPad, open this page in Safari, tap Share, then “Add to Home Screen”, and open it from the Home Screen. Then come back here.',
  blocked: 'Notifications are blocked. Turn them on in iPad Settings → Notifications → Studio Flow.',
  off: 'Off. Turn on to get a nudge before each block, even when the app is closed.',
  on: 'On. You will be nudged before each block, and when a timed hour is up.',
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const label = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Times from `from` to `to` (minutes) in steps, always including the saved value. */
function times(from: number, to: number, step: number, current: string): string[] {
  const out: number[] = []
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) out.push(m)
  const cur = toMinutes(current)
  if (!out.includes(cur)) out.push(cur)
  return out.sort((a, b) => a - b).map(label)
}

const withCurrent = (opts: number[], current: number) => (opts.includes(current) ? opts : [...opts, current].sort((a, b) => a - b))

function Pick({ name, value, onChange, children }: { name: string; value: string | number; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="lab">
      {name}
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

const BLOCK_MINUTES = [30, 45, 60, 90, 120]
const LUNCH_MINUTES = [0, 30, 45, 60, 90]
const LEAD_MINUTES = [0, 5, 10, 15, 30]
const mins = (m: number) => (m === 0 ? 'None' : m === 60 ? '1 hour' : m === 90 ? '1½ hours' : m === 120 ? '2 hours' : `${m} minutes`)

function DayLine({ s }: { s: S }) {
  const a = toMinutes(s.dayStart)
  const b = toMinutes(s.dayEnd)
  const lunch = s.lunchMinutes > 0 ? toMinutes(s.lunchStart) : null
  const pct = (m: number) => ((m - 300) / (23 * 60 - 300)) * 100
  const open = Math.max(0, b - a - s.lunchMinutes)
  const blocks = Math.floor(open / s.blockMinutes)
  return (
    <div className="dayline">
      <div className="track" aria-hidden="true">
        <div className="work" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />
        {lunch !== null && <div className="rest" style={{ left: `${pct(lunch)}%`, width: `${(s.lunchMinutes / (23 * 60 - 300)) * 100}%` }} />}
      </div>
      <div className="faint small">
        {s.dayStart}–{s.dayEnd}, with {s.lunchMinutes > 0 ? `${mins(s.lunchMinutes)} for lunch` : 'no lunch break'}. Room for {blocks} {blocks === 1 ? 'block' : 'blocks'} of {s.blockMinutes} min a day.
      </div>
    </div>
  )
}

export function Settings() {
  const { data, update, replaceAll } = useStore()
  const s = data.settings
  const [push, setPush] = useState<PushState>(pushState)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<S>, replanAfter = false) =>
    update((d) => {
      const next = { ...d, settings: { ...d.settings, ...patch } }
      return replanAfter ? replan(next) : next
    })

  const toggleDay = (n: number) => {
    const days = s.workDays.includes(n) ? s.workDays.filter((x) => x !== n) : [...s.workDays, n]
    set({ workDays: days }, true)
  }

  const pushAction = async (fn: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await fn()
      toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setPush(pushState())
      setBusy(false)
    }
  }

  const exportData = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `studio-flow-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (f: File | undefined) => {
    if (!f) return
    try {
      const parsed = JSON.parse(await f.text()) as AppData
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) throw new Error('bad')
      if (!confirm('Replace everything in the app with this backup?')) return
      replaceAll(parsed)
      toast('Backup restored.')
    } catch {
      toast('That file is not a Studio Flow backup.')
    }
  }

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Make it yours.</h1>
        </div>
      </div>

      <div className="stack" style={{ gap: 32 }}>
        <section className="card">
          <h2 style={{ marginBottom: 18 }}>Your week</h2>
          <div className="stack" style={{ gap: 22 }}>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Work days</div>
              <div className="dayrow">
                {DAYS.map(([n, l], i) => (
                  <button key={i} className={`daybtn ${s.workDays.includes(n) ? 'on' : ''}`} onClick={() => toggleDay(n)} aria-pressed={s.workDays.includes(n)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="lab-row">
              <Pick name="Day starts" value={s.dayStart} onChange={(v) => set({ dayStart: v }, true)}>
                {times(5 * 60, toMinutes(s.dayEnd) - s.blockMinutes, 30, s.dayStart).map((t) => <option key={t}>{t}</option>)}
              </Pick>
              <Pick name="Day ends" value={s.dayEnd} onChange={(v) => set({ dayEnd: v }, true)}>
                {times(toMinutes(s.dayStart) + s.blockMinutes, 23 * 60 + 30, 30, s.dayEnd).map((t) => <option key={t}>{t}</option>)}
              </Pick>
              <Pick name="Lunch" value={s.lunchMinutes} onChange={(v) => set({ lunchMinutes: Number(v) }, true)}>
                {withCurrent(LUNCH_MINUTES, s.lunchMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'No lunch break' : mins(m)}</option>)}
              </Pick>
              {s.lunchMinutes > 0 && (
                <Pick name="Lunch starts" value={s.lunchStart} onChange={(v) => set({ lunchStart: v }, true)}>
                  {times(toMinutes(s.dayStart), toMinutes(s.dayEnd) - s.lunchMinutes, 15, s.lunchStart).map((t) => <option key={t}>{t}</option>)}
                </Pick>
              )}
            </div>

            <DayLine s={s} />

            <div className="lab-row">
              <Pick name="Days to finish a task" value={s.defaultTaskDays} onChange={(v) => set({ defaultTaskDays: Number(v) })}>
                {withCurrent([1, 2, 3, 4, 5, 6, 7, 10], s.defaultTaskDays).map((d) => <option key={d} value={d}>{d} working {d === 1 ? 'day' : 'days'}</option>)}
              </Pick>
              <Pick name="Block length" value={s.blockMinutes} onChange={(v) => set({ blockMinutes: Number(v) })}>
                {withCurrent(BLOCK_MINUTES, s.blockMinutes).map((m) => <option key={m} value={m}>{mins(m)}</option>)}
              </Pick>
            </div>
            <div className="faint small">New tasks use these. Blocks already on your calendar keep their length.</div>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 6 }}>AI sorter & notifications</h2>
          <p className="soft small" style={{ marginTop: 0 }}>These connect to your own small Cloudflare Worker, which keeps your API key off this page. See the README for the five-minute setup.</p>
          <div className="stack">
            <label className="lab">Worker address<input className="field" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://studio-flow.yourname.workers.dev" value={s.workerUrl} onChange={(e) => set({ workerUrl: e.target.value.trim() })} /></label>
            <label className="lab">Passphrase<input className="field" type="password" autoComplete="off" value={s.appToken} onChange={(e) => set({ appToken: e.target.value })} /></label>
            <Pick name="Extra heads-up before a block" value={s.notifyLeadMinutes} onChange={(v) => set({ notifyLeadMinutes: Number(v) })}>
              {withCurrent(LEAD_MINUTES, s.notifyLeadMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'None' : `${m} minutes earlier`}</option>)}
            </Pick>
            <div className="faint small">The worker checks every 15 minutes, so a block's reminder arrives up to 15 minutes before it starts, plus any extra you add here.</div>
            <div className={`notice ${push === 'on' ? 'ok' : ''}`}>{PUSH_COPY[push]}</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {push === 'on' ? (
                <>
                  <button className="btn quiet" disabled={busy} onClick={() => pushAction(() => testPush(data), 'Test sent. Look for it on your lock screen.')}>Send a test</button>
                  <button className="btn ghost" disabled={busy} onClick={() => pushAction(() => disablePush(data), 'Notifications off.')}>Turn off</button>
                </>
              ) : (
                <button className="btn" disabled={busy || push === 'needs-install' || push === 'unsupported' || push === 'blocked' || !s.workerUrl || !s.appToken} onClick={() => pushAction(() => enablePush(data), 'Notifications on.')}>Turn on notifications</button>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 6 }}>Your data</h2>
          <p className="soft small" style={{ marginTop: 0 }}>Everything lives on this iPad only. Save a backup now and then, especially before clearing Safari data.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn quiet" onClick={exportData}>Save a backup</button>
            <button className="btn ghost" onClick={() => file.current?.click()}>Restore a backup</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { importData(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </section>
      </div>
    </div>
  )
}
