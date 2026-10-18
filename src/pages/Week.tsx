import { useState } from 'react'
import { BlockSheet } from '../components/BlockSheet'
import { EventSheet } from '../components/EventSheet'
import { Seg, timeLabel } from '../components/Fields'
import { addDays, dayName, fmtDuration, fromMin, iso, longDate, monday, nowMinutes, shortDay, smallDate, toMin, weekday } from '../lib/dates'
import { eventsOn, isLate, weekLoad } from '../lib/scheduler'
import { useStore } from '../lib/store'
import type { AppData, CalEvent, Look } from '../types'

const KIND_LABEL = { shift: 'Shift', appointment: 'Appointment', personal: 'Personal' } as const

function visibleDays(data: AppData, weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) =>
      data.settings.workDays.includes(weekday(d)) ||
      eventsOn(data.events, d).length > 0 ||
      data.blocks.some((b) => b.date === d),
  )
}

/** The hours the calendar needs to show, so nothing planned is cut off. */
function hourRange(data: AppData, days: string[]) {
  const s = data.settings
  let lo = toMin(s.dayStart)
  let hi = toMin(s.dayEnd)
  for (const b of s.breaks) {
    if (b.minutes > 0) {
      lo = Math.min(lo, toMin(b.start))
      hi = Math.max(hi, toMin(b.start) + b.minutes)
    }
  }
  for (const d of days) {
    for (const o of eventsOn(data.events, d)) {
      lo = Math.min(lo, o.from)
      hi = Math.max(hi, o.to)
    }
    for (const b of data.blocks) {
      if (b.date === d && b.start) {
        lo = Math.min(lo, toMin(b.start))
        hi = Math.max(hi, toMin(b.start) + b.minutes)
      }
    }
  }
  return { from: Math.floor(lo / 60), to: Math.ceil(hi / 60) }
}

interface ColumnProps {
  data: AppData
  date: string
  range: { from: number; to: number }
  hh: number
  index: number
  onBlock: (id: string) => void
  onEvent: (e: CalEvent) => void
}

function DayColumn({ data, date, range, hh, index, onBlock, onEvent }: ColumnProps) {
  const today = iso()
  const y = (m: number) => ((m - range.from * 60) / 60) * hh
  const hours = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
  const now = nowMinutes()
  return (
    <div className={`day ${date === today ? 'today' : ''}`} style={{ height: (range.to - range.from) * hh, ['--i' as string]: index }}>
      {hours.map((h) => <div key={h} className="line" style={{ top: (h - range.from) * hh }} />)}
      {data.settings.breaks.filter((b) => b.minutes > 0).map((b) => (
        <div key={b.id} className="lunch" style={{ top: y(toMin(b.start)), height: (b.minutes / 60) * hh }}>
          <span>{b.name}</span>
        </div>
      ))}
      {date === today && now >= range.from * 60 && now <= range.to * 60 && <div className="nowline" style={{ top: y(now) }} />}

      {eventsOn(data.events, date).map(({ event, from, to }, i) => {
        const h = Math.max(22, ((to - from) / 60) * hh - 3)
        return (
          <button key={event.id + i} className={`blk evt ${event.kind}`} style={{ top: y(from) + 1, height: h, ['--i' as string]: index }} onClick={() => onEvent(event)} aria-label={`${event.title}, ${event.start} to ${event.end}`}>
            <b>{event.title}</b>
            {h > 40 && <span>{event.start}–{event.end}</span>}
          </button>
        )
      })}

      {data.blocks.filter((b) => b.date === date).map((b, bi) => {
        const task = data.tasks.find((t) => t.id === b.taskId)
        const project = data.projects.find((p) => p.id === task?.projectId)
        const h = Math.max(22, (b.minutes / 60) * hh - 3)
        const cls = ['blk', b.done ? 'done' : '', isLate(b, task) ? 'late' : '', data.active?.blockId === b.id ? 'running' : ''].join(' ')
        return (
          <button key={b.id} className={cls} style={{ top: y(toMin(b.start)) + 1, height: h, ['--c' as string]: project?.color ?? 'var(--mist)', ['--i' as string]: index + bi }} onClick={() => onBlock(b.id)} aria-label={`${task?.title} at ${b.start}`}>
            <b>{task?.title}</b>
            {h > 40 && <span>{b.start} · {b.minutes}m</span>}
          </button>
        )
      })}
    </div>
  )
}

function Timeline({ data, days, hh, onBlock, onEvent }: { data: AppData; days: string[]; hh: number; onBlock: (id: string) => void; onEvent: (e: CalEvent) => void }) {
  const range = hourRange(data, days)
  const hours = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
  const today = iso()
  return (
    <div className={`week ${days.length === 1 ? 'single' : ''}`} style={{ ['--cols' as string]: days.length }}>
      <div />
      {days.map((d) => (
        <div key={d} className={`colhead ${d === today ? 'today' : ''}`}>
          <div className="d">{shortDay(d)}</div>
          <div className="n">{new Date(d + 'T12:00').getDate()}</div>
        </div>
      ))}
      <div className="axis" style={{ height: (range.to - range.from) * hh }}>
        {hours.map((h) => <span key={h} style={{ top: (h - range.from) * hh }}>{fromMin(h * 60)}</span>)}
      </div>
      {days.map((d, i) => <DayColumn key={d} data={data} date={d} range={range} hh={hh} index={i} onBlock={onBlock} onEvent={onEvent} />)}
    </div>
  )
}

function Agenda({ data, days, onBlock, onEvent }: { data: AppData; days: string[]; onBlock: (id: string) => void; onEvent: (e: CalEvent) => void }) {
  const today = iso()
  return (
    <div className="stack" style={{ gap: 30 }}>
      {days.map((d, di) => {
        const items = [
          ...data.blocks.filter((b) => b.date === d).map((b) => ({ kind: 'block' as const, from: toMin(b.start), to: toMin(b.start) + b.minutes, id: b.id })),
          ...eventsOn(data.events, d).map(({ event, from, to }) => ({ kind: 'event' as const, from, to, event })),
          ...data.settings.breaks.filter((b) => b.minutes > 0).map((b) => ({ kind: 'break' as const, from: toMin(b.start), to: toMin(b.start) + b.minutes, name: b.name })),
        ].sort((a, b) => a.from - b.from)
        const busy = items.filter((i) => i.kind !== 'break').length
        return (
          <section key={d} className="agenda-day" style={{ ['--i' as string]: di }}>
            <header>
              <h2 className={d === today ? 'pos' : ''}>{d === today ? 'Today' : dayName(d)}</h2>
              <span className="faint small">{smallDate(d)}</span>
            </header>
            {busy === 0 ? (
              <div className="faint small" style={{ padding: '10px 4px 4px' }}>Nothing planned. Room to breathe.</div>
            ) : (
              <div className="hairs">
                {items.map((it, i) => {
                  if (it.kind === 'break') {
                    return (
                      <div key={i} className="item agenda-break">
                        <span className="time">{timeLabel(it.from)}</span>
                        <span className="faint small">{it.name}</span>
                      </div>
                    )
                  }
                  if (it.kind === 'event') {
                    return (
                      <button key={i} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => onEvent(it.event)}>
                        <span className="time">{timeLabel(it.from)}</span>
                        <span className={`dot hollow ${it.event.kind}`} />
                        <span className="grow"><span className="title">{it.event.title}</span></span>
                        <span className="chip">{KIND_LABEL[it.event.kind]}</span>
                        <span className="faint small">until {it.event.end}</span>
                      </button>
                    )
                  }
                  const b = data.blocks.find((x) => x.id === it.id)!
                  const task = data.tasks.find((t) => t.id === b.taskId)
                  const project = data.projects.find((p) => p.id === task?.projectId)
                  return (
                    <button key={i} className={`item ${b.done ? 'done' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => onBlock(b.id)}>
                      <span className="time">{b.start}</span>
                      <span className="dot" style={{ background: project?.color ?? 'var(--mist)' }} />
                      <span className="grow"><span className="title">{task?.title}</span>{project && <span className="faint small"> · {project.name}</span>}</span>
                      <span className="faint small">{b.minutes}m</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function Week() {
  const { data, update } = useStore()
  const view = data.settings.look.week
  const [offset, setOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [eventSheet, setEventSheet] = useState<{ event?: CalEvent; date?: string } | null>(null)

  const today = iso()
  const weekStart = addDays(monday(today), offset * 7)
  const oneDay = addDays(today, dayOffset)
  const days = view === 'day' ? [oneDay] : visibleDays(data, weekStart)

  const setView = (v: Look['week']) =>
    update((d) => ({ ...d, settings: { ...d.settings, look: { ...d.settings.look, week: v } } }))

  const step = (n: number) => (view === 'day' ? setDayOffset(dayOffset + n) : setOffset(offset + n))
  const reset = () => { setOffset(0); setDayOffset(0) }

  const planned = data.blocks.filter((b) => b.date && days.includes(b.date) && !b.done).length
  const waiting = data.blocks.filter((b) => !b.date && !b.done).length
  const label = view === 'day' ? longDate(oneDay) : days.length ? `${smallDate(days[0])} – ${smallDate(days[days.length - 1])}` : ''
  const cap = data.settings.maxWeekHours * 60
  const load = weekLoad(view === 'day' ? oneDay : weekStart, data.blocks, data.events)
  const lateTasks = [...new Set(
    data.blocks
      .filter((b) => b.date && days.includes(b.date) && isLate(b, data.tasks.find((t) => t.id === b.taskId)))
      .map((b) => data.tasks.find((t) => t.id === b.taskId)!.title),
  )]
  const eyebrow = view === 'day' ? (dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : dayOffset === -1 ? 'Yesterday' : 'Day') : offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : 'Week'

  return (
    <div className="page wide">
      <div className="head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{label}</h1>
          <p className="lede">{planned} {planned === 1 ? 'block' : 'blocks'} planned.{waiting > 0 && ` ${waiting} waiting for a free slot.`}</p>
          {cap > 0 && (
            <div className="load">
              <div className="bar"><i className={load > cap ? 'over' : ''} style={{ width: `${Math.min(100, (load / cap) * 100)}%` }} /></div>
              <div className="faint small">{fmtDuration(load * 60)} of your {data.settings.maxWeekHours}h week booked{load >= cap ? '. Full; new work waits for next week.' : '.'}</div>
            </div>
          )}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Seg label="Calendar layout" value={view} options={[['grid', 'Grid'], ['agenda', 'List'], ['day', 'Day']]} onChange={setView} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost small" onClick={() => step(-1)} aria-label="Earlier">←</button>
            <button className="btn quiet small" onClick={reset}>Today</button>
            <button className="btn ghost small" onClick={() => step(1)} aria-label="Later">→</button>
          </div>
          <button className="btn small" onClick={() => setEventSheet({ date: view === 'day' ? oneDay : today })}>Add event</button>
        </div>
      </div>

      {lateTasks.length > 0 && (
        <div className="notice" style={{ marginBottom: 24 }}>
          {lateTasks.length === 1 ? <><b>{lateTasks[0]}</b> won't make its deadline.</> : <><b>{lateTasks.slice(0, -1).join(', ')}</b> and <b>{lateTasks[lateTasks.length - 1]}</b> won't make their deadlines.</>}{' '}
          Too much is landing at once. Give one of them more days, or let something go. Both are fine.
        </div>
      )}

      {days.length === 0 ? (
        <div className="empty"><b>No work days chosen</b>Pick them in Settings, or add an event.</div>
      ) : view === 'agenda' ? (
        <Agenda data={data} days={days} onBlock={setOpenBlock} onEvent={(event) => setEventSheet({ event })} />
      ) : (
        <Timeline data={data} days={days} hh={view === 'day' ? 80 : 64} onBlock={setOpenBlock} onEvent={(event) => setEventSheet({ event })} />
      )}

      {openBlock && <BlockSheet blockId={openBlock} onClose={() => setOpenBlock(null)} />}
      {eventSheet && <EventSheet event={eventSheet.event} date={eventSheet.date} onClose={() => setEventSheet(null)} />}
    </div>
  )
}
