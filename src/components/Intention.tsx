import { useState } from 'react'
import { setDayNote } from '../lib/actions'
import { addDays, dayName, iso } from '../lib/dates'
import { useStore } from '../lib/store'
import { intentionIdeas, lastGoodThing } from '../lib/today'

/**
 * One line for how you want today to go. Tap a suggestion or write your own;
 * tap it again to change it. It's a compass, not a to-do.
 */
export function Intention() {
  const { data, update } = useStore()
  const today = iso()
  const saved = data.days[today]?.intention ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const good = lastGoodThing(data, today)

  const save = (text: string) => {
    update((d) => setDayNote(d, today, { intention: text.trim() }))
    setEditing(false)
  }
  const edit = () => {
    setDraft(saved)
    setEditing(true)
  }

  return (
    <section className="intention" aria-label="Today's intention">
      <div className="eyebrow">Today's intention</div>
      {saved && !editing ? (
        <button className="said" onClick={edit} aria-label={`Intention: ${saved}. Tap to change.`}>
          {saved}
        </button>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save(draft) }}>
          <input
            className="say"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => (draft.trim() || editing) && save(draft)}
            placeholder="How do you want today to go?"
            aria-label="Today's intention"
            autoFocus={editing}
            enterKeyHint="done"
          />
          {!draft && (
            <div className="picks">
              {intentionIdeas(data, today).map((idea) => (
                <button key={idea} type="button" className="pick" onMouseDown={(e) => e.preventDefault()} onClick={() => save(idea)}>
                  {idea}
                </button>
              ))}
            </div>
          )}
        </form>
      )}
      {good && (
        <div className="faint small yesterday">
          {good.date === addDays(today, -1) ? 'Yesterday' : dayName(good.date)}'s good thing: {good.text}
        </div>
      )}
    </section>
  )
}
