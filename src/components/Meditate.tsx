import { useEffect, useRef, useState } from 'react'
import { iso } from '../lib/dates'
import { useStore } from '../lib/store'
import { releaseWorry, setDown } from '../lib/sweep'
import { SCAN_LINES, SESSIONS, SIT_LINES, logStill, saveGood, suggest } from '../lib/stillness'
import type { Session } from '../lib/stillness'
import { ROUTINES } from '../lib/wellness'
import type { Routine } from '../lib/wellness'
import { Sheet } from './Sheet'
import { useDayMinutes } from './Sky'
import { toast } from './Toast'

const IN = 4
const OUT = 6

let openIt: (id?: Session['id']) => void = () => {}
/** Open the stillness sheet from anywhere, optionally straight into one practice. */
export const openStillness = (id?: Session['id']) => openIt(id)

/** Counts seconds up while mounted, and tells you how long it ran when it goes away. */
function useElapsed(onEnd: (seconds: number) => void) {
  const [secs, setSecs] = useState(0)
  const ref = useRef(0)
  const end = useRef(onEnd)
  end.current = onEnd
  useEffect(() => {
    const id = window.setInterval(() => {
      ref.current += 1
      setSecs(ref.current)
    }, 1000)
    return () => {
      window.clearInterval(id)
      end.current(ref.current)
    }
  }, [])
  return secs
}

/** One slow minute: in for 4, out for 6, six times. A longer out-breath settles the body. */
function Breathe({ rounds = 6, onDone, onClose }: { rounds?: number; onDone: (s: number) => void; onClose: () => void }) {
  const secs = useElapsed(onDone)
  const cycle = IN + OUT
  const round = Math.floor(secs / cycle)
  const finished = round >= rounds
  return (
    <div className="breathe">
      <div className={`lung ${finished ? 'rest' : ''}`} style={{ ['--cycle' as string]: `${cycle}s`, ['--peak' as string]: `${(IN / cycle) * 100}%` }}>
        <span>{finished ? 'Lovely.' : secs % cycle < IN ? 'Breathe in' : 'And out, slowly'}</span>
      </div>
      <div className="faint small">{finished ? 'That was a minute just for you.' : `${rounds - round} ${rounds - round === 1 ? 'breath' : 'breaths'} to go. Follow the circle.`}</div>
      <button className="btn quiet" onClick={onClose}>{finished ? 'Back to the day' : 'That’s enough for now'}</button>
    </div>
  )
}

/** A timed sit with a soft line that changes now and then. */
function Timed({ minutes, lines, every, onDone, onClose }: { minutes: number; lines: string[]; every: number; onDone: (s: number) => void; onClose: () => void }) {
  const secs = useElapsed(onDone)
  const total = minutes * 60
  const left = Math.max(0, total - secs)
  const finished = left === 0
  const line = finished ? 'Take your time coming back. There is no rush.' : lines[Math.min(lines.length - 1, Math.floor(secs / every))]
  return (
    <div className="breathe sit">
      <div className={`lung still ${finished ? 'rest' : ''}`}><span>{finished ? 'Lovely.' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span></div>
      <p className="sit-line" key={line}>{line}</p>
      <button className="btn quiet" onClick={onClose}>{finished ? 'Back to the day' : 'End here'}</button>
    </div>
  )
}

/** Box breathing: in, hold, out, hold, four counts each, four rounds. */
function Box({ onDone, onClose }: { onDone: (s: number) => void; onClose: () => void }) {
  const secs = useElapsed(onDone)
  const rounds = 4
  const total = rounds * 16
  const finished = secs >= total
  const phase = Math.floor((secs % 16) / 4)
  const label = finished ? 'Lovely.' : ['Breathe in', 'Hold', 'Breathe out', 'Hold'][phase]
  const big = !finished && (phase === 0 || phase === 1)
  return (
    <div className="breathe">
      <div className={`lung box ${finished ? 'rest' : ''}`} style={{ transform: `scale(${big ? 1.1 : 0.82})`, transition: 'transform 4s linear' }}>
        <span>{label}</span>
      </div>
      <div className="faint small">{finished ? 'Steady and even. Carry it with you.' : `Count to four each time. Round ${Math.min(rounds, Math.floor(secs / 16) + 1)} of ${rounds}.`}</div>
      <button className="btn quiet" onClick={onClose}>{finished ? 'Back to the day' : 'That’s enough for now'}</button>
    </div>
  )
}

/** A guided run of desk movements, one at a time, each with a countdown and a skip. */
function Desk({ routine, onDone, onClose }: { routine: Routine; onDone: (s: number) => void; onClose: () => void }) {
  const secs = useElapsed(onDone)
  const [skipped, setSkipped] = useState(0)
  const t = secs + skipped
  let at = 0
  let i = 0
  for (; i < routine.moves.length; i++) {
    if (t < at + routine.moves[i].seconds) break
    at += routine.moves[i].seconds
  }
  const finished = i >= routine.moves.length
  const move = routine.moves[Math.min(i, routine.moves.length - 1)]
  const left = finished ? 0 : at + move.seconds - t
  return (
    <div className="breathe sit">
      {finished ? (
        <>
          <div className="lung still rest"><span>Lovely.</span></div>
          <p className="sit-line">All done. Drink some water, and go back when you’re ready.</p>
        </>
      ) : (
        <>
          <div className="faint small">{i + 1} of {routine.moves.length}</div>
          <div className="lung still"><span>{left}s</span></div>
          <h3 className="desk-name">{move.name}</h3>
          <p className="sit-line" key={move.id}>{move.how}</p>
          <button className="btn ghost small" onClick={() => setSkipped(skipped + left)}>Skip this one</button>
        </>
      )}
      <button className="btn quiet" onClick={onClose}>{finished ? 'Back to the day' : 'End here'}</button>
    </div>
  )
}

function Good({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const today = iso()
  const [items, setItems] = useState<string[]>(() => [...(data.days[today]?.good ?? []), '', '', ''].slice(0, 3))
  const save = () => {
    update((d) => saveGood(d, today, items))
    toast('Kept. Tomorrow you can look back at these.')
    onClose()
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      <p className="soft" style={{ margin: 0 }}>Small counts: a warm drink, a kind message, the light on a wall.</p>
      {items.map((v, i) => (
        <input key={i} className="field" value={v} placeholder={['One thing…', 'Another…', 'And one more…'][i]} aria-label={`Good thing ${i + 1}`} autoFocus={i === 0}
          onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      <div className="row"><button className="btn">Keep these</button></div>
    </form>
  )
}

function Down({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const [text, setText] = useState('')
  const worries = data.ideas.filter((i) => i.kind === 'worry')
  const add = () => {
    if (!text.trim()) return
    update((d) => setDown(d, text.trim()))
    setText('')
  }
  return (
    <div className="stack">
      <p className="soft" style={{ margin: 0 }}>Write it here and leave it. It won’t become a task and it won’t be on your calendar. You don’t have to fix it today.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input className="field grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="What’s weighing on you?" aria-label="What is weighing on you" autoFocus />
        <button className="btn">Set down</button>
      </form>
      {worries.length > 0 && (
        <div className="hairs">
          {worries.map((w) => (
            <div key={w.id} className="idea">
              <div className="grow"><div className="t">{w.text}</div></div>
              <button className="btn quiet small" onClick={() => update((d) => releaseWorry(d, w.id))}>Let it go</button>
            </div>
          ))}
        </div>
      )}
      <button className="btn ghost small" onClick={onClose}>Done</button>
    </div>
  )
}

/**
 * Stillness: a menu of short practices (breathing, a body scan, sitting,
 * three good things, setting a worry down). Time spent is logged for the week.
 */
export function Meditate({ start, onClose }: { start?: Session['id']; onClose: () => void }) {
  const { data, update } = useStore()
  const [mode, setMode] = useState<Session['id'] | null>(start ?? null)
  const today = iso()
  const [sitMin, setSitMin] = useState<number | null>(null)
  const log = (secs: number) => {
    if (secs >= 20) update((d) => logStill(d, today, secs / 60))
  }
  const hour = Math.floor(useDayMinutes() / 60)
  const pick = suggest(hour, data.days[today]?.mood)
  const session = SESSIONS.find((s) => s.id === mode)
  return (
    <Sheet title={session ? session.name : 'Stillness'} onClose={onClose}>
      {!session && (
        <div className="stack">
          <p className="soft" style={{ margin: 0 }}>Nothing to get right. Pick whatever fits the moment.</p>
          <div className="hairs">
            {SESSIONS.map((s) => (
              <button key={s.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => setMode(s.id)}>
                <span className="grow">
                  <span className="title">{s.name}{s.id === pick && <span className="chip tiny">for now</span>}</span>
                  <span className="faint small" style={{ display: 'block' }}>{s.blurb}</span>
                </span>
                <span className="faint small">{s.minutes ? `${s.minutes} min` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === 'breathe' && <Breathe onDone={log} onClose={onClose} />}
      {mode === 'box' && <Box onDone={log} onClose={onClose} />}
      {mode === 'stretch' && <Desk routine={ROUTINES[0]} onDone={log} onClose={onClose} />}
      {mode === 'desk' && <Desk routine={ROUTINES[1]} onDone={log} onClose={onClose} />}
      {mode === 'scan' && <Timed minutes={5} lines={SCAN_LINES} every={25} onDone={log} onClose={onClose} />}
      {mode === 'sit' && sitMin === null && (
        <div className="stack">
          <p className="soft" style={{ margin: 0 }}>How long do you have? Any length is fine.</p>
          <div className="alts">
            {[3, 5, 10, 20].map((m) => <button key={m} className="btn quiet" onClick={() => setSitMin(m)}>{m} min</button>)}
          </div>
        </div>
      )}
      {mode === 'sit' && sitMin !== null && <Timed minutes={sitMin} lines={SIT_LINES} every={45} onDone={log} onClose={onClose} />}
      {mode === 'good' && <Good onClose={onClose} />}
      {mode === 'down' && <Down onClose={onClose} />}
    </Sheet>
  )
}

/** Mounts once; lets anything call `openStillness()`. */
export function StillnessHost() {
  const [open, setOpen] = useState<{ id?: Session['id'] } | null>(null)
  useEffect(() => {
    openIt = (id) => setOpen({ id })
    return () => {
      openIt = () => {}
    }
  }, [])
  return open ? <Meditate start={open.id} onClose={() => setOpen(null)} /> : null
}
