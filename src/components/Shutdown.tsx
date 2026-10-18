import { useMemo, useState } from 'react'
import { closeDay, setDayNote, toggleTask } from '../lib/actions'
import { appendToDraft } from '../lib/draft'
import { dayName, addDays, fmtDuration, iso } from '../lib/dates'
import { secondsToday } from '../lib/stats'
import { useStore } from '../lib/store'
import { Sheet } from './Sheet'
import { toast } from './Toast'

let pending = false
let listener: (() => void) | null = null

/** Ask Today to open "put the day away" (from a notification tap), now or when it mounts. */
export function requestShutdown() {
  if (listener) listener()
  else pending = true
}

/** Today calls this to hear about requests; returns whether one is waiting. */
export function listenShutdown(fn: (() => void) | null): boolean {
  listener = fn
  const was = pending
  pending = false
  return was
}

/**
 * Two minutes to put work away: close what's finished, empty your head into
 * the dump, see how tomorrow starts, then the app goes quiet until morning.
 */
export function ShutdownSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const [left, setLeft] = useState('')
  const today = iso()
  const intention = data.days[today]?.intention
  const [good, setGood] = useState(data.days[today]?.goodThing ?? '')

  const touched = data.tasks.filter(
    (t) =>
      data.blocks.some((b) => b.taskId === t.id && b.date === today) ||
      data.entries.some((e) => e.taskId === t.id && iso(new Date(e.start)) === today),
  )
  // What tomorrow looks like once today's leftovers have moved on.
  const after = useMemo(() => closeDay(data), [data])
  const first = after.blocks
    .filter((b) => b.date > today && !b.done)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0]
  const firstTask = first && after.tasks.find((t) => t.id === first.taskId)
  const moving = data.blocks.filter((b) => b.date === today && !b.done && b.loggedSeconds === 0 && b.id !== data.active?.blockId).length
  const when = first ? (first.date === addDays(today, 1) ? 'Tomorrow' : dayName(first.date)) : ''
  const name = data.settings.name.trim()

  const done = () => {
    appendToDraft(left)
    update((d) => closeDay(setDayNote(d, today, { goodThing: good.trim() })))
    toast(name ? `Work's put away, ${name}. See you tomorrow.` : "Work's put away. See you tomorrow.")
    onClose()
  }

  return (
    <Sheet title="Put the day away" onClose={onClose}>
      <div className="closing">
        <div className="step">
          <div className="eyebrow"><i>1</i>What got done</div>
          {intention && <div className="soft small">This morning you wanted to: <b>{intention}</b></div>}
          {touched.length === 0 ? (
            <div className="faint small">No planned work today. That's fine.</div>
          ) : (
            <div className="hairs">
              {touched.map((t) => (
                <label key={t.id} className={`item ${t.done ? 'done' : ''}`} style={{ padding: '10px 4px' }}>
                  <input className="check sm" type="checkbox" checked={t.done} onChange={() => update((d) => toggleTask(d, t.id))} />
                  <span className="grow title" style={{ fontWeight: 400 }}>{t.title}</span>
                  {!t.done && <span className="faint small">finished it?</span>}
                </label>
              ))}
            </div>
          )}
          {secondsToday(data) > 0 && <div className="faint small">{fmtDuration(secondsToday(data))} of focused time today.</div>}
        </div>

        <div className="step">
          <div className="eyebrow"><i>2</i>Anything still in your head?</div>
          <textarea
            className="field"
            rows={3}
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            placeholder="Put it here and let it go. It waits in your dump for tomorrow."
            aria-label="Anything still in your head"
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="step">
          <div className="eyebrow"><i>3</i>One good thing about today</div>
          <input
            className="field"
            value={good}
            onChange={(e) => setGood(e.target.value)}
            placeholder="Big or tiny. A kind email, a line you liked."
            aria-label="One good thing about today"
          />
          <div className="faint small">It greets you tomorrow morning.</div>
        </div>

        <div className="step">
          <div className="eyebrow"><i>4</i>How tomorrow starts</div>
          <div className="soft small">
            {first && firstTask ? <>{when} at {first.start}: <b>{firstTask.title}</b>.</> : 'Nothing planned yet. A fresh page.'}
            {moving > 0 && ` ${moving} ${moving === 1 ? 'block' : 'blocks'} from today will move along with you.`}
          </div>
        </div>

        <div className="row">
          <button className="btn" onClick={done}>Done for today</button>
          <button className="btn ghost" onClick={onClose}>Not yet</button>
        </div>
      </div>
    </Sheet>
  )
}
