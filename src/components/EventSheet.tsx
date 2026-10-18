import { useState } from 'react'
import { deleteEvent, saveEvent } from '../lib/actions'
import { iso, weekday } from '../lib/dates'
import { useStore } from '../lib/store'
import type { CalEvent, EventKind } from '../types'
import { Pick, Seg, timeOptions, toMinutes, timeLabel } from './Fields'
import { Sheet } from './Sheet'
import { toast } from './Toast'

const KINDS: [EventKind, string][] = [
  ['shift', 'Work shift'],
  ['appointment', 'Appointment'],
  ['personal', 'Personal'],
]

const DAYS = [
  [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S'],
] as const

export function EventSheet({ event, date, onClose }: { event?: CalEvent; date?: string; onClose: () => void }) {
  const { update } = useStore()
  const start0 = event?.date ?? date ?? iso()
  const [title, setTitle] = useState(event?.title ?? '')
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'shift')
  const [day, setDay] = useState(start0)
  const [start, setStart] = useState(event?.start ?? '10:00')
  const [end, setEnd] = useState(event?.end ?? '16:00')
  const [repeat, setRepeat] = useState((event?.repeatDays.length ?? 0) > 0)
  const [repeatDays, setRepeatDays] = useState<number[]>(event?.repeatDays.length ? event.repeatDays : [weekday(start0)])
  const [until, setUntil] = useState(event?.until ?? '')
  // Until the weekday chips are touched, the repeat follows whichever date is chosen.
  const [daysTouched, setDaysTouched] = useState(!!event?.repeatDays.length)

  const startMin = toMinutes(start)
  // The end must always be after the start; keep the choices honest.
  const endOptions = timeOptions(startMin + 15, 24 * 60 - 15, 15, end > start ? end : undefined)
  const changeStart = (v: string) => {
    setStart(v)
    if (toMinutes(end) <= toMinutes(v)) setEnd(timeLabel(Math.min(toMinutes(v) + 60, 24 * 60 - 15)))
  }

  const toggleDay = (n: number) => {
    setDaysTouched(true)
    setRepeatDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))
  }

  const changeDay = (v: string) => {
    setDay(v)
    if (!daysTouched) setRepeatDays([weekday(v)])
  }

  const valid = title.trim() && toMinutes(end) > toMinutes(start) && (!repeat || repeatDays.length > 0)

  const save = () => {
    if (!valid) return
    update((d) =>
      saveEvent(d, {
        id: event?.id,
        title: title.trim(),
        kind,
        date: day,
        start,
        end,
        repeatDays: repeat ? repeatDays : [],
        until: repeat ? until : '',
      }),
    )
    toast('Added. Your work has made room around it.')
    onClose()
  }

  return (
    <Sheet title={event ? 'Edit event' : 'Add to your calendar'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Seg label="Type" value={kind} options={KINDS} onChange={setKind} />
        <label className="lab">
          What is it?
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'shift' ? 'Café shift' : kind === 'appointment' ? 'Dentist' : 'Dinner with Maya'} autoFocus />
        </label>
        <div className="lab-row" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
          <label className="lab">{repeat ? 'Starting' : 'Date'}<input className="field" type="date" value={day} onChange={(e) => e.target.value && changeDay(e.target.value)} /></label>
          <Pick name="From" value={start} onChange={changeStart}>
            {timeOptions(0, 23 * 60 + 45, 15, start).map((t) => <option key={t}>{t}</option>)}
          </Pick>
          <Pick name="Until" value={end} onChange={setEnd}>
            {endOptions.map((t) => <option key={t}>{t}</option>)}
          </Pick>
        </div>

        <label className="row small soft" style={{ gap: 12 }}>
          <input className="check" type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Repeats every week
        </label>
        {repeat && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="dayrow">
              {DAYS.map(([n, l], i) => (
                <button key={i} type="button" className={`daybtn ${repeatDays.includes(n) ? 'on' : ''}`} onClick={() => toggleDay(n)} aria-pressed={repeatDays.includes(n)}>{l}</button>
              ))}
            </div>
            <label className="lab">Stops after (optional)<input className="field" type="date" value={until} min={day} onChange={(e) => setUntil(e.target.value)} /></label>
          </div>
        )}

        <div className="faint small">
          Your freelance blocks are planned around this. Anything already booked in that time moves to the next free slot.
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn" disabled={!valid}>Save</button>
          {event && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const msg = event.repeatDays.length ? `Delete “${event.title}” and all its repeats?` : `Delete “${event.title}”?`
                if (confirm(msg)) {
                  update((d) => deleteEvent(d, event.id))
                  onClose()
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
