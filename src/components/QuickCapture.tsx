import { useEffect, useRef, useState } from 'react'
import { guessKind, KIND_LABEL, KIND_ORDER, SWEEP_PROMPTS, splitThoughts, sweep, sweepSummary } from '../lib/sweep'
import type { SweepItem } from '../lib/sweep'
import { useStore } from '../lib/store'
import { windowsOn } from '../lib/scheduler'
import { iso, nowMinutes } from '../lib/dates'
import type { Lane } from '../types'
import { Seg } from './Fields'
import { IconPlus } from './Icons'
import { Sheet } from './Sheet'
import { toast } from './Toast'

/** Browsers call speech recognition different things; Safari on iPad has it. */
type Recognition = { start(): void; stop(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
const speech = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

let openIt: () => void = () => {}

/** Open the capture sheet from anywhere (e.g. the side menu). */
export const openCapture = () => openIt()

/**
 * The sweep: one thought at a time, typed or spoken. Each one lands as a card
 * with a guess at where it belongs (tap to change it), prompts walk you round
 * your head, and worries can simply be set down. Nothing is scheduled until
 * you send it all off, and closing keeps it too.
 */
export function QuickCapture({ hidden, onCareful }: { hidden: boolean; onCareful?: () => void }) {
  const { data, update, replaceAll } = useStore()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SweepItem[]>([])
  const [line, setLine] = useState('')
  const [ask, setAsk] = useState<(typeof SWEEP_PROMPTS)[number] | null>(null)
  const [lane, setLane] = useState<Lane>('freelance')
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  useEffect(() => {
    openIt = () => setOpen(true)
    return () => {
      openIt = () => {}
    }
  }, [])
  // During job hours a thought is probably about the job; otherwise it's your own time.
  useEffect(() => {
    if (!open) return
    const s = data.settings
    const m = nowMinutes()
    setLane(s.hasJob && windowsOn(iso(), s, 'job').some((w) => m >= w.from && m < w.to) ? 'job' : 'freelance')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => () => rec.current?.stop(), [])

  const add = (text: string, kind?: SweepItem['kind']) => {
    const clean = splitThoughts(text)
    if (!clean.length) return
    setItems((cur) => [...cur, ...clean.map((c) => ({ text: c, kind: kind ?? ask?.kind ?? guessKind(c) }))])
  }
  // A prompt's kind is a default, but a clearly money or worry thought still goes where it belongs.
  const addGuess = (text: string) => {
    const g = guessKind(text)
    add(text, g !== 'task' ? g : ask?.kind)
  }
  const submit = () => {
    if (!line.trim()) return
    addGuess(line)
    setLine('')
  }
  const cycle = (i: number) =>
    setItems((cur) => cur.map((it, j) => (j === i ? { ...it, kind: KIND_ORDER[(KIND_ORDER.indexOf(it.kind) + 1) % KIND_ORDER.length] } : it)))

  const listen = () => {
    if (listening) return rec.current?.stop()
    const R = speech()
    if (!R) return
    const r = new R()
    r.lang = navigator.language || 'en-GB'
    r.interimResults = false
    r.continuous = true
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      if (last?.isFinal) addGuess(last[0].transcript)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const close = () => {
    rec.current?.stop()
    const all = line.trim() ? [...items, ...splitThoughts(line).map((c) => ({ text: c, kind: guessKind(c) }))] : items
    if (all.length) {
      const before = data
      update((d) => sweep(d, all, new Date(), d.settings.hasJob ? lane : undefined))
      toast(sweepSummary(all), { label: 'Undo', run: () => replaceAll(before) })
    }
    setItems([])
    setLine('')
    setAsk(null)
    setOpen(false)
  }

  const canSpeak = typeof window !== 'undefined' && !!speech()
  const count = items.length + (line.trim() ? 1 : 0)
  return (
    <>
      {!hidden && (
        <button className="capture-fab" onClick={() => setOpen(true)} aria-label="Empty your head">
          <IconPlus />
        </button>
      )}
      {open && (
        <Sheet title="Empty your head" onClose={close}>
          <div className="stack sweep">
            <div className="prompts" role="group" aria-label="Prompts">
              {SWEEP_PROMPTS.map((p) => (
                <button key={p.label} type="button" className={`pick ${ask?.label === p.label ? 'on' : ''}`} onClick={() => setAsk(ask?.label === p.label ? null : p)}>{p.label}</button>
              ))}
            </div>
            <form className="sweep-in" onSubmit={(e) => { e.preventDefault(); submit() }}>
              <input
                className="say"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder={ask?.ask ?? 'One thought. Press return. Next one.'}
                aria-label="A thought"
                autoFocus
                enterKeyHint="next"
              />
              {canSpeak && (
                <button type="button" className={`mic ${listening ? 'on' : ''}`} onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak your thoughts'} aria-pressed={listening}>
                  <i aria-hidden="true" />
                </button>
              )}
            </form>
            {listening && <div className="faint small">Listening. Say each thought; they’ll appear below.</div>}
            {items.length > 0 && (
              <ul className="thoughts" aria-label="Your thoughts so far">
                {items.map((it, i) => (
                  <li key={i} className={`thought ${it.kind}`}>
                    <span className="grow">{it.text}</span>
                    <button type="button" className={`kind ${it.kind}`} onClick={() => cycle(i)} aria-label={`${it.text}: ${KIND_LABEL[it.kind]}. Tap to change.`}>{KIND_LABEL[it.kind]}</button>
                    <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
                  </li>
                ))}
              </ul>
            )}
            {data.settings.hasJob && items.some((i) => i.kind === 'task' || i.kind === 'spend') && (
              <Seg<Lane> label="Whose time" value={lane} options={[['job', 'Day job'], ['freelance', 'Freelance']]} onChange={setLane} />
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={close}>{count > 0 ? `Send ${count} where ${count === 1 ? 'it goes' : 'they go'}` : 'Done'}</button>
              {onCareful && <button type="button" className="btn ghost small" onClick={() => { setOpen(false); onCareful() }}>Paste a long list instead</button>}
              <span className="faint small">Tap a tag to change where a thought goes. Closing keeps them.</span>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
