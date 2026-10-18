import { startTimer } from '../lib/actions'
import { fmtDuration, longDate, smallDate } from '../lib/dates'
import { remainingMinutes } from '../lib/scheduler'
import { useStore } from '../lib/store'
import { Sheet } from './Sheet'
import { useStopTimer } from './TimerDock'
import { toast } from './Toast'

export function BlockSheet({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const { data, update } = useStore()
  const stopRunning = useStopTimer()
  const block = data.blocks.find((b) => b.id === blockId)
  if (!block) return null
  const task = data.tasks.find((t) => t.id === block.taskId)
  const project = data.projects.find((p) => p.id === task?.projectId)
  const running = data.active?.blockId === block.id

  const start = () => {
    update((d) => startTimer(d, block.taskId, block.id))
    onClose()
  }
  const stop = () => {
    stopRunning()
    onClose()
  }
  const finish = () => {
    update((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === block.id ? { ...b, done: true } : b)) }))
    toast('Marked done.')
    onClose()
  }
  const remove = () => {
    update((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== block.id) }))
    onClose()
  }

  return (
    <Sheet title={task?.title ?? 'Block'} onClose={onClose}>
      <div className="stack">
        <div className="row small soft">
          {project && <span className="dot" style={{ background: project.color }} />}
          <span>{project?.name ?? 'Personal'}</span>
        </div>
        <div>
          <div>{block.date ? longDate(block.date) : 'Waiting for a slot'}</div>
          <div className="soft small">
            {block.start} · {block.minutes} min
            {block.loggedSeconds > 0 && ` · ${fmtDuration(block.loggedSeconds)} logged, ${remainingMinutes(block)} min to go`}
          </div>
          {task && <div className="faint small">Task due {smallDate(task.dueDate)}</div>}
        </div>
        {task && task.subtasks.length > 0 && (
          <div className="soft small">
            {task.subtasks.map((s) => (
              <div key={s.id}>{s.done ? '✓' : '○'} {s.title}</div>
            ))}
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          {running ? (
            <button className="btn clay" onClick={stop}>Stop timer</button>
          ) : (
            <button className="btn" onClick={start} disabled={block.done}>Start timer</button>
          )}
          {!block.done && <button className="btn quiet" onClick={finish}>Mark done</button>}
          <button className="btn ghost" onClick={remove}>Remove</button>
        </div>
      </div>
    </Sheet>
  )
}
