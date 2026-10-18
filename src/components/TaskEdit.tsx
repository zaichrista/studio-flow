import { useEffect, useState } from 'react'
import { deleteSubtask, editTask, renameSubtask } from '../lib/actions'
import { useStore } from '../lib/store'
import type { Subtask, Task } from '../types'

const hoursText = (m: number) => String(Math.round((m / 60) * 100) / 100)

/** Title, hours and due date of a task, saved when you leave each field. */
export function TaskEdit({ task }: { task: Task }) {
  const { update } = useStore()
  const [title, setTitle] = useState(task.title)
  const [hours, setHours] = useState(hoursText(task.estimateMinutes))
  useEffect(() => setTitle(task.title), [task.title])
  useEffect(() => setHours(hoursText(task.estimateMinutes)), [task.estimateMinutes])

  const saveTitle = () => {
    if (title.trim() && title.trim() !== task.title) update((d) => editTask(d, task.id, { title }))
    else setTitle(task.title)
  }
  const saveHours = () => {
    const h = Number(hours.replace(',', '.'))
    if (h > 0 && Math.round(h * 60) !== task.estimateMinutes) update((d) => editTask(d, task.id, { estimateMinutes: h * 60 }))
    else setHours(hoursText(task.estimateMinutes))
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="lab">
        Task
        <input className="inline-field title-field" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      <div className="lab-row">
        <label className="lab">
          Hours of work
          <input className="field" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} onBlur={saveHours} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} disabled={task.done} />
        </label>
        <label className="lab">
          Due
          <input className="field" type="date" value={task.dueDate} onChange={(e) => e.target.value && update((d) => editTask(d, task.id, { dueDate: e.target.value }))} disabled={task.done} />
        </label>
      </div>
    </div>
  )
}

/** A step you can rename in place or let go of. */
export function StepEdit({ task, step }: { task: Task; step: Subtask }) {
  const { update } = useStore()
  const [text, setText] = useState(step.title)
  useEffect(() => setText(step.title), [step.title])
  return (
    <>
      <input
        className={`inline-field step-field grow ${step.done ? 'done' : ''}`}
        value={text}
        aria-label="Step"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (text.trim() ? text.trim() !== step.title && update((d) => renameSubtask(d, task.id, step.id, text.trim())) : setText(step.title))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Remove ${step.title}`} onClick={() => update((d) => deleteSubtask(d, task.id, step.id))}>×</button>
    </>
  )
}
