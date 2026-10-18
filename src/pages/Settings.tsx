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
  on: 'On. A heads-up before each block, a nudge when it starts, and a gentle word at the end of the day.',
}

const BLOCK_MINUTES = [30, 45, 60, 90, 120]
const BREAK_MINUTES = [15, 30, 45, 60, 90, 120]
const LEAD_MINUTES = [0, 5, 10, 15, 30]
const WRAP_MINUTES = [0, 5, 10]
const BUFFER_MINUTES = [0, 5, 10, 15, 20, 30]
const WEEK_HOURS = [0, 15, 20, 25, 30, 35, 40, 45, 50]

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
  // Blocks sit on a 15-minute grid, so the pause after one rounds up to it.
  const pause = Math.ceil(s.bufferMinutes / 15) * 15
  const blocks = Math.floor((open + pause) / (s.blockMinutes + pause))
  return (
    <div className="dayline">
      <div className="track" aria-hidden="true">
        <div className="work" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />
        {s.breaks.map((br) => (
          <div key={br.id} className="rest" style={{ left: `${pct(toMinutes(br.start))}%`, width: `${pct(toMinutes(br.start) + br.minutes) - pct(toMinutes(br.start))}%` }} />
        ))}
      </div>
      <div className="faint small">
        {s.dayStart}–{s.dayEnd}. Room for about {blocks} {blocks === 1 ? 'block' : 'blocks'} of {s.blockMinutes} min a day around your breaks
        {s.bufferMinutes > 0 ? `, with ${s.bufferMinutes} min to breathe after each.` : '.'}
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
          <p className="soft small" style={{ marginTop: 0 }}>What the app calls you. Optional, and it stays on this iPad.</p>
          <label className="lab">
            Your name
            <input className="field" value={s.name} maxLength={30} autoComplete="given-name" placeholder="What should I call you?" onChange={(e) => set({ name: e.target.value })} />
          </label>
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

            <div className="lab-row">
              <Pick name="Breathing room after a block" value={s.bufferMinutes} onChange={(v) => set({ bufferMinutes: Number(v) }, true)}>
                {withCurrent(BUFFER_MINUTES, s.bufferMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'None, back to back' : `${m} minutes`}</option>)}
              </Pick>
              <Pick name="Most hours in a week" value={s.maxWeekHours} onChange={(v) => set({ maxWeekHours: Number(v) }, true)}>
                {withCurrent(WEEK_HOURS, s.maxWeekHours).map((h) => <option key={h} value={h}>{h === 0 ? 'No limit' : `${h} hours`}</option>)}
              </Pick>
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>When is your head clearest?</div>
              <Seg label="When is your head clearest" value={s.clearest} options={[['morning', 'Mornings'], ['afternoon', 'Afternoons'], ['any', "I don't mind"]]} onChange={(clearest) => set({ clearest }, true)} />
              <div className="faint small" style={{ marginTop: 8 }}>Focus work goes to those hours. Ideas and admin go to the other half of the day: a slightly less sharp mind is better at loose, creative thinking, and admin batches together instead of breaking up deep work.</div>
            </div>
            <div className="faint small">A short pause between blocks helps ideas settle. The weekly limit counts shifts too; once a week is full, work waits for the next one instead of creeping into your evenings.</div>
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
              <div className="small soft" style={{ marginBottom: 8 }}>Light & dark</div>
              <Seg label="Light and dark" value={s.look.theme} options={[['auto', 'Match iPad'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => setLook({ theme })} />
              <div className="faint small" style={{ marginTop: 8 }}>The sun in the top corner swaps them in one tap.</div>
            </div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Surfaces</div>
              <Seg label="Surfaces" value={s.look.surface} options={[['soft', 'Soft'], ['glass', 'Liquid glass']]} onChange={(surface) => setLook({ surface })} />
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
              <div className="small soft" style={{ marginBottom: 8 }}>Opening animation</div>
              <Seg label="Opening animation" value={s.splash} options={[['always', 'Every time'], ['daily', 'Once a day']]} onChange={(splash) => set({ splash })} />
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
            <div className="lab-row">
              <Pick name="Heads-up before a block" value={s.headsUpMinutes} onChange={(v) => set({ headsUpMinutes: Number(v) })}>
                {withCurrent(LEAD_MINUTES, s.headsUpMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'None, just at the start' : `${m} minutes before`}</option>)}
              </Pick>
              <Pick name="Wrap-up nudge while timing" value={s.wrapUpMinutes} onChange={(v) => set({ wrapUpMinutes: Number(v) })}>
                {withCurrent(WRAP_MINUTES, s.wrapUpMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'Off' : `${m} minutes before the end`}</option>)}
              </Pick>
            </div>
            <Pick name="Focus notification while timing" value={s.progressMinutes} onChange={(v) => set({ progressMinutes: Number(v) })}>
              {withCurrent([0, 10, 15, 20, 30], s.progressMinutes).map((m) => <option key={m} value={m}>{m === 0 ? 'Off' : `Refresh every ${m} minutes`}</option>)}
            </Pick>
            <div className="faint small">One notification that updates itself with time left and time done, replacing the last one. iPad web apps can't show a live ticking timer outside the app, so this is the closest thing.</div>
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>End-of-day nudge at {s.dayEnd}</div>
              <Seg label="End-of-day nudge" value={s.shutdownNudge ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => set({ shutdownNudge: v === 'on' })} />
            </div>
            <div className="faint small">Each nudge says what to start with: where you left off, the first step, or the next subtask. Invoice due dates and tax days get a quiet morning nudge too. The worker checks every 5 minutes, so nudges land within a few minutes of their time.</div>
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
