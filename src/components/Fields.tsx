import type { ReactNode } from 'react'

export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const timeLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Times from `from` to `to` (minutes) in steps, always including the saved value. */
export function timeOptions(from: number, to: number, step: number, current?: string): string[] {
  const out: number[] = []
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) out.push(m)
  if (current) {
    const cur = toMinutes(current)
    if (!out.includes(cur)) out.push(cur)
  }
  return out.sort((a, b) => a - b).map(timeLabel)
}

export const withCurrent = (opts: number[], current: number) =>
  opts.includes(current) ? opts : [...opts, current].sort((a, b) => a - b)

export const mins = (m: number) =>
  m === 0 ? 'None' : m === 60 ? '1 hour' : m === 90 ? '1½ hours' : m === 120 ? '2 hours' : `${m} minutes`

export function Pick({
  name,
  value,
  onChange,
  children,
}: {
  name: string
  value: string | number
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="lab">
      {name}
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

/** A row of mutually exclusive soft buttons. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}
