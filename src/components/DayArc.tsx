import { fmtDuration, iso, nowMinutes, toMin } from '../lib/dates'
import { eventsOn } from '../lib/scheduler'
import { useStore } from '../lib/store'

const W = 1000
const L = 50
const R = 950
const BASE = 214
const H = 168

/**
 * The work day as the sun's path: it rises at your start time and sets at
 * your end. Blocks, breaks and fixed events sit along the arc, and the sun
 * shows where you are in it. A calm way to feel time without a clock.
 */
export function DayArc({ closed }: { closed: boolean }) {
  const { data } = useStore()
  const s = data.settings
  const today = iso()
  const from = toMin(s.dayStart)
  const to = toMin(s.dayEnd)
  const span = Math.max(1, to - from)
  const now = nowMinutes()
  const t = (m: number) => Math.min(1, Math.max(0, (m - from) / span))
  const pt = (u: number) => [L + (R - L) * u, BASE - H * Math.sin(Math.PI * u)] as const
  const along = (a: number, b: number) => {
    const n = Math.max(2, Math.ceil((b - a) * 60))
    return Array.from({ length: n + 1 }, (_, i) => pt(a + ((b - a) * i) / n))
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ')
  }

  const blocks = data.blocks.filter((b) => b.date === today)
  const colourOf = (taskId: string) =>
    data.projects.find((p) => p.id === data.tasks.find((x) => x.id === taskId)?.projectId)?.color ?? 'var(--mist)'
  const events = eventsOn(data.events, today)
  const u = (now - from) / span
  const before = u < 0
  const after = u > 1 || closed
  const sun = pt(Math.min(1, Math.max(0, u)))
  const leftToday = blocks.filter((b) => !b.done).reduce((a, b) => a + b.minutes, 0)

  const caption = closed
    ? 'The work day is put away. The rest of the light is yours.'
    : before
      ? `Your work day rises at ${s.dayStart}. No rush yet.`
      : after
        ? 'The work day has set. Put it away when you’re ready.'
        : `${fmtDuration((to - now) * 60)} of light left in your work day${leftToday ? `, ${fmtDuration(leftToday * 60)} of it planned` : ''}.`

  return (
    <section className={`arc ${after ? 'arc-set' : before ? 'arc-dawn' : 'arc-day'}`} aria-label={caption}>
      <svg viewBox={`0 0 ${W} 250`} role="img" aria-hidden="true">
        <defs>
          <radialGradient id="arc-sun">
            <stop offset="0" stopColor="var(--sun)" stopOpacity=".95" />
            <stop offset=".35" stopColor="var(--sun)" stopOpacity=".45" />
            <stop offset="1" stopColor="var(--sun)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="arc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sky-top)" stopOpacity=".0" />
            <stop offset="1" stopColor="var(--sky-low)" stopOpacity=".55" />
          </linearGradient>
        </defs>
        <path d={`${along(0, 1)} L${R} ${BASE} L${L} ${BASE} Z`} fill="url(#arc-sky)" />
        <path d={along(0, 1)} className="track" />
        {!before && <path d={along(0, Math.min(1, u))} className="walked" />}
        {s.breaks.filter((b) => b.minutes > 0).map((b) => {
          const a = t(toMin(b.start))
          const z = t(toMin(b.start) + b.minutes)
          return z > a ? <path key={b.id} d={along(a, z)} className="rest" /> : null
        })}
        {events.map(({ event, from: f, to: e }) => {
          const a = t(f)
          const z = t(e)
          return z > a ? <path key={event.id} d={along(a, z)} className={`evt ${event.kind}`} /> : null
        })}
        {blocks.map((b) => {
          const a = t(toMin(b.start))
          const z = t(toMin(b.start) + b.minutes)
          return z > a ? (
            <path key={b.id} d={along(a + 0.003, z - 0.003)} className={`bead ${b.done ? 'done' : ''}`} style={{ stroke: colourOf(b.taskId) }} />
          ) : null
        })}
        <line x1={L - 30} x2={R + 30} y1={BASE} y2={BASE} className="horizon" />
        {!after && (
          <g className="sun" transform={`translate(${sun[0]} ${before ? BASE + 6 : sun[1]})`}>
            <circle r="46" fill="url(#arc-sun)" className="glow" />
            <circle r="13" className="disc" />
          </g>
        )}
        {after && (
          <g className="moon" transform={`translate(${R - 40} 70)`}>
            <circle r="34" fill="url(#arc-sun)" className="glow" />
            <path d="M8 -12a14 14 0 1 0 6 22a11 11 0 0 1 -6 -22Z" className="disc" />
          </g>
        )}
        <text x={L} y={BASE + 30} className="lbl">{s.dayStart}</text>
        <text x={R} y={BASE + 30} className="lbl end">{s.dayEnd}</text>
      </svg>
      <p className="arc-caption">{caption}</p>
    </section>
  )
}
