import { iso } from '../lib/dates'
import { useStore } from '../lib/store'
import { isOffDay, offDayIdeas, SESSIONS, stillMessage, stillWeek, suggest } from '../lib/stillness'
import { openStillness } from './Meditate'
import { useDayMinutes } from './Sky'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * Stillness, up front. On a day off (or once work is put away) it takes the top
 * of Today: a quiet line, the practice that suits the hour, and the week's tally.
 */
export function Stillness({ closed }: { closed: boolean }) {
  const { data } = useStore()
  const today = iso()
  const off = isOffDay(data, today)
  const note = data.days[today]
  const hour = Math.floor(useDayMinutes() / 60)
  const pick = SESSIONS.find((s) => s.id === suggest(hour, note?.mood))!
  const week = stillWeek(data, today)
  const todayIdx = (new Date().getDay() + 6) % 7
  const worries = data.ideas.filter((i) => i.kind === 'worry').length

  return (
    <section className={`stillness ${off ? 'off' : ''}`} aria-label="Stillness">
      <div className="eyebrow">{off ? 'A day off' : 'Stillness'}</div>
      <p className="still-msg">{stillMessage(off, closed, hour, note?.mood)}</p>
      <div className="alts">
        <button className="btn" onClick={() => openStillness(pick.id)}>{pick.name}{pick.minutes ? ` · ${pick.minutes} min` : ''}</button>
        <button className="btn quiet" onClick={() => openStillness()}>Other ways</button>
      </div>
      <div className="still-week" aria-label="Stillness this week">
        {week.days.map((on, i) => (
          <span key={i} className={`dot-day ${on ? 'on' : ''} ${i === todayIdx ? 'today' : ''}`}>{DAYS[i]}</span>
        ))}
        <span className="faint small">{week.sits ? `${week.minutes} min across ${week.sits} ${week.sits === 1 ? 'pause' : 'pauses'} this week` : 'Nothing yet this week. Start small.'}</span>
      </div>
      {off && (
        <ul className="off-ideas">
          {offDayIdeas(today).map((idea) => <li key={idea}>{idea}</li>)}
        </ul>
      )}
      {worries > 0 && (
        <button className="fold" onClick={() => openStillness('down')}>{worries} {worries === 1 ? 'thing' : 'things'} set down. They’ll keep.</button>
      )}
    </section>
  )
}
