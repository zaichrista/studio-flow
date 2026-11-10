import { iso, longDate } from '../lib/dates'
import { isLateNight, PHASE_NAME, phaseOf } from '../lib/sky'
import { useStore } from '../lib/store'
import { zenLine } from '../lib/wellbeing'
import { Intention } from './Intention'

export function greeting(name: string, minutes: number): string {
  const late = isLateNight(minutes)
  const phase = phaseOf(minutes)
  const hello = late ? 'Still up' : phase === 'dawn' || phase === 'morning' ? 'Good morning' : phase === 'midday' || phase === 'afternoon' ? 'Good afternoon' : 'Good evening'
  return name ? `${hello}, ${name}${late ? '?' : '.'}` : `${hello}${late ? '?' : '.'}`
}

/** The top of Today: a quiet hello, then today's intention, large, with room around it. */
export function Hello({ minutes }: { minutes: number }) {
  const { data } = useStore()
  const today = iso()
  return (
    <header className="hello">
      <div className="eyebrow">{longDate(today)} · {PHASE_NAME[phaseOf(minutes)]}</div>
      <p className="hello-line">{greeting(data.settings.name.trim(), minutes)}</p>
      <Intention />
      <p className="zen">{zenLine(today)}</p>
    </header>
  )
}
