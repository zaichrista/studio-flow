/**
 * A calm gong, made from a few soft sine tones with slow decays: no audio files,
 * works offline. Safari needs a tap before it will make sound, so `prime()` is
 * called from the tap that opens a session.
 */
let ctx: AudioContext | null = null
let last = 0

function context(): AudioContext | null {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const C = W.AudioContext ?? W.webkitAudioContext
    if (!C) return null
    ctx ??= new C()
    return ctx
  } catch {
    return null
  }
}

/** Wake the audio system from inside a tap. */
export function prime(): void {
  void context()?.resume()
}

export type Gong = 'start' | 'step' | 'end'

const SHAPE: Record<Gong, { f: number; seconds: number; volume: number }> = {
  start: { f: 196, seconds: 3, volume: 0.22 },
  step: { f: 262, seconds: 2.2, volume: 0.2 },
  end: { f: 147, seconds: 5, volume: 0.3 },
}

/** Ring once. Does nothing if audio is unavailable, and ignores a repeat within a third of a second. */
export function gong(kind: Gong): void {
  const c = context()
  if (!c) return
  const now = performance.now()
  if (now - last < 300) return
  last = now
  void c.resume()
  const { f, seconds, volume } = SHAPE[kind]
  const t0 = c.currentTime + 0.02
  const master = c.createGain()
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2400
  master.gain.setValueAtTime(0.0001, t0)
  master.gain.exponentialRampToValueAtTime(volume, t0 + 0.04)
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds)
  master.connect(tone).connect(c.destination)
  // A bell-like spread of partials; the higher ones fade first.
  ;[
    [1, 1],
    [2.01, 0.5],
    [2.76, 0.35],
    [4.07, 0.18],
    [5.4, 0.1],
  ].forEach(([ratio, gain], i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.value = f * ratio
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds / (1 + i * 0.7))
    o.connect(g).connect(master)
    o.start(t0)
    o.stop(t0 + seconds + 0.1)
  })
}
