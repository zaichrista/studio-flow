import { useState } from 'react'
import { openStillness } from '../components/Meditate'
import { useDayMinutes } from '../components/Sky'
import { fmtDuration, iso, longDate } from '../lib/dates'
import { useStore } from '../lib/store'
import { SESSIONS, stillWeek } from '../lib/stillness'
import { breakNow, DESK, gratitudePrompt, recentGood, routineSeconds, ROUTINES } from '../lib/wellness'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** A place of its own for looking after yourself on a break: stretch, breathe, be grateful. */
export function Wellness() {
  const { data } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const today = iso()
  const minutes = useDayMinutes()
  const br = breakNow(data, minutes, today)
  const week = stillWeek(data, today)
  const todayIdx = (new Date().getDay() + 6) % 7
  const good = data.days[today]?.good ?? []
  const past = recentGood(data, 5, today).filter((g) => g.date !== today)
  const breathing = SESSIONS.filter((s) => ['breathe', 'box', 'scan', 'sit'].includes(s.id))

  return (
    <div className="page wellness">
      <div className="head">
        <div>
          <div className="eyebrow">{longDate(today)}</div>
          <h1>Wellness</h1>
          <p className="lede">Somewhere to go on a break. Move a little, breathe, notice what’s good.</p>
        </div>
      </div>

      <section className="stillness off" aria-label="Right now">
        <div className="eyebrow">{br ? (br.on ? `${br.name} is on` : `${br.name} at ${hm(br.start)}`) : 'Right now'}</div>
        <p className="still-msg">
          {br?.on
            ? `It’s your ${br.name.toLowerCase()} break. Step away from the screen.`
            : br
              ? `${br.name} is coming up. A stretch first?`
              : 'Nothing is due. Take a break anyway if you feel like one.'}
        </p>
        <div className="alts">
          <button className="btn" onClick={() => openStillness('desk')}>Three-minute desk reset</button>
          <button className="btn quiet" onClick={() => openStillness('box')}>Breathe</button>
          <button className="btn quiet" onClick={() => openStillness('good')}>Gratitude</button>
        </div>
        <div className="still-week" aria-label="Pauses this week">
          {week.days.map((on, i) => <span key={i} className={`dot-day ${on ? 'on' : ''} ${i === todayIdx ? 'today' : ''}`}>{DAYS[i]}</span>)}
          <span className="faint small">{week.sits ? `${week.sits} ${week.sits === 1 ? 'pause' : 'pauses'} this week` : 'No pauses yet this week.'}</span>
        </div>
      </section>

      <div className="section">
        <div className="row-head"><h2>At your desk</h2></div>
        <div className="routines">
          {ROUTINES.map((r) => (
            <button key={r.id} className="routine" onClick={() => openStillness(r.id === 'quick' ? 'stretch' : 'desk')}>
              <b>{r.name}</b>
              <span className="faint small">{r.blurb} {fmtDuration(routineSeconds(r))}.</span>
            </button>
          ))}
        </div>
        <div className="hairs">
          {DESK.map((m) => (
            <div key={m.id}>
              <button className={`fold ${open === m.id ? 'open' : ''}`} onClick={() => setOpen(open === m.id ? null : m.id)}>{m.name} · {m.seconds}s</button>
              {open === m.id && <p className="soft" style={{ margin: '4px 4px 14px' }}>{m.how}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="row-head"><h2>Breathe and settle</h2></div>
        <div className="routines">
          {breathing.map((s) => (
            <button key={s.id} className="routine" onClick={() => openStillness(s.id)}>
              <b>{s.name}</b>
              <span className="faint small">{s.blurb} {s.minutes} min.</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="row-head"><h2>Gratitude</h2></div>
        <p className="gratitude-q">{gratitudePrompt(today)}</p>
        {good.length > 0 && (
          <ul className="off-ideas">{good.map((g) => <li key={g}>{g}</li>)}</ul>
        )}
        <div className="alts">
          <button className="btn" onClick={() => openStillness('good')}>{good.length ? 'Add or change today’s' : 'Write three good things'}</button>
          <button className="btn quiet" onClick={() => openStillness('down')}>Set something down</button>
        </div>
        {past.length > 0 && (
          <div className="hairs" style={{ marginTop: 20 }}>
            {past.map((g) => (
              <div key={g.date} className="item" style={{ display: 'block' }}>
                <div className="faint small">{longDate(g.date)}</div>
                <div>{g.items.join(' · ')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="faint small" style={{ marginTop: 28 }}>Break reminders are set in Settings → Notifications.</div>
    </div>
  )
}
