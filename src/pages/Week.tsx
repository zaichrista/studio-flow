import { useEffect, useRef, useState } from 'react'
import { BlockSheet } from '../components/BlockSheet'
import { EventSheet } from '../components/EventSheet'
import { Seg, timeLabel } from '../components/Fields'
import { toast } from '../components/Toast'
import { moveBlock, moveEvent } from '../lib/actions'
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

/** A press-and-drag on the calendar, while it's happening. */
interface Drag {
  mode: 'move' | 'resize' | 'new'
  type?: 'block' | 'event'
  id?: string
  /** The day it was picked up from */
  origin: string
  date: string
  from: number
  to: number
  label: string
  /** Event kind, or a project colour for work blocks */
  kind?: string
  color?: string
}

type DragStart = Omit<Drag, 'origin'>

const STEP = 15
const down = (m: number) => Math.floor(m / STEP) * STEP
const near = (m: number) => Math.round(m / STEP) * STEP
const LATEST = 24 * 60 - STEP

interface ColumnProps {
  data: AppData
  date: string
  range: { from: number; to: number }
  hh: number
  index: number
  drag: Drag | null
  begin: (e: React.PointerEvent, d: DragStart, now?: boolean) => void
  onBlock: (id: string) => void
  onEvent: (e: CalEvent) => void
  onTap: (date: string, clientY: number, col: HTMLElement) => void
  quiet: () => boolean
}

function DayColumn({ data, date, range, hh, index, drag, begin, onBlock, onEvent, onTap, quiet }: ColumnProps) {
  const today = iso()
  const y = (m: number) => ((m - range.from * 60) / 60) * hh
  const hours = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
  const now = nowMinutes()
  const lifted = (id: string) => drag && drag.mode !== 'new' && drag.id === id && drag.origin === date ? 'lifting' : ''
  return (
    <div
      className={`day ${date === today ? 'today' : ''}`}
      data-date={date}
      style={{ height: (range.to - range.from) * hh, ['--i' as string]: index }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('.blk')) return
        const at = range.from * 60 + ((e.clientY - e.currentTarget.getBoundingClientRect().top) / hh) * 60
        const from = down(at)
        begin(e, { mode: 'new', date, from, to: from + STEP, label: 'New event' })
      }}
      onClick={(e) => {
        if (quiet() || (e.target as Element).closest('.blk')) return
        onTap(date, e.clientY, e.currentTarget)
      }}
    >
      {hours.map((h) => <div key={h} className="line" style={{ top: (h - range.from) * hh }} />)}
      {data.settings.breaks.filter((b) => b.minutes > 0).map((b) => (
        <div key={b.id} className="lunch" style={{ top: y(toMin(b.start)), height: (b.minutes / 60) * hh }}>
          <span>{b.name}</span>
        </div>
      ))}
      {date === today && now >= range.from * 60 && now <= range.to * 60 && <div className="nowline" style={{ top: y(now) }} />}

      {eventsOn(data.events, date).map(({ event, from, to }, i) => {
        const h = Math.max(22, ((to - from) / 60) * hh - 3)
        const pick: DragStart = { mode: 'move', type: 'event', id: event.id, date, from, to, label: event.title, kind: event.kind }
        return (
          <button
            key={event.id + i}
            className={`blk evt ${event.kind} ${lifted(event.id)}`}
            style={{ top: y(from) + 1, height: h, ['--i' as string]: index }}
            onPointerDown={(e) => begin(e, pick)}
            onClick={() => !quiet() && onEvent(event)}
            aria-label={`${event.title}, ${event.start} to ${event.end}`}
          >
            <b>{event.title}</b>
            {h > 40 && <span>{event.start}–{event.end}</span>}
            <span
              className="grip"
              aria-hidden="true"
              onPointerDown={(e) => { e.stopPropagation(); begin(e, { ...pick, mode: 'resize' }, true) }}
            />
          </button>
        )
      })}

      {data.blocks.filter((b) => b.date === date).map((b, bi) => {
        const task = data.tasks.find((t) => t.id === b.taskId)
        const project = data.projects.find((p) => p.id === task?.projectId)
        const h = Math.max(22, (b.minutes / 60) * hh - 3)
        const running = data.active?.blockId === b.id
        const cls = ['blk', b.done ? 'done' : '', isLate(b, task) ? 'late' : '', running ? 'running' : '', lifted(b.id)].join(' ')
        const from = toMin(b.start)
        const color = project?.color ?? 'var(--mist)'
        return (
          <button
            key={b.id}
            className={cls}
            style={{ top: y(from) + 1, height: h, ['--c' as string]: color, ['--i' as string]: index + bi }}
            onPointerDown={(e) => {
              if (!b.done && !running) begin(e, { mode: 'move', type: 'block', id: b.id, date, from, to: from + b.minutes, label: task?.title ?? 'Work', color })
            }}
            onClick={() => !quiet() && onBlock(b.id)}
            aria-label={`${task?.title} at ${b.start}`}
          >
            <b>{task?.title}</b>
            {h > 40 && <span>{b.start} · {b.minutes}m</span>}
          </button>
        )
      })}

      {drag && drag.date === date && (
        <div
          className={`blk ghost ${drag.type === 'block' ? '' : `evt ${drag.kind ?? 'shift'}`}`}
          style={{ top: y(drag.from) + 1, height: Math.max(22, ((drag.to - drag.from) / 60) * hh - 3), ...(drag.color ? { ['--c' as string]: drag.color } : {}) }}
          aria-hidden="true"
        >
          <b>{drag.label}</b>
          <span>{fromMin(drag.from)}–{fromMin(drag.to)}</span>
        </div>
      )}
    </div>
  )
}

interface TimelineProps {
  data: AppData
  days: string[]
  hh: number
  onBlock: (id: string) => void
  onEvent: (e: CalEvent) => void
  onCreate: (date: string, from: number, to: number) => void
  onDrop: (d: Drag) => void
}

function Timeline({ data, days, hh, onBlock, onEvent, onCreate, onDrop }: TimelineProps) {
  const range = hourRange(data, days)
  const hours = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
  const today = iso()
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragging = useRef(false)
  // The click that ends a drag shouldn't also open a sheet.
  const hushUntil = useRef(0)
  const quiet = () => Date.now() < hushUntil.current

  // Once a held finger has picked something up, the page mustn't scroll under it.
  useEffect(() => {
    const el = grid.current
    if (!el) return
    const hold = (e: TouchEvent) => { if (dragging.current) e.preventDefault() }
    el.addEventListener('touchmove', hold, { passive: false })
    return () => el.removeEventListener('touchmove', hold)
  }, [])

  /** Which day and minute sit under a point on screen. */
  const locate = (x: number, y: number) => {
    const cols = [...(grid.current?.querySelectorAll<HTMLElement>('.day[data-date]') ?? [])]
    const dist = (c: HTMLElement) => {
      const r = c.getBoundingClientRect()
      return x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    }
    const col = cols.reduce((a, b) => (dist(b) < dist(a) ? b : a))
    const top = col.getBoundingClientRect().top
    return { date: col.dataset.date!, min: range.from * 60 + ((y - top) / hh) * 60 }
  }

  /**
   * Press and hold (touch) or press and drag (mouse) to pick something up.
   * `now` skips the hold, for the little stretch handle.
   */
  const begin = (e: React.PointerEvent, start: DragStart, now = false) => {
    if (e.button !== 0 || !e.isPrimary) return
    const touch = e.pointerType !== 'mouse'
    const sx = e.clientX
    const sy = e.clientY
    const grabbed = locate(sx, sy).min
    const lo = range.from * 60
    const hi = Math.min(range.to * 60, 24 * 60)
    let cur: Drag = { ...start, origin: start.date }
    let active = false

    const activate = () => {
      active = true
      dragging.current = true
      navigator.vibrate?.(8)
      setDrag(cur)
    }
    const follow = (x: number, yy: number) => {
      const at = locate(x, yy)
      if (cur.mode === 'move') {
        const len = start.to - start.from
        const from = Math.max(lo, Math.min(hi - len, near(at.min - (grabbed - start.from))))
        cur = { ...cur, date: at.date, from, to: from + len }
      } else if (cur.mode === 'resize') {
        cur = { ...cur, to: Math.max(start.from + STEP, Math.min(hi, near(at.min))) }
      } else {
        const a = start.from
        const b = Math.max(lo, Math.min(hi, at.min))
        cur = b >= a ? { ...cur, from: a, to: Math.max(a + STEP, Math.ceil(b / STEP) * STEP) } : { ...cur, from: down(b), to: a + STEP }
      }
      setDrag(cur)
    }
    const timer = touch && !now ? window.setTimeout(activate, 380) : 0
    if (now) activate()

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      if (!active) {
        const far = Math.hypot(ev.clientX - sx, ev.clientY - sy)
        if (touch) { if (far > 10) stop() } // it's a scroll, let it be
        else if (far > 5) activate()
        if (!active) return
      }
      follow(ev.clientX, ev.clientY)
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const was = active
      stop()
      if (!was) return
      hushUntil.current = Date.now() + 400
      setDrag(null)
      onDrop(cur)
    }
    const cancel = () => { stop(); setDrag(null) }
    function stop() {
      clearTimeout(timer)
      active = false
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const tap = (date: string, clientY: number, col: HTMLElement) => {
    const from = Math.min(LATEST - 60, down(range.from * 60 + ((clientY - col.getBoundingClientRect().top) / hh) * 60))
    onCreate(date, from, from + 60)
  }

  return (
    <div
      ref={grid}
      className={`week ${days.length === 1 ? 'single' : ''} ${drag ? 'dragging' : ''}`}
      style={{ ['--cols' as string]: days.length }}
      onContextMenu={(e) => e.preventDefault()}
    >
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
      {days.map((d, i) => (
        <DayColumn key={d} data={data} date={d} range={range} hh={hh} index={i} drag={drag} begin={begin} onBlock={onBlock} onEvent={onEvent} onTap={tap} quiet={quiet} />
      ))}
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
  const { data, update, replaceAll } = useStore()
  const view = data.settings.look.week
  const [offset, setOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [eventSheet, setEventSheet] = useState<{ event?: CalEvent; date?: string; from?: string; to?: string } | null>(null)

  const today = iso()
  const weekStart = addDays(monday(today), offset * 7)
  const oneDay = addDays(today, dayOffset)
  const days = view === 'day' ? [oneDay] : visibleDays(data, weekStart)

  const setView = (v: Look['week']) =>
    update((d) => ({ ...d, settings: { ...d.settings, look: { ...d.settings.look, week: v } } }))

  const create = (date: string, from: number, to: number) =>
    setEventSheet({ date, from: fromMin(from), to: fromMin(Math.min(to, LATEST)) })

  /** Something was dropped somewhere new on the calendar. */
  const drop = (dr: Drag) => {
    if (dr.mode === 'new') return create(dr.date, dr.from, dr.to)
    const before = data
    const undo = { label: 'Undo', run: () => replaceAll(before) }
    const when = `${dr.date === today ? 'today' : dayName(dr.date)}, ${fromMin(dr.from)}`
    if (dr.type === 'block' && dr.id) {
      if (dr.date === dr.origin && fromMin(dr.from) === data.blocks.find((b) => b.id === dr.id)?.start) return
      const tried = moveBlock(data, dr.id, dr.date, dr.from)
      if ('reason' in tried) return toast(`${tried.reason} It's stayed where it was.`)
      update((d) => { const r = moveBlock(d, dr.id!, dr.date, dr.from); return 'data' in r ? r.data : d })
      toast(`Moved to ${when}.`, undo)
    } else if (dr.type === 'event' && dr.id) {
      const ev = data.events.find((e) => e.id === dr.id)
      if (!ev || (dr.date === dr.origin && fromMin(dr.from) === ev.start && fromMin(dr.to) === ev.end)) return
      update((d) => moveEvent(d, dr.id!, dr.origin, dr.date, dr.from, dr.to))
      const what = dr.mode === 'resize' ? `Now until ${fromMin(dr.to)}` : `Moved to ${when}`
      toast(`${what}${ev.repeatDays.length ? ', every week' : ''}. Work has made room.`, undo)
    }
  }

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
          {view !== 'agenda' && <p className="faint small" style={{ marginTop: 4 }}>Tap an empty spot to add a shift or plan. Press and hold anything to move it.</p>}
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
        <Timeline data={data} days={days} hh={view === 'day' ? 80 : 64} onBlock={setOpenBlock} onEvent={(event) => setEventSheet({ event })} onCreate={create} onDrop={drop} />
      )}

      {openBlock && <BlockSheet blockId={openBlock} onClose={() => setOpenBlock(null)} />}
      {eventSheet && <EventSheet event={eventSheet.event} date={eventSheet.date} from={eventSheet.from} to={eventSheet.to} onClose={() => setEventSheet(null)} />}
    </div>
  )
}
