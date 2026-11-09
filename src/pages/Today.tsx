import { useEffect, useState } from 'react'
import { BlockSheet, useSnooze } from '../components/BlockSheet'
import { EventSheet } from '../components/EventSheet'
import { Care } from '../components/Care'
import { OnTheClock } from '../components/OnTheClock'
import { DayArc } from '../components/DayArc'
import { openFocus } from '../components/FocusMode'
import { useStart } from '../components/RestGuard'
import { Hello } from '../components/Hello'
import { NightNote } from '../components/NightNote'
import { Stillness } from '../components/Stillness'
import { useDayMinutes } from '../components/Sky'
import { openCapture } from '../components/QuickCapture'
import { isLateNight } from '../lib/sky'
import { isOffDay } from '../lib/stillness'
import { listenShutdown, ShutdownSheet } from '../components/Shutdown'
import { winsToday, worthKnowing } from '../lib/today'
import { Ring } from '../components/Icons'
import { useStopTimer } from '../components/TimerDock'
import { reopenDay } from '../lib/actions'
import { startHint } from '../lib/push'
import { fmtClock, fmtDuration, iso, nowMinutes, toMin } from '../lib/dates'
import { timeLabel } from '../components/Fields'
import { eventsOn, lastWindowEnd } from '../lib/scheduler'
import { activeSeconds } from '../lib/stats'
import { useNow, useStore } from '../lib/store'
import type { Block, CalEvent } from '../types'
import type { PageId } from '../App'

export function Today({ go }: { go: (p: PageId) => void }) {
  const [showAllWins, setShowAllWins] = useState(false)
  const { data, update } = useStore()
  const stop = useStopTimer()
  const snooze = useSnooze()
  const begin = useStart()
  const now = useNow(!!data.active)
  const [open, setOpen] = useState<string | null>(null)
  const [eventOpen, setEventOpen] = useState<CalEvent | null>(null)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (listenShutdown(() => setClosing(true))) setClosing(true)
    return () => void listenShutdown(null)
  }, [])
  const [showEarlier, setShowEarlier] = useState(false)
  const [showLater, setShowLater] = useState(false)
  const today = iso()
  const mins = nowMinutes()
  const dayMin = useDayMinutes()
  const late = isLateNight(dayMin)
  const s = data.settings
  const closed = data.closedOn === today
  const off = isOffDay(data, today)
  const quiet = off || closed || late
  const dayEnd = lastWindowEnd(today, s)
  const workDay = dayEnd !== null
  const windingDown = dayEnd !== null && !closed && mins >= dayEnd - 30

  const todays = data.blocks
    .filter((b) => b.date === today)
    .sort((a, b) => a.start.localeCompare(b.start))
  const todaysEvents = eventsOn(data.events, today)
  const rows = [
    ...todays.map((b) => ({ at: toMin(b.start), block: b, event: undefined as CalEvent | undefined, to: 0 })),
    ...todaysEvents.map((o) => ({ at: o.from, block: undefined, event: o.event, to: o.to })),
  ].sort((a, b) => a.at - b.at)
  const next = todays.find((b) => !b.done && toMin(b.start) + b.minutes > mins)
  const heads = worthKnowing(data, today)
  const wins = winsToday(data, today)
  const taskOf = (id: string) => data.tasks.find((t) => t.id === id)
  const colourOf = (taskId: string) => data.projects.find((p) => p.id === taskOf(taskId)?.projectId)?.color ?? 'var(--mist)'

  const active = data.active
  const activeTask = active ? taskOf(active.taskId) : undefined
  const activeBlock = active?.blockId ? data.blocks.find((b) => b.id === active.blockId) : undefined
  const secs = activeSeconds(data, now)
  const pct = activeBlock ? Math.min(100, ((activeBlock.loggedSeconds + secs) / (activeBlock.minutes * 60)) * 100) : 0
  const nextTask = next ? taskOf(next.taskId) : undefined
  const activeHint = activeTask?.resumeNote ? `Where you left off: ${activeTask.resumeNote}` : null
  const nextHint = nextTask ? startHint(nextTask) : null

  // Only the next few things are in view; the rest of the day folds away.
  const isPast = (r: (typeof rows)[number]) =>
    r.block ? r.block.done || toMin(r.block.start) + r.block.minutes <= mins : r.to <= mins
  const earlier = rows.filter(isPast)
  const upcoming = rows.filter((r) => !isPast(r))
  let shown = 0
  const cut = upcoming.findIndex((r) => r.block && ++shown > 3)
  const soon = cut === -1 ? upcoming : upcoming.slice(0, cut)
  const later = cut === -1 ? [] : upcoming.slice(cut)

  function renderRow(r: (typeof rows)[number]) {
    if (r.event) {
      const e = r.event
      return (
        <button key={e.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEventOpen(e)}>
          <span className="time">{timeLabel(r.at)}</span>
          <span className={`dot hollow ${e.kind}`} />
          <span className="grow"><span className="title">{e.title}</span></span>
          <span className="faint small">until {e.end}</span>
        </button>
      )
    }
    const b = r.block!
    const t = taskOf(b.taskId)
    return (
      <button key={b.id} className={`item ${b.done ? 'done' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(b.id)}>
        <span className="time">{b.start}</span>
        <span className="dot" style={{ background: colourOf(b.taskId) }} />
        <span className="grow"><span className="title">{t?.title}</span></span>
        <span className="faint small">{b.partial ? `${b.minutes}m done` : `${b.minutes}m`}</span>
      </button>
    )
  }

  /** A row, plus a soft pause line when the next block follows close behind. */
  function withGap(r: (typeof rows)[number], following?: (typeof rows)[number]) {
    const out = [renderRow(r)]
    const a: Block | undefined = r.block
    const b: Block | undefined = following?.block
    if (a && b) {
      const gap = toMin(b.start) - (toMin(a.start) + a.minutes)
      if (gap > 0 && gap <= s.bufferMinutes + 15) {
        out.push(
          <div key={`gap-${a.id}`} className="item gap">
            <span className="time">{timeLabel(toMin(a.start) + a.minutes)}</span>
            <span className="grow">{gap} min to stretch and let your mind wander</span>
          </div>,
        )
      }
    }
    return out
  }

  return (
    <div className={`page today ${data.settings.look.today === 'split' ? 'today-split' : ''}`}>
      <Hello minutes={dayMin} />
      <p className="lede today-lede">
        {closed
          ? 'Work is put away for today. The evening is yours.'
          : off && todays.length === 0
            ? 'Nothing planned. A day off is part of the plan.'
            : todays.filter((b) => !b.done).length > 0
              ? `${todays.filter((b) => !b.done).length} blocks on your calendar today. One at a time.${todaysEvents.length ? ` Plus ${todaysEvents.length} fixed ${todaysEvents.length === 1 ? 'event' : 'events'}.` : ''}`
              : 'Nothing planned today. That is allowed.'}
      </p>

      {late && <NightNote minutes={dayMin} />}
      {quiet && <Stillness closed={closed} />}

      {!closed && !late && (!off || todays.length > 0) && <OnTheClock />}

      <div className="today-cols">
      <div className="today-main">
      <div className={`focus ${active ? 'live' : ''}`}>
        <Ring left={active && activeBlock ? 1 - pct / 100 : undefined} />
        <div className="eyebrow">{active ? 'In focus' : closed ? 'Put away' : next ? 'Up next' : 'Space'}</div>
        {active ? (
          <>
            <div className="clock">{fmtClock(secs)}</div>
            <div className="soft" style={{ marginBottom: 14 }}>{activeTask?.title}</div>
            {active.trial ? (
              <div className="hint">
                {secs >= active.trial * 60
                  ? `That's ${active.trial} minutes. Keep going if it's flowing; stopping here counts too.`
                  : `Just ${active.trial} minutes. Then see how you feel.`}
              </div>
            ) : activeHint && <div className="hint">{activeHint}</div>}
            {activeBlock && (
              <div className="soft small" style={{ marginBottom: 18 }}>
                {activeBlock.minutes * 60 - activeBlock.loggedSeconds - secs > 0
                  ? `${fmtDuration(activeBlock.minutes * 60 - activeBlock.loggedSeconds - secs)} left in this block`
                  : `${fmtDuration(secs + activeBlock.loggedSeconds - activeBlock.minutes * 60)} over this block. Stop whenever you're ready.`}
              </div>
            )}
            <div className="alts">
              <button className="btn clay" onClick={stop}>Stop</button>
              <button className="btn quiet" onClick={openFocus}>Focus mode</button>
            </div>
          </>
        ) : closed ? (
          <>
            <div className="clock" style={{ fontSize: 'clamp(30px,5vw,40px)' }}>Done for today.</div>
            <div className="soft" style={{ marginBottom: 20 }}>Rest counts too. Everything will be where you left it.</div>
            <button className="btn ghost small" onClick={() => update((d) => reopenDay(d))}>Open the day back up</button>
          </>
        ) : next && nextTask ? (
          <>
            <div className="clock" style={{ fontSize: 'clamp(34px,6vw,48px)' }}>{nextTask.title}</div>
            <div className="soft" style={{ marginBottom: nextHint ? 14 : 20 }}>
              {next.start} · {fmtDuration(next.minutes * 60)}
            </div>
            {nextHint && <div className="hint">{nextHint}</div>}
            <div className="alts">
              <button className="btn" onClick={() => begin(next.taskId, next.id)}>Begin</button>
              <button className="btn quiet" onClick={() => begin(next.taskId, next.id, undefined, openFocus)}>Focus mode</button>
              <button className="btn quiet" onClick={() => begin(next.taskId, next.id, 10)}>Just 10 minutes</button>
              <button className="btn ghost small" onClick={() => snooze(next.id)}>Not now</button>
            </div>
          </>
        ) : (
          <>
            <div className="clock" style={{ fontSize: 'clamp(30px,5vw,40px)' }}>Clear.</div>
            <div className="soft" style={{ marginBottom: 20 }}>Got something on your mind? Put it down and it will find a place.</div>
            <button className="btn" onClick={openCapture}>Empty your head</button>
          </>
        )}
      </div>

      {windingDown && !active && (
        <div className="section">
          <div className="notice ok row" style={{ flexWrap: 'wrap' }}>
            <span className="grow">That's nearly the day. Two minutes to put work away, then it's yours.</span>
            <button className="btn small" onClick={() => setClosing(true)}>Put the day away</button>
          </div>
        </div>
      )}

      {heads.length > 0 && !closed && (
        <div className="section">
          <div className="heads">
            {heads.map((h) => <button key={h.id} onClick={() => go(h.page)}>{h.text}</button>)}
          </div>
        </div>
      )}

      {!quiet && (
        <div className="section">
          <Care />
        </div>
      )}

      </div>

      <div className="today-side">
      <DayArc closed={closed} />

      <div className="section">
        <div className="row-head">
          <h2>Your day</h2>
          {!closed && workDay && !windingDown && <button className="btn ghost small" onClick={() => setClosing(true)}>Put the day away</button>}
        </div>
        {rows.length === 0 ? (
          <div className="empty"><b>An open day</b>Rest, or pull something forward from the week.</div>
        ) : (
          <div className="hairs">
            {earlier.length > 0 && (
              <button className={`fold ${showEarlier ? 'open' : ''}`} onClick={() => setShowEarlier(!showEarlier)}>
                Earlier today · {earlier.length}
              </button>
            )}
            {showEarlier && earlier.map(renderRow)}
            {soon.length === 0 && earlier.length > 0 && <div className="faint small" style={{ padding: '14px 4px' }}>That's everything for today.</div>}
            {soon.flatMap((r, i) => withGap(r, soon[i + 1]))}
            {later.length > 0 && (
              <button className={`fold ${showLater ? 'open' : ''}`} onClick={() => setShowLater(!showLater)}>
                {showLater ? 'Later today' : `${later.length} more later today`}
              </button>
            )}
            {showLater && later.map(renderRow)}
          </div>
        )}
      </div>

      {wins.length > 0 && (
        <div className="section">
          <div className="row-head"><h2>Small wins</h2><span className="faint small">{wins.length}</span></div>
          <div className="wins">
            {(showAllWins ? wins : wins.slice(0, 4)).map((w) => <div key={w.id} className="win">{w.text}</div>)}
          </div>
          {wins.length > 4 && (
            <button className={`fold ${showAllWins ? 'open' : ''}`} onClick={() => setShowAllWins(!showAllWins)}>
              {showAllWins ? 'Fewer' : `${wins.length - 4} more`}
            </button>
          )}
        </div>
      )}

      </div>
      </div>

      {open && <BlockSheet blockId={open} onClose={() => setOpen(null)} />}
      {closing && <ShutdownSheet onClose={() => setClosing(false)} />}
      {eventOpen && <EventSheet event={eventOpen} onClose={() => setEventOpen(null)} />}
    </div>
  )
}
