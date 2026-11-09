import { toggleCare } from '../lib/actions'
import { fmtDuration, iso } from '../lib/dates'
import { lastWindowEnd } from '../lib/scheduler'
import { useNow, useStore } from '../lib/store'
import { CARE, focusRun } from '../lib/wellbeing'
import { openStillness } from './Meditate'

/** A small card that looks after you, not the work: a breath, a nudge to pause, and four tiny acts of care. */
export function Care() {
  const { data, update } = useStore()
  const now = useNow(!!data.active)
  const today = iso()
  const done = data.days[today]?.care ?? []
  const run = focusRun(data, now)
  const all = CARE.every((c) => done.includes(c.key))

  const endMin = lastWindowEnd(today, data.settings)
  const late = !!data.active && endMin !== null && new Date(now).getHours() * 60 + new Date(now).getMinutes() > endMin
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
        <button className="breathe-btn" onClick={() => openStillness()} aria-label="Stillness: breathing and meditation">
          <i aria-hidden="true" />
          Pause
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
    </section>
  )
}
