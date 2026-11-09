/** The sky over the day: colours that melt from dawn to dusk, and where the sun or moon sits. */

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export type Phase = 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'golden' | 'sunset' | 'dusk'

/** Minutes since midnight → the sky's two colours (top, horizon) and two sun-tinted accents. */
const KEYS: { at: number; top: string; bottom: string; a: string; b: string }[] = [
  { at: 0, top: '#1b1e3a', bottom: '#2f2b55', a: '#f2c879', b: '#9aa0e8' },
  { at: 4 * 60 + 30, top: '#22264d', bottom: '#40356a', a: '#f2c879', b: '#a79be8' },
  { at: 5 * 60 + 45, top: '#4b3f86', bottom: '#d98aa0', a: '#ffa38c', b: '#c9a2f0' },
  { at: 6 * 60 + 30, top: '#f6a5b6', bottom: '#ffd089', a: '#ff8a5c', b: '#ffb347' },
  { at: 8 * 60, top: '#ffe39b', bottom: '#fff1c4', a: '#ffa21f', b: '#ff7a45' },
  { at: 12 * 60, top: '#ffd84d', bottom: '#fff4c2', a: '#ffb000', b: '#ff8a1f' },
  { at: 15 * 60 + 30, top: '#ffc569', bottom: '#ffe6b3', a: '#ff9500', b: '#f0661a' },
  { at: 17 * 60 + 30, top: '#ff9a45', bottom: '#ffcc80', a: '#f2600d', b: '#ffa41f' },
  { at: 18 * 60 + 45, top: '#ff6a5c', bottom: '#ffb169', a: '#e03a6a', b: '#ff8b3d' },
  { at: 19 * 60 + 45, top: '#5e4290', bottom: '#e6727f', a: '#ffb86b', b: '#ff7aa8' },
  { at: 21 * 60, top: '#272b52', bottom: '#41386b', a: '#ffd27a', b: '#a9a6ff' },
  { at: 24 * 60, top: '#1b1e3a', bottom: '#2f2b55', a: '#f2c879', b: '#9aa0e8' },
]

export function phaseOf(min: number): Phase {
  if (min < 5 * 60 || min >= 21 * 60 + 30) return 'night'
  if (min < 7 * 60 + 30) return 'dawn'
  if (min < 11 * 60) return 'morning'
  if (min < 15 * 60) return 'midday'
  if (min < 17 * 60 + 30) return 'afternoon'
  if (min < 18 * 60 + 45) return 'golden'
  if (min < 19 * 60 + 45) return 'sunset'
  return 'dusk'
}

export const PHASE_NAME: Record<Phase, string> = {
  night: 'Night',
  dawn: 'Dawn',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  golden: 'Golden hour',
  sunset: 'Sunset',
  dusk: 'Dusk',
}

/** Is the sky dark enough that the page needs light ink? Decided by the sky's own brightness, so text is always readable. */
export const isDarkSky = (min: number) => skyAt(min).dark

/** The small hours: past eleven, before five. */
export const isLateNight = (min: number) => min >= 23 * 60 || min < 5 * 60

export interface Sky {
  top: string
  bottom: string
  phase: Phase
  /** 'sun' by day, 'moon' by night */
  orb: 'sun' | 'moon'
  /** Orb position, percent from the left and from the bottom */
  x: number
  y: number
  /** 0 (no stars) to 1 (full night) */
  stars: number
  /** Warm accent colours for the hour */
  a: string
  b: string
  /** True when the sky is dark and the page should use light ink */
  dark: boolean
}

const luma = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

export function skyAt(min: number): Sky {
  const m = ((min % 1440) + 1440) % 1440
  let i = KEYS.findIndex((k) => k.at > m) - 1
  if (i < 0) i = KEYS.length - 2
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = (m - a.at) / (b.at - a.at)
  const topC = mix(hex(a.top), hex(b.top), t)
  const bottomC = mix(hex(a.bottom), hex(b.bottom), t)
  const top = toHex(topC)
  const bottom = toHex(bottomC)

  // The sun is up 6:00–19:00, the moon the rest of the time; both rise on the left and set on the right.
  const sunUp = m >= 6 * 60 && m < 19 * 60
  const span = sunUp ? 13 * 60 : 11 * 60
  const p = sunUp ? (m - 6 * 60) / span : ((m - 19 * 60 + 1440) % 1440) / span
  const x = 8 + 84 * p
  const y = 14 + Math.sin(Math.PI * p) * 56

  const dark = Math.min(1, Math.max(0, m < 12 * 60 ? (6 * 60 + 30 - m) / 90 : (m - (19 * 60 + 15)) / 90))
  return {
    top,
    bottom,
    phase: phaseOf(m),
    orb: sunUp ? 'sun' : 'moon',
    x,
    y,
    stars: dark,
    a: toHex(mix(hex(a.a), hex(b.a), t)),
    b: toHex(mix(hex(a.b), hex(b.b), t)),
    dark: luma(mix(topC, bottomC, 0.5)) < 0.42,
  }
}
