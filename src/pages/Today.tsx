import { useState } from 'react'
import { BlockSheet } from '../components/BlockSheet'
import { Ring } from '../components/Icons'
import { useStopTimer } from '../components/TimerDock'
import { startTimer } from '../lib/actions'
import { fmtClock, fmtDuration, iso, longDate, nowMinutes, toMin } from '../lib/dates'
import { isLate } from '../lib/scheduler'
import { activeSeconds, counts, secondsThisWeek, secondsToday } from '../lib/stats'
import { useNow, useStore } from '../lib/store'
import type { PageId } from '../App'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'
}

export function Today({ go }: { go: (p: PageId) => void }) {
  const { data, update } = useStore()
  const stop = useStopTimer()
  const now = useNow(!!data.active)
  const [open, setOpen] = useState<string | null>(null)
  const today = iso()
  const mins = nowMinutes()

  const todays = data.blocks
    .filter((b) => b.date === today)
    .sort((a, b) => a.start.localeCompare(b.start))
  const next = todays.find((b) => !b.done && toMin(b.start) + b.minutes > mins)
  const late = data.blocks.filter((b) => isLate(b, data.tasks.find((t) => t.id === b.taskId)))
  const c = counts(data)
  const taskOf = (id: string) => data.tasks.find((t) => t.id === id)
  const colourOf = (taskId: string) => data.projects.find((p) => p.id === taskOf(taskId)?.projectId)?.color ?? 'var(--mist)'

  const active = data.active
  const activeTask = active ? taskOf(active.taskId) : undefined
  const activeBlock = active?.blockId ? data.blocks.find((b) => b.id === active.blockId) : undefined
  const secs = activeSeconds(data, now)
  const pct = activeBlock ? Math.min(100, ((activeBlock.loggedSeconds + secs) / (activeBlock.minutes * 60)) * 100) : 0
  const nextTask = next ? taskOf(next.taskId) : undefined

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">{longDate(today)}</div>
          <h1>{greeting()}</h1>
          <p className="lede">
            {todays.filter((b) => !b.done).length > 0
              ? `${todays.filter((b) => !b.done).length} blocks on your calendar today. One at a time.`
              : 'Nothing planned today. That is allowed.'}
          </p>
        </div>
      </div>

      <div className={`focus ${active ? 'live' : ''}`}>
        <Ring />
        <div className="eyebrow">{active ? 'In focus' : next ? 'Up next' : 'Space'}</div>
        {active ? (
          <>
            <div className="clock">{fmtClock(secs)}</div>
            <div className="soft" style={{ marginBottom: 14 }}>{activeTask?.title}</div>
            {activeBlock && (
              <div className="bar" style={{ marginBottom: 18, maxWidth: 360 }}><i style={{ width: `${pct}%` }} /></div>
            )}
            <button className="btn clay" onClick={stop}>Stop</button>
          </>
        ) : next && nextTask ? (
          <>
            <div className="clock" style={{ fontSize: 'clamp(34px,6vw,48px)' }}>{nextTask.title}</div>
            <div className="soft" style={{ marginBottom: 20 }}>
              {next.start} · {fmtDuration(next.minutes * 60)}
            </div>
            <button className="btn" onClick={() => update((d) => startTimer(d, next.taskId, next.id))}>Begin</button>
          </>
        ) : (
          <>
            <div className="clock" style={{ fontSize: 'clamp(30px,5vw,40px)' }}>Clear.</div>
            <div className="soft" style={{ marginBottom: 20 }}>Got something on your mind? Put it down and it will find a place.</div>
            <button className="btn" onClick={() => go('dump')}>Open the dump</button>
          </>
        )}
      </div>

      <div className="section">
        <div className="stats">
          <div className="stat"><div className="v">{fmtDuration(secondsToday(data, now))}</div><div className="l">Today</div></div>
          <div className="stat"><div className="v">{fmtDuration(secondsThisWeek(data, now))}</div><div className="l">This week</div></div>
          <div className="stat"><div className="v">{c.tasksOpen}</div><div className="l">Open tasks</div><div className="s">{c.tasksDone} finished</div></div>
          <div className="stat"><div className="v">{c.subtasksOpen}</div><div className="l">Open subtasks</div><div className="s">{c.subtasksDone} of {c.subtasksTotal} done</div></div>
        </div>
      </div>

      <div className="section">
        <div className="row-head"><h2>Your day</h2></div>
        {todays.length === 0 ? (
          <div className="empty"><b>An open day</b>Rest, or pull something forward from the week.</div>
        ) : (
          <div className="hairs">
            {todays.map((b) => {
              const t = taskOf(b.taskId)
              return (
                <button key={b.id} className={`item ${b.done ? 'done' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(b.id)}>
                  <span className="time">{b.start}</span>
                  <span className="dot" style={{ background: colourOf(b.taskId) }} />
                  <span className="grow"><span className="title">{t?.title}</span></span>
                  <span className="faint small">{b.partial ? `${b.minutes}m done` : `${b.minutes}m`}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {late.length > 0 && (
        <div className="section">
          <div className="notice">
            {late.length === 1 ? 'One block' : `${late.length} blocks`} won't fit before {late.length === 1 ? 'its' : 'their'} deadline.
            Consider giving the task a few more days, or letting something go.
          </div>
        </div>
      )}

      {open && <BlockSheet blockId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
