/**
 * An abstract watercolour that paints itself while you focus: pale washes first,
 * then softer blobs, then brush strokes that draw themselves, then small bright
 * accents. A different picture every session, finished exactly at zero.
 */

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const PAPER = '#f7f2ec'
const tint = (color: string, amount: number) => toHex(mix(hex(color), hex(PAPER), amount))

const PALETTES: string[][] = [
  ['#ff7a8a', '#ffc15e', '#ff6fb5', '#8e7dff', '#2fc4c4', '#ff9f6b'], // sunset
  ['#2fc4c4', '#3a7bd5', '#7fe0c8', '#ffd08a', '#ff7a8a', '#b7a6ff'], // ocean
  ['#5ad1a0', '#ffb3c7', '#ffd27a', '#b7a6ff', '#3fa7a0', '#ff9f6b'], // garden
  ['#8e7dff', '#ff6fb5', '#ffb36b', '#3a7bd5', '#ff8a6b', '#7fe0c8'], // dusk
]

export type Kind = 'wash' | 'blob' | 'stroke' | 'dot'

export interface Mark {
  kind: Kind
  /** Where in the block (0–1) it begins to appear, and how long it takes to finish */
  t: number
  win: number
  color: string
  opacity: number
  x: number
  y: number
  /** Radius (wash, blob, dot) */
  r: number
  /** Vertical squash for blobs */
  squash: number
  /** Path and width for strokes */
  d: string
  w: number
}

/** A small seeded random generator, so a session's picture stays the same. */
function rng(seed: number) {
  let a = seed | 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build the whole picture for a seed. Everything is placed on a 1000 × 1000 canvas. */
export function makeArt(seed: number): Mark[] {
  const rand = rng(seed)
  const between = (a: number, b: number) => a + (b - a) * rand()
  const palette = PALETTES[Math.floor(rand() * PALETTES.length)]
  const pick = () => palette[Math.floor(rand() * palette.length)]
  const marks: Mark[] = []
  const base = (kind: Kind, t: number, win: number, color: string, opacity: number): Mark => ({ kind, t, win, color, opacity, x: 0, y: 0, r: 0, squash: 1, d: '', w: 0 })

  // Big pale washes lay the ground.
  for (let i = 0; i < 7; i++) {
    const m = base('wash', between(0, 0.3), 0.14, tint(pick(), 0.45), between(0.34, 0.5))
    Object.assign(m, { x: between(50, 950), y: between(50, 950), r: between(230, 400) })
    marks.push(m)
  }
  // Softer blobs of real colour, blending where they overlap.
  for (let i = 0; i < 14; i++) {
    const m = base('blob', between(0.15, 0.65), 0.1, pick(), between(0.34, 0.58))
    Object.assign(m, { x: between(0, 1000), y: between(0, 1000), r: between(90, 210), squash: between(0.55, 1) })
    marks.push(m)
  }
  // Long brush strokes that draw themselves.
  for (let i = 0; i < 18; i++) {
    const x0 = between(-50, 1050)
    const y0 = between(-50, 1050)
    const angle = between(0, Math.PI * 2)
    const len = between(260, 620)
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const bend = between(-160, 160)
    const px = -dy
    const py = dx
    const pt = (f: number, off: number) => `${(x0 + dx * len * f + px * off).toFixed(1)} ${(y0 + dy * len * f + py * off).toFixed(1)}`
    const m = base('stroke', between(0.3, 0.88), 0.07, pick(), between(0.5, 0.75))
    m.d = `M ${pt(0, 0)} C ${pt(0.33, bend)} ${pt(0.66, -bend)} ${pt(1, bend * 0.4)}`
    m.w = between(26, 72)
    marks.push(m)
  }
  // Fine bright accents and spatters, last of all.
  for (let i = 0; i < 9; i++) {
    const x0 = between(60, 940)
    const y0 = between(60, 940)
    const angle = between(0, Math.PI * 2)
    const len = between(120, 300)
    const m = base('stroke', between(0.76, 0.97), 0.05, i % 3 === 0 ? '#fffaf0' : pick(), between(0.7, 0.9))
    m.d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${(x0 + Math.cos(angle + 0.8) * len * 0.6).toFixed(1)} ${(y0 + Math.sin(angle + 0.8) * len * 0.6).toFixed(1)} ${(x0 + Math.cos(angle) * len).toFixed(1)} ${(y0 + Math.sin(angle) * len).toFixed(1)}`
    m.w = between(5, 12)
    marks.push(m)
  }
  for (let i = 0; i < 12; i++) {
    const m = base('dot', between(0.8, 0.99), 0.03, i % 4 === 0 ? '#fffaf0' : pick(), between(0.65, 0.9))
    Object.assign(m, { x: between(40, 960), y: between(40, 960), r: between(5, 20) })
    marks.push(m)
  }
  // Everything is finished by zero.
  for (const m of marks) m.t = Math.min(m.t, 1 - m.win)
  return marks.sort((a, b) => a.t - b.t)
}

const ease = (q: number) => q * q * (3 - 2 * q)

/** How far a mark has got (0 = not started, 1 = finished) when the block is `p` of the way through. */
export function progressOf(m: Mark, p: number): number {
  return ease(Math.max(0, Math.min(1, (p - m.t) / m.win)))
}

/** Round to a fraction of a percent so the picture only repaints when something visibly moves. */
export const settle = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 250) / 250
