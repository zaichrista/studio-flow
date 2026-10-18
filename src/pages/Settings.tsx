import { useRef, useState } from 'react'
import { Pick, Seg, mins, timeOptions, toMinutes, withCurrent } from '../components/Fields'
import { toast } from '../components/Toast'
import { replan } from '../lib/actions'
import { uid } from '../lib/id'
import { DEFAULT_SETTINGS } from '../lib/scheduler'
import { disablePush, enablePush, pushState, testPush } from '../lib/push'
import type { PushState } from '../lib/push'
import { useStore } from '../lib/store'
import type { AppData, Break, Look, Settings as S } from '../types'

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

const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns']
const BLOCK_MINUTES = [30, 45, 60, 90, 120]
const BREAK_MINUTES = [15, 30, 45, 60, 90, 120]
const LEAD_MINUTES = [0, 5, 10, 15, 30]

const PALETTES: { id: Look['palette']; name: string; color: string }[] = [
  { id: 'blush', name: 'Blush', color: '#f9eeea' },
  { id: 'linen', name: 'Linen', color: '#f6f1e8' },
  { id: 'sage', name: 'Sage', color: '#eef2ed' },
  { id: 'lilac', name: 'Lilac', color: '#f1edf6' },
]

function DayLine({ s }: { s: S }) {
  const a = toMinutes(s.dayStart)
  const b = toMinutes(s.dayEnd)
  const min = 300
  const max = 23 * 60 + 30
  const pct = (m: number) => ((Math.min(max, Math.max(min, m)) - min) / (max - min)) * 100
  const overlap = (br: Break) => {
    const from = toMinutes(br.start)
    return Math.max(0, Math.min(b, from + br.minutes) - Math.max(a, from))
  }
  const open = Math.max(0, b - a - s.breaks.reduce((n, br) => n + overlap(br), 0))
  const blocks = Math.floor(open / s.blockMinutes)
  return (
    <div className="dayline">
      <div className="track" aria-hidden="true">
        <div className="work" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />
        {s.breaks.map((br) => (
          <div key={br.id} className="rest" style={{ left: `${pct(toMinutes(br.start))}%`, width: `${pct(toMinutes(br.start) + br.minutes) - pct(toMinutes(br.start))}%` }} />
        ))}
      </div>
      <div className="faint small">
        {s.dayStart}–{s.dayEnd}. Room for {blocks} {blocks === 1 ? 'block' : 'blocks'} of {s.blockMinutes} min a day around your breaks.
      </div>
    </div>
  )
}

function BreaksEditor({ s, set }: { s: S; set: (patch: Partial<S>, replanAfter?: boolean) => void }) {
  const change = (id: string, patch: Partial<Break>, replanAfter = true) =>
    set({ breaks: s.breaks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }, replanAfter)
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="small soft">Daily breaks. Work is never planned over these.</div>
      {s.breaks.length === 0 && <div className="faint small">No breaks yet.</div>}
      {s.breaks.map((b) => (
        <div key={b.id} className="break-row">
          <input className="field" aria-label="Break name" value={b.name} onChange={(e) => change(b.id, { name: e.target.value }, false)} />
          <select className="field" aria-label={`${b.name} starts`} value={b.start} onChange={(e) => change(b.id, { start: e.target.value })}>
            {timeOptions(5 * 60, 23 * 60 + 30, 15, b.start).map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="field" aria-label={`${b.name} length`} value={b.minutes} onChange={(e) => change(b.id, { minutes: Number(e.target.value) })}>
            {withCurrent(BREAK_MINUTES, b.minutes).map((m) => <option key={m} value={m}>{mins(m)}</option>)}
          </select>
          <button className="icon-btn" aria-label={`Remove ${b.name}`} onClick={() => set({ breaks: s.breaks.filter((x) => x.id !== b.id) }, true)}>×</button>
        </div>
      ))}
      <div>
        <button className="btn quiet small" onClick={() => set({ breaks: [...s.breaks, { id: uid(), name: 'Break', start: '15:30', minutes: 30 }] }, true)}>Add a break</button>
      </div>
    </div>
  )
}

export function Settings() {
  const { data, update, replaceAll } = useStore()
  const s = data.settings
  const [push, setPush] = useState<PushState>(pushState)
  const [busy, setBusy] = useState(false)
  const [customPronouns, setCustomPronouns] = useState(() => !!s.pronouns && !PRONOUNS.includes(s.pronouns))
  const file = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<S>, replanAfter = false) =>
    update((d) => {
      const next = { ...d, settings: { ...d.settings, ...patch } }
      return replanAfter ? replan(next) : next
    })

  const setLook = (patch: Partial<Look>) =>
    update((d) => ({ ...d, settings: { ...d.settings, look: { ...d.settings.look, ...patch } } }))

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
          <h2 style={{ marginBottom: 6 }}>About you</h2>
          <p className="soft small" style={{ marginTop: 0 }}>How the app addresses you. Both are optional, and stay on this iPad.</p>
          <div className="lab-row">
            <label className="lab">
              Your name
              <input className="field" value={s.name} maxLength={30} autoComplete="given-name" placeholder="What should I call you?" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <Pick
              name="Your pronouns"
              value={customPronouns ? 'custom' : s.pronouns}
              onChange={(v) => {
                if (v === 'custom') {
                  setCustomPronouns(true)
                  set({ pronouns: '' })
                } else {
                  setCustomPronouns(false)
                  set({ pronouns: v })
                }
              }}
            >
              <option value="">Not shown</option>
              {PRONOUNS.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="custom">Something else…</option>
            </Pick>
          </div>
          {customPronouns && (
            <label className="lab" style={{ marginTop: 14 }}>
              In your own words
              <input className="field" value={s.pronouns} maxLength={24} placeholder="e.g. xe/xem" onChange={(e) => set({ pronouns: e.target.value })} autoFocus />
            </label>
          )}
        </section>

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
                {timeOptions(5 * 60, toMinutes(s.dayEnd) - s.blockMinutes, 30, s.dayStart).map((t) => <option key={t}>{t}</option>)}
              </Pick>
              <Pick name="Day ends" value={s.dayEnd} onChange={(v) => set({ dayEnd: v }, true)}>
                {timeOptions(toMinutes(s.dayStart) + s.blockMinutes, 23 * 60 + 30, 30, s.dayEnd).map((t) => <option key={t}>{t}</option>)}
              </Pick>
            </div>

            <BreaksEditor s={s} set={set} />

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
          <h2 style={{ marginBottom: 6 }}>Look & layout</h2>
          <p className="soft small" style={{ marginTop: 0 }}>Try things out. Nothing here touches your data, and it all changes instantly.</p>
          <div className="stack" style={{ gap: 22 }}>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Colours</div>
              <div className="swatches" role="radiogroup" aria-label="Colours">
                {PALETTES.map((p) => (
                  <button key={p.id} role="radio" aria-checked={s.look.palette === p.id} className={`swatch ${s.look.palette === p.id ? 'on' : ''}`} onClick={() => setLook({ palette: p.id })}>
                    <i style={{ background: p.color }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Menu</div>
              <Seg label="Menu" value={s.look.nav} options={[['auto', 'Fits the screen'], ['rail', 'Side menu'], ['bar', 'Bottom bar']]} onChange={(nav) => setLook({ nav })} />
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Spacing</div>
              <Seg label="Spacing" value={s.look.density} options={[['compact', 'Compact'], ['cozy', 'Cosy'], ['airy', 'Airy']]} onChange={(density) => setLook({ density })} />
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Today page</div>
              <Seg label="Today layout" value={s.look.today} options={[['focus', 'One column'], ['split', 'Two columns']]} onChange={(today) => setLook({ today })} />
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Calendar</div>
              <Seg label="Calendar layout" value={s.look.week} options={[['grid', 'Week grid'], ['agenda', 'List'], ['day', 'One day']]} onChange={(week) => setLook({ week })} />
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Board</div>
              <Seg label="Board layout" value={s.look.board} options={[['columns', 'Columns'], ['stacked', 'Stacked']]} onChange={(board) => setLook({ board })} />
            </div>
            <div>
              <button className="btn ghost small" onClick={() => setLook({ ...DEFAULT_SETTINGS.look })}>Reset to the original look</button>
            </div>
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
