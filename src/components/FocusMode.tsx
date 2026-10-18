import { useEffect, useState } from 'react'
import { fmtClock, iso } from '../lib/dates'
import { activeSeconds } from '../lib/stats'
import { useNow, useStore } from '../lib/store'
import { zenLine } from '../lib/wellbeing'
import { useStopTimer } from './TimerDock'

let openIt: () => void = () => {}

/** Open the full-screen focus page (from Today or the timer bar). */
export const openFocus = () => openIt()

/** Without a planned block, a focus session counts down from an hour. */
const DEFAULT_SECONDS = 60 * 60
/** Outer ring counts down what's left; inner ring counts up what you've done. */
const R = 146
const C = 2 * Math.PI * R
const R2 = 122
const C2 = 2 * Math.PI * R2

const mmss = (s: number) => {
  const v = Math.max(0, Math.round(s))
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const sec = v % 60
  return h ? fmtClock(v) : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Keep the iPad's screen on while you focus. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const grab = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    grab()
    const again = () => document.visibilityState === 'visible' && grab()
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      lock?.release().catch(() => {})
    }
  }, [on])
}

/**
 * A quiet, full-screen page for deep work: one task, one ring counting down,
 * nothing else. The ring empties as the block runs; when it's done it says so
 * gently and suggests stepping away.
 */
export function FocusMode() {
  const { data } = useStore()
  const [open, setOpen] = useState(false)
  const now = useNow(open && !!data.active)
  const stop = useStopTimer()
  useEffect(() => {
    openIt = () => setOpen(true)
    return () => {
      openIt = () => {}
    }
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // Close quietly if the timer stops elsewhere.
  useEffect(() => {
    if (open && !data.active) setOpen(false)
  }, [open, data.active])
  useWakeLock(open && !!data.active)

  const a = data.active
  if (!open || !a) return null
  const task = data.tasks.find((t) => t.id === a.taskId)
  const block = a.blockId ? data.blocks.find((b) => b.id === a.blockId) : undefined
  const ran = activeSeconds(data, now)
  const total = block ? block.minutes * 60 : a.trial ? a.trial * 60 : DEFAULT_SECONDS
  const before = block?.loggedSeconds ?? 0
  const left = total - before - ran
  const over = left <= 0
  const frac = Math.max(0, Math.min(1, left / total))
  const up = Math.max(0, Math.min(1, (before + ran) / total))
  const hint = task?.resumeNote ? `Where you left off: ${task.resumeNote}` : task?.firstStep ? `Start by: ${task.firstStep}` : null

  return (
    <div className="focus-mode" role="dialog" aria-modal="true" aria-label={`Focusing on ${task?.title ?? 'your work'}`}>
      <button className="fm-leave" onClick={() => setOpen(false)}>Leave focus mode</button>

      <div className="fm-centre">
        <div className="eyebrow">{over ? 'Overtime' : 'In focus'}</div>
        <div className="fm-ring">
          <svg viewBox="0 0 320 320" aria-hidden="true">
            <circle cx="160" cy="160" r={R} className="bg" />
            {frac > 0 && <circle cx="160" cy="160" r={R} className="fg down" strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 160 160)" />}
            <circle cx="160" cy="160" r={R2} className="bg up" />
            {up > 0 && <circle cx="160" cy="160" r={R2} className="fg up" strokeDasharray={`${up * C2} ${C2}`} transform="rotate(-90 160 160)" />}
          </svg>
          <div className="fm-time">
            <div className={`t ${over ? 'over' : ''}`}>{over ? `+${mmss(-left)}` : mmss(left)}</div>
            <div className="s">{over ? <><span className="dot-up" />{mmss(before + ran)} done · overtime</> : <><span className="dot-up" />{mmss(before + ran)} done</>}</div>
          </div>
        </div>
        <h2 className="fm-task">{task?.title ?? 'Your work'}</h2>
        {over ? (
          <p className="fm-hint">
            {-left > 20 * 60
              ? 'You\u2019re well past your time. Stopping now is the kind thing; the work will be here tomorrow.'
              : 'That\u2019s your time. Lovely work. Stopping here is good; carrying on is allowed. Stand up, look far away, drink some water.'}
          </p>
        ) : (
          hint && <p className="fm-hint">{hint}</p>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn clay" onClick={() => { setOpen(false); stop() }}>{over ? 'Stop and step away' : 'Stop'}</button>
        </div>
      </div>

      <p className="fm-zen">{zenLine(iso())}</p>
    </div>
  )
}
