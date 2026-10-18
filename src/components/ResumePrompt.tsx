import { useEffect, useState } from 'react'
import { patchTask } from '../lib/actions'
import { useStore } from '../lib/store'
import { Sheet } from './Sheet'

let open: (taskId: string) => void = () => {}

/** After stopping, ask where you were up to, so the next block starts warm. */
export const askResume = (taskId: string) => open(taskId)

export function ResumePrompt() {
  const { data, update } = useStore()
  const [taskId, setTaskId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    open = (id) => {
      setTaskId(id)
      setNote('')
    }
    return () => {
      open = () => {}
    }
  }, [])

  const task = data.tasks.find((t) => t.id === taskId)
  if (!task || task.done) return null
  const close = () => setTaskId(null)

  return (
    <Sheet title="Where are you up to?" onClose={close}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) update((d) => patchTask(d, task.id, { resumeNote: note.trim() }))
          close()
        }}
      >
        <p className="soft small" style={{ margin: 0 }}>
          One line for future you. It shows up on the next {task.title} block, so you can start without warming up.
        </p>
        {task.resumeNote && <div className="faint small">Last time: {task.resumeNote}</div>}
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Halfway through the second concept. Next: try it in blush."
          aria-label="Where you're up to"
          autoFocus
        />
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn" disabled={!note.trim()}>Keep it</button>
          <button type="button" className="btn ghost" onClick={close}>Skip</button>
        </div>
      </form>
    </Sheet>
  )
}
