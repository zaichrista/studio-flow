import { useState } from 'react'
import { BlockSheet } from '../components/BlockSheet'
import { addDays, fromMin, iso, monday, nowMinutes, smallDate, shortDay, toMin } from '../lib/dates'
import { isLate } from '../lib/scheduler'
import { useStore } from '../lib/store'

const H = 64 // pixels per hour

export function Week() {
  const { data } = useStore()
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const s = data.settings
  const today = iso()
  const start = addDays(monday(today), offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) =>
    s.workDays.includes(new Date(d + 'T12:00').getDay()),
  )

  const placed = data.blocks.filter((b) => b.date && days.includes(b.date))
  const from = Math.min(toMin(s.dayStart), ...placed.map((b) => toMin(b.start))) / 60 | 0
  const to = Math.ceil(Math.max(toMin(s.dayEnd), ...placed.map((b) => toMin(b.start) + b.minutes)) / 60)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const height = (to - from) * H
  const y = (min: number) => ((min - from * 60) / 60) * H

  const waiting = data.blocks.filter((b) => !b.date && !b.done).length
  const label = days.length ? `${smallDate(days[0])} – ${smallDate(days[days.length - 1])}` : ''

  return (
    <div className="page wide">
      <div className="head">
        <div>
          <div className="eyebrow">{offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : 'Week'}</div>
          <h1>{label}</h1>
          <p className="lede">{placed.filter((b) => !b.done).length} blocks planned.{waiting > 0 && ` ${waiting} waiting for a free slot.`}</p>
        </div>
        <div className="row">
          <button className="btn ghost small" onClick={() => setOffset(offset - 1)}>←</button>
          <button className="btn quiet small" onClick={() => setOffset(0)}>Today</button>
          <button className="btn ghost small" onClick={() => setOffset(offset + 1)}>→</button>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="empty"><b>No work days chosen</b>Pick them in Settings.</div>
      ) : (
        <div className="week" style={{ ['--cols' as string]: days.length }}>
          <div />
          {days.map((d) => (
            <div key={d} className={`colhead ${d === today ? 'today' : ''}`}>
              <div className="d">{shortDay(d)}</div>
              <div className="n">{new Date(d + 'T12:00').getDate()}</div>
            </div>
          ))}

          <div className="axis" style={{ height }}>
            {hours.map((h) => <span key={h} style={{ top: (h - from) * H }}>{fromMin(h * 60)}</span>)}
          </div>
          {days.map((d, di) => (
            <div key={d} className={`day ${d === today ? 'today' : ''}`} style={{ height, ['--i' as string]: di }}>
              {hours.map((h) => <div key={h} className="line" style={{ top: (h - from) * H }} />)}
              {s.lunchMinutes > 0 && (
                <div className="lunch" style={{ top: y(toMin(s.lunchStart)), height: (s.lunchMinutes / 60) * H }} />
              )}
              {d === today && nowMinutes() >= from * 60 && nowMinutes() <= to * 60 && (
                <div className="nowline" style={{ top: y(nowMinutes()) }} />
              )}
              {data.blocks.filter((b) => b.date === d).map((b, bi) => {
                const task = data.tasks.find((t) => t.id === b.taskId)
                const project = data.projects.find((p) => p.id === task?.projectId)
                const h = Math.max(22, (b.minutes / 60) * H - 3)
                const cls = ['blk', b.done ? 'done' : '', isLate(b, task) ? 'late' : '', data.active?.blockId === b.id ? 'running' : ''].join(' ')
                return (
                  <button
                    key={b.id}
                    className={cls}
                    style={{ top: y(toMin(b.start)) + 1, height: h, ['--c' as string]: project?.color ?? 'var(--mist)', ['--i' as string]: di + bi }}
                    onClick={() => setOpen(b.id)}
                    aria-label={`${task?.title} at ${b.start}`}
                  >
                    <b>{task?.title}</b>
                    {h > 40 && <span>{b.start} · {b.minutes}m</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {open && <BlockSheet blockId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
