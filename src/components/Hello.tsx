import { useState } from 'react'
import { setDayNote } from '../lib/actions'
import { iso, longDate } from '../lib/dates'
import { isLateNight, PHASE_NAME, phaseOf } from '../lib/sky'
import { useStore } from '../lib/store'
import { zenLine } from '../lib/wellbeing'
import type { DayNote } from '../types'
import { Intention } from './Intention'
import { openStillness } from './Meditate'

const MOODS: { id: NonNullable<DayNote['mood']>; label: string; reply: string }[] = [
  { id: 'heavy', label: 'Heavy', reply: 'Then today is gentle. Do one small thing, and let the rest wait.' },
  { id: 'flat', label: 'Flat', reply: 'Flat days get done in small pieces. Start with the easiest one.' },
  { id: 'okay', label: 'Okay', reply: 'Steady is good. One thing at a time.' },
  { id: 'bright', label: 'Bright', reply: 'Good. Spend some of it on the thing you keep putting off.' },
]

export function greeting(name: string, minutes: number): string {
  const late = isLateNight(minutes)
  const phase = phaseOf(minutes)
  const hello = late ? 'Still up' : phase === 'dawn' || phase === 'morning' ? 'Good morning' : phase === 'midday' || phase === 'afternoon' ? 'Good afternoon' : 'Good evening'
  return name ? `${hello}, ${name}${late ? '?' : '.'}` : `${hello}${late ? '?' : '.'}`
}

/**
 * The top of Today, written to you: the hour, your name, what it's all for in
 * your own words, how you're arriving, and the one line for the day.
 */
export function Hello({ minutes }: { minutes: number }) {
  const { data, update } = useStore()
  const today = iso()
  const s = data.settings
  const mood = data.days[today]?.mood
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.why)
  const saveWhy = () => {
    update((d) => ({ ...d, settings: { ...d.settings, why: draft.trim() } }))
    setEditing(false)
  }
  const reply = MOODS.find((m) => m.id === mood)?.reply

  return (
    <header className="hello">
      <div className="eyebrow">{longDate(today)} · {PHASE_NAME[phaseOf(minutes)]}</div>
      <h1>{greeting(s.name.trim(), minutes)}</h1>
      <p className="zen">{zenLine(today)}</p>

      {editing ? (
        <form className="why" onSubmit={(e) => { e.preventDefault(); saveWhy() }}>
          <input className="say" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={saveWhy} autoFocus placeholder="What is all of this for?" aria-label="What is all of this for" enterKeyHint="done" />
        </form>
      ) : s.why ? (
        <button className="why said" onClick={() => { setDraft(s.why); setEditing(true) }} aria-label={`Working toward: ${s.why}. Tap to change.`}>
          <span>All of it is for</span> {s.why}
        </button>
      ) : (
        <button className="why blank" onClick={() => { setDraft(''); setEditing(true) }}>What is all of this for? Put it in your own words.</button>
      )}

      <div className="arriving" role="group" aria-label="How are you arriving today">
        <span className="faint small">Arriving</span>
        {MOODS.map((m) => (
          <button key={m.id} className={`mood ${mood === m.id ? 'on' : ''}`} aria-pressed={mood === m.id}
            onClick={() => update((d) => setDayNote(d, today, { mood: mood === m.id ? undefined : m.id }))}>{m.label}</button>
        ))}
      </div>
      {reply && (
        <p className="reply">
          {reply}
          {mood === 'heavy' && <> <button className="linkish" onClick={() => openStillness('down')}>Set something down</button></>}
        </p>
      )}

      <Intention />
    </header>
  )
}
