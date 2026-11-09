import { useCallback } from 'react'
import { deleteTask, patchTask, setStatus, snoozeBlock } from '../lib/actions'
import { addDays, dayName, fmtDuration, iso, longDate, smallDate } from '../lib/dates'
import { kindOf, KIND_LABEL } from '../lib/kind'
import type { TaskKind } from '../types'
import { Seg } from './Fields'
import { useStart } from './RestGuard'
import { ProjectPick } from './ProjectPick'
import { TaskEdit } from './TaskEdit'
import { remainingMinutes } from '../lib/scheduler'
import { useStore } from '../lib/store'
import { Sheet } from './Sheet'
import { useStopTimer } from './TimerDock'
import { toast } from './Toast'

/** "Not now": push a block to the next free slot an hour or more away, and say where it went. */
export function useSnooze() {
  const { data, update, replaceAll } = useStore()
  return useCallback((blockId: string) => {
    const before = data
    const after = snoozeBlock(data, blockId)
    const moved = after.blocks.find((b) => b.id === blockId)
    update((d) => snoozeBlock(d, blockId))
    const when = !moved?.date
      ? 'for when there is room'
      : moved.date === iso()
        ? `to ${moved.start}`
        : moved.date === addDays(iso(), 1)
          ? `to tomorrow, ${moved.start}`
          : `to ${dayName(moved.date)}, ${moved.start}`
    toast(`No problem. Moved ${when}.`, { label: 'Undo', run: () => replaceAll(before) })
  }, [data, update, replaceAll])
}

export function BlockSheet({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const { data, update } = useStore()
  const stopRunning = useStopTimer()
  const snooze = useSnooze()
  const begin = useStart()
  const block = data.blocks.find((b) => b.id === blockId)
  if (!block) return null
  const task = data.tasks.find((t) => t.id === block.taskId)
  const project = data.projects.find((p) => p.id === task?.projectId)
  const running = data.active?.blockId === block.id

  const start = () => {
    onClose()
    begin(block.taskId, block.id)
  }
  const stop = () => {
    stopRunning()
    onClose()
  }
  const others = data.blocks.filter((b) => b.taskId === block.taskId && b.id !== block.id && !b.done)
  const finish = () => {
    update((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === block.id ? { ...b, done: true } : b)) }))
    // The last block of a task is the natural moment to finish the task itself.
    if (task && !task.done && others.length === 0) toast('That was its last block. Is the task finished?', { label: 'Finish task', run: () => update((d) => setStatus(d, task.id, 'done')) })
    else toast('Marked done.')
    onClose()
  }
  // Every task keeps at least one block on the calendar, so the only block of a task can't just vanish.
  const remove = () => {
    if (task && others.length === 0) {
      if (!confirm(`This is the only block for “${task.title}”. Delete the whole task?`)) return
      update((d) => deleteTask(d, task.id))
    } else {
      update((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== block.id) }))
    }
    onClose()
  }

  return (
    <Sheet title={task?.title ?? 'Block'} onClose={onClose}>
      <div className="stack">
        {task ? (
          <>
            <TaskEdit task={task} />
            <ProjectPick task={task} />
          </>
        ) : (
          <div className="row small soft">
            {project && <span className="dot" style={{ background: project.color }} />}
            <span>{project?.name ?? 'Personal'}</span>
          </div>
        )}
        <div>
          <div>{block.date ? longDate(block.date) : 'Waiting for a slot'}</div>
          <div className="soft small">
            {block.start} · {block.minutes} min
            {block.loggedSeconds > 0 && ` · ${fmtDuration(block.loggedSeconds)} logged, ${remainingMinutes(block)} min to go`}
          </div>
          {task && <div className="faint small">Task due {smallDate(task.dueDate)}</div>}
        </div>
        {task?.resumeNote && (
          <div className="notice ok row" style={{ padding: '12px 16px' }}>
            <span className="grow">Where you left off: {task.resumeNote}</span>
            <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Clear note" onClick={() => update((d) => patchTask(d, task.id, { resumeNote: undefined }))}>×</button>
          </div>
        )}
        {task && (
          <div className="kind-seg">
            <Seg<TaskKind>
              label="Kind of work"
              value={kindOf(task)}
              options={(['focus', 'ideas', 'admin'] as TaskKind[]).map((k) => [k, KIND_LABEL[k]])}
              onChange={(kind) => update((d) => patchTask(d, task.id, { kind }))}
            />
          </div>
        )}
        {task && (
          <label className="lab">
            First tiny step
            <input
              className="inline-field"
              value={task.firstStep ?? ''}
              onChange={(e) => update((d) => patchTask(d, task.id, { firstStep: e.target.value }))}
              placeholder="e.g. Open the Figma file and look for two minutes"
            />
          </label>
        )}
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
          {!block.done && !running && block.date && (
            <button className="btn quiet" onClick={() => { snooze(block.id); onClose() }}>Not now</button>
          )}
          {!block.done && <button className="btn quiet" onClick={finish}>Mark done</button>}
          <button className="btn ghost" onClick={remove}>{task && others.length === 0 ? 'Delete task' : 'Remove block'}</button>
        </div>
      </div>
    </Sheet>
  )
}
