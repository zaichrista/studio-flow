import { useEffect, useState } from 'react'
import { toggleCare } from '../lib/actions'
import { fmtDuration, iso, toMin } from '../lib/dates'
import { useNow, useStore } from '../lib/store'
import { CARE, focusRun } from '../lib/wellbeing'
import { Sheet } from './Sheet'

const IN = 4
const OUT = 6
const ROUNDS = 6

/**
 * One slow minute: breathe in for 4, out for 6, six times. A longer
 * out-breath is a simple, well-used way to settle the body.
 */
function Breathe({ onClose }: { onClose: () => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const cycle = IN + OUT
  const round = Math.floor(tick / cycle)
  const inCycle = tick % cycle
  const breathingIn = inCycle < IN
  const finished = round >= ROUNDS
  return (
    <Sheet title="One slow minute" onClose={onClose}>
      <div className="breathe">
        <div className={`lung ${finished ? 'rest' : ''}`} style={{ ['--cycle' as string]: `${cycle}s`, ['--peak' as string]: `${(IN / cycle) * 100}%` }}>
          <span>{finished ? 'Lovely.' : breathingIn ? 'Breathe in' : 'And out, slowly'}</span>
        </div>
        <div className="faint small">
          {finished ? 'That was a minute just for you. Carry it with you.' : `${ROUNDS - round} ${ROUNDS - round === 1 ? 'breath' : 'breaths'} to go. Follow the circle.`}
        </div>
        <button className="btn quiet" onClick={onClose}>{finished ? 'Back to the day' : 'That’s enough for now'}</button>
      </div>
    </Sheet>
  )
}

/** A small card that looks after you, not the work: a breath, a nudge to pause, and four tiny acts of care. */
export function Care() {
  const { data, update } = useStore()
  const now = useNow(!!data.active)
  const [breathing, setBreathing] = useState(false)
  const today = iso()
  const done = data.days[today]?.care ?? []
  const run = focusRun(data, now)
  const all = CARE.every((c) => done.includes(c.key))

  const late = !!data.active && new Date(now).getHours() * 60 + new Date(now).getMinutes() > toMin(data.settings.dayEnd)
  const message = late
    ? 'You\u2019re working late. Finish the thought, then let yourself rest.'
    : run >= 75
      ? `You've been focused for ${fmtDuration(run * 60)}. A pause now makes the next hour easier.`
      : data.active
        ? 'In the flow. Remember to blink.'
        : all
          ? 'All looked after today. Lovely.'
          : done.length === 0
            ? 'Before the work, you. Small things count.'
            : 'Small things count. Keep going gently.'

  return (
    <section className="care">
      <div className="care-head">
        <div>
          <div className="eyebrow">Looking after you</div>
          <p className="care-msg">{message}</p>
        </div>
        <button className="breathe-btn" onClick={() => setBreathing(true)} aria-label="One slow minute of breathing">
          <i aria-hidden="true" />
          Breathe
        </button>
      </div>
      <div className="care-chips">
        {CARE.map((c) => {
          const on = done.includes(c.key)
          return (
            <button key={c.key} className={`care-chip ${on ? 'on' : ''} ${c.key}`} aria-pressed={on} title={c.hint} onClick={() => update((d) => toggleCare(d, today, c.key))}>
              <span className="ico" aria-hidden="true" />
              {c.label}
            </button>
          )
        })}
      </div>
      {breathing && <Breathe onClose={() => setBreathing(false)} />}
    </section>
  )
}
