import { useEffect, useState } from 'react'
import { setMusts } from '../lib/actions'
import { idleOnTheClock, mustsToday, scoreboard, status } from '../lib/accountability'
import { fmtDuration, iso } from '../lib/dates'
import { useStore } from '../lib/store'
import { verdict } from '../lib/tone'
import { useSnooze } from './BlockSheet'
import { openCapture } from './QuickCapture'
import { useStart } from './RestGuard'

/** Re-render each half minute so lateness is always the truth. */
function useMinute() {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
}

/**
 * The part of Today that doesn't let you drift: whatever should be under way
 * and isn't, the day's scoreboard, and the three things you promised yourself.
 */
export function OnTheClock() {
  useMinute()
  const { data, update } = useStore()
  const begin = useStart()
  const snooze = useSnooze()
  const now = new Date()
  const today = iso(now)
  const tone = data.settings.tone
  const st = status(data, now)
  const idle = idleOnTheClock(data, now)
  const score = scoreboard(data, now)
  const musts = mustsToday(data, today)
  const candidates = [...new Set(data.blocks.filter((b) => b.date === today && !b.done).map((b) => b.taskId))]
    .map((id) => data.tasks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t && !t.done)
  const toggle = (id: string) => {
    const has = musts.ids.includes(id)
    update((d) => setMusts(d, today, has ? musts.ids.filter((x) => x !== id) : [...musts.ids, id]))
  }
  const owed = Math.max(0, score.promised - score.worked)

  return (
    <section className="onclock" aria-label="On the clock">
      {st && (
        <div className={`due level-${st.level}`} role="alert">
          <span className="grow">{st.text}</span>
          <button className="btn small" onClick={() => begin(st.taskId, st.blockId)}>Start</button>
          {tone === 'gentle' && <button className="btn ghost small" onClick={() => snooze(st.blockId)}>Not now</button>}
        </div>
      )}
      {!st && idle && (
        <div className="due level-1">
          <span className="grow">{tone === 'gentle' ? 'Job hours, and nothing planned. Anything to plan?' : "You're on the clock and nothing is planned. Put something down."}</span>
          <button className="btn small" onClick={openCapture}>Plan</button>
        </div>
      )}

      <div className="score">
        <div>
          <div className="n">{score.today.started}<span>/{score.today.planned}</span></div>
          <div className="l">started today</div>
        </div>
        <div className={score.missedWeek > 0 ? 'bad' : ''}>
          <div className="n">{score.missedWeek}</div>
          <div className="l">missed this week</div>
        </div>
        <div>
          <div className="n">{score.streak}</div>
          <div className="l">{score.streak === 1 ? 'clean day' : 'clean days'} in a row</div>
        </div>
        <div className="wide">
          <div className="n">{fmtDuration(score.worked * 60)}<span> of {fmtDuration(score.promised * 60)}</span></div>
          <div className="l">{owed > 0 ? `worked against promised this week. ${fmtDuration(owed * 60)} owed.` : 'worked against promised this week'}</div>
        </div>
      </div>

      {(candidates.length > 0 || musts.ids.length > 0) && (
        <div className="musts">
          <div className="eyebrow">Your three today{musts.ids.length > 0 ? ` · ${musts.kept} of ${musts.ids.length} done` : ''}</div>
          <div className="must-list">
            {candidates.map((t) => {
              const on = musts.ids.includes(t.id)
              return (
                <button key={t.id} className={`must ${on ? 'on' : ''} ${t.lane === 'job' ? 'job' : ''}`} aria-pressed={on} onClick={() => toggle(t.id)} disabled={!on && musts.ids.length >= 3}>
                  {on ? '✓ ' : ''}{t.title}
                </button>
              )
            })}
          </div>
          {musts.ids.length === 0 && <div className="faint small">Pick up to three. They're what the day gets judged on.</div>}
          {musts.ids.length > 0 && musts.kept === musts.ids.length && <div className="soft small">{verdict(tone, musts.kept, musts.ids.length)}</div>}
        </div>
      )}
    </section>
  )
}
