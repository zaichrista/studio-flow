import { useRef, useState } from 'react'
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
          <div className="stack">
            <div>
              <div className="small soft" style={{ marginBottom: 8 }}>Work days</div>
              <div className="dayrow">
                {DAYS.map(([n, l], i) => (
                  <button key={i} className={`daybtn ${s.workDays.includes(n) ? 'on' : ''}`} onClick={() => toggleDay(n)} aria-pressed={s.workDays.includes(n)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="lab-row">
              <label className="lab">Day starts<input className="field" type="time" value={s.dayStart} onChange={(e) => e.target.value && set({ dayStart: e.target.value }, true)} /></label>
              <label className="lab">Day ends<input className="field" type="time" value={s.dayEnd} onChange={(e) => e.target.value && set({ dayEnd: e.target.value }, true)} /></label>
              <label className="lab">Lunch from<input className="field" type="time" value={s.lunchStart} onChange={(e) => e.target.value && set({ lunchStart: e.target.value }, true)} /></label>
              <label className="lab">Lunch (minutes)<input className="field" inputMode="numeric" value={s.lunchMinutes} onChange={(e) => set({ lunchMinutes: Math.max(0, Number(e.target.value) || 0) }, true)} /></label>
            </div>
            <div className="lab-row">
              <label className="lab">Days to finish a task<input className="field" inputMode="numeric" value={s.defaultTaskDays} onChange={(e) => set({ defaultTaskDays: Math.max(1, Number(e.target.value) || 1) })} /></label>
              <label className="lab">Block length (minutes)<input className="field" inputMode="numeric" value={s.blockMinutes} onChange={(e) => set({ blockMinutes: Math.max(15, Number(e.target.value) || 60) })} /></label>
            </div>
            <div className="faint small">New tasks use these. Existing blocks keep their length.</div>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 6 }}>AI sorter & notifications</h2>
          <p className="soft small" style={{ marginTop: 0 }}>These connect to your own small Cloudflare Worker, which keeps your API key off this page. See the README for the five-minute setup.</p>
          <div className="stack">
            <label className="lab">Worker address<input className="field" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://studio-flow.yourname.workers.dev" value={s.workerUrl} onChange={(e) => set({ workerUrl: e.target.value.trim() })} /></label>
            <label className="lab">Passphrase<input className="field" type="password" autoComplete="off" value={s.appToken} onChange={(e) => set({ appToken: e.target.value })} /></label>
            <label className="lab">Extra heads-up (minutes before a block)<input className="field" inputMode="numeric" value={s.notifyLeadMinutes} onChange={(e) => set({ notifyLeadMinutes: Math.max(0, Number(e.target.value) || 0) })} /></label>

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
