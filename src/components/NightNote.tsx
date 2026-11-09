import { useState } from 'react'
import { useStore } from '../lib/store'
import { openStillness } from './Meditate'

const KEY = 'studio-flow:hush'

/**
 * After eleven, quietly: it's late, nothing is on fire, go to bed. Gentle as a
 * villager telling you to go home. Nothing is blocked; the app works as usual.
 */
export function NightNote({ minutes }: { minutes: number }) {
  const { data } = useStore()
  const name = data.settings.name.trim()
  const [hushed, setHushed] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === new Date().toDateString()
    } catch {
      return false
    }
  })
  const hush = () => {
    setHushed(true)
    try {
      sessionStorage.setItem(KEY, new Date().toDateString())
    } catch {
      /* ignore */
    }
  }
  const hours = minutes < 5 * 60
  const line = hours
    ? `It's the small hours${name ? `, ${name}` : ''}. Whatever it is, it will look smaller after some sleep.`
    : `It's getting late${name ? `, ${name}` : ''}. Everything is saved and nothing is on fire.`

  if (hushed) {
    return (
      <div className="nightnote hushed" role="note">
        <span className="moon" aria-hidden="true" />
        <span className="grow">Sleep well. It will all be here in the morning.</span>
      </div>
    )
  }
  return (
    <section className="nightnote" aria-label="Night">
      <span className="moon" aria-hidden="true" />
      <div className="grow">
        <p className="night-msg">{line}</p>
        <p className="faint small" style={{ margin: '6px 0 0' }}>Work can wait. You can still use everything here if you need to.</p>
        <div className="alts" style={{ marginTop: 14 }}>
          <button className="btn" onClick={hush}>Goodnight</button>
          <button className="btn quiet" onClick={() => openStillness('breathe')}>Breathe first</button>
        </div>
      </div>
    </section>
  )
}
