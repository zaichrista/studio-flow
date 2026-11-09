import { useState } from 'react'
import { addTaskAt, moveBlock } from '../lib/actions'
import { dayName, fromMin, iso } from '../lib/dates'
import { windowsOn } from '../lib/scheduler'
import { useStore } from '../lib/store'
import type { Lane } from '../types'
import { Seg } from './Fields'
import { Sheet } from './Sheet'
import { toast } from './Toast'

const LENGTHS = [30, 45, 60, 90, 120, 180]

/** Press an empty spot on the calendar: plan a task right there, or add a fixed event. */
export function SlotSheet({ date, from, to, onEvent, onClose }: { date: string; from: number; to: number; onEvent: () => void; onClose: () => void }) {
  const { data, update, replaceAll } = useStore()
  const s = data.settings
  const inJob = s.hasJob && windowsOn(date, s, 'job').some((w) => from >= w.from && from < w.to)
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(Math.max(30, Math.min(180, to - from)))
  const [lane, setLane] = useState<Lane>(inJob ? 'job' : 'freelance')
  const waiting = data.blocks.filter((b) => !b.date && !b.done)
  const when = `${date === iso() ? 'today' : dayName(date)} at ${fromMin(from)}`

  const place = (fn: () => { data: typeof data } | { reason: string }, ok: string) => {
    const before = data
    const r = fn()
    if ('reason' in r) return toast(r.reason)
    update(() => r.data)
    toast(ok, { label: 'Undo', run: () => replaceAll(before) })
    onClose()
  }

  return (
    <Sheet title={`Plan something for ${when}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          place(() => addTaskAt(data, { projectId: null, title: title.trim(), lane }, date, from, minutes), `Booked ${title.trim()} for ${when}.`)
        }}
      >
        <label className="lab">What are you doing?<input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Finish the brand deck" /></label>
        <div className="lab-row">
          <label className="lab">For how long
            <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {(LENGTHS.includes(minutes) ? LENGTHS : [...LENGTHS, minutes].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m / 60} hours`}</option>)}
            </select>
          </label>
          {s.hasJob && (
            <div className="lab">Whose time
              <Seg<Lane> label="Lane" value={lane} options={[['job', 'Job'], ['freelance', 'Freelance']]} onChange={setLane} />
            </div>
          )}
        </div>
        <button className="btn" disabled={!title.trim()}>Book it</button>
      </form>

      {waiting.length > 0 && (
        <div className="stack" style={{ marginTop: 22, gap: 8 }}>
          <div className="small soft">Or put something that's waiting here</div>
          <div className="hairs">
            {waiting.map((b) => {
              const t = data.tasks.find((x) => x.id === b.taskId)
              return (
                <button key={b.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => place(() => moveBlock(data, b.id, date, from), `${t?.title ?? 'Work'} moved to ${when}.`)}>
                  <span className="grow"><span className="title">{t?.title}</span></span>
                  <span className="faint small">{b.minutes}m</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <button className="btn ghost small" onClick={onEvent}>Add a shift, appointment or personal event instead</button>
      </div>
    </Sheet>
  )
}
