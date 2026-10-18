import { useState } from 'react'
import type { DragEvent } from 'react'
import { addTask, setStatus, statusOf, toggleSubtask } from '../lib/actions'
import type { Status } from '../lib/actions'
import { iso, smallDate } from '../lib/dates'
import { taskSeconds } from '../lib/stats'
import { fmtDuration } from '../lib/dates'
import { Seg } from '../components/Fields'
import { useStart } from '../components/RestGuard'
import { useStore } from '../lib/store'
import type { Task } from '../types'

const COLUMNS: { id: Status; title: string; hint: string }[] = [
  { id: 'todo', title: 'To do', hint: 'Waiting for its turn' },
  { id: 'doing', title: 'Doing', hint: 'In your hands now' },
  { id: 'done', title: 'Done', hint: 'Let it be finished' },
]

function Card({ task, status }: { task: Task; status: Status }) {
  const { data, update } = useStore()
  const project = data.projects.find((p) => p.id === task.projectId)
  const subsDone = task.subtasks.filter((s) => s.done).length
  const spent = taskSeconds(data, task.id)
  const overdue = status !== 'done' && task.dueDate < iso()
  const idx = COLUMNS.findIndex((c) => c.id === status)
  const prev = COLUMNS[idx - 1]
  const next = COLUMNS[idx + 1]
  const running = data.active?.taskId === task.id
  const begin = useStart()

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <article
      className={`kcard ${status === 'done' ? 'done' : ''} ${running ? 'running' : ''}`}
      draggable
      onDragStart={onDragStart}
      style={{ ['--c' as string]: project?.color ?? 'var(--mist)' }}
    >
      <div className="faint small row" style={{ gap: 8 }}>
        <span className="dot" style={{ background: project?.color ?? 'var(--mist)' }} />
        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project?.name ?? 'Personal'}</span>
        {running && <span className="chip">timing</span>}
      </div>
      <div className="title" style={{ margin: '6px 0 4px' }}>{task.title}</div>

      {task.subtasks.length > 0 && (
        <div className="ksubs">
          {task.subtasks.map((s) => (
            <label key={s.id} className={`ksub ${s.done ? 'done' : ''}`}>
              <input className="check sm" type="checkbox" checked={s.done} onChange={() => update((d) => toggleSubtask(d, task.id, s.id))} />
              <span>{s.title}</span>
            </label>
          ))}
          <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${(subsDone / task.subtasks.length) * 100}%` }} /></div>
        </div>
      )}

      <div className="faint small" style={{ marginTop: 8 }}>
        <span className={overdue ? 'neg' : ''}>due {smallDate(task.dueDate)}</span>
        {spent > 0 && ` · ${fmtDuration(spent)}`}
      </div>

      <div className="kmove">
        {prev ? <button onClick={() => update((d) => setStatus(d, task.id, prev.id))}>← {prev.title}</button> : <span />}
        {status === 'todo' && <button className="go" onClick={() => begin(task.id)}>Start</button>}
        {next ? <button onClick={() => update((d) => setStatus(d, task.id, next.id))}>{next.title} →</button> : <span />}
      </div>
    </article>
  )
}

function Column({ col, tasks, projectId }: { col: (typeof COLUMNS)[number]; tasks: Task[]; projectId: string | null }) {
  const { update } = useStore()
  const [over, setOver] = useState(false)
  const [draft, setDraft] = useState('')

  const add = () => {
    const title = draft.trim()
    if (!title) return
    update((d) => {
      const withTask = addTask(d, { projectId, title })
      const created = withTask.tasks[withTask.tasks.length - 1]
      return col.id === 'todo' ? withTask : setStatus(withTask, created.id, col.id)
    })
    setDraft('')
  }

  return (
    <section
      className={`kcol ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id) update((d) => setStatus(d, id, col.id))
      }}
    >
      <header>
        <h2>{col.title}</h2>
        <span className="chip">{tasks.length}</span>
      </header>
      <div className="faint small" style={{ margin: '-6px 4px 14px' }}>{col.hint}</div>
      <div className="stack" style={{ gap: 12 }}>
        {tasks.map((t) => <Card key={t.id} task={t} status={col.id} />)}
        {tasks.length === 0 && <div className="faint small" style={{ padding: '18px 8px', textAlign: 'center' }}>Nothing here.</div>}
      </div>
      {col.id !== 'done' && (
        <form className="kadd" onSubmit={(e) => { e.preventDefault(); add() }}>
          <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={col.id === 'todo' ? 'Add a task' : 'Add something already in progress'} />
        </form>
      )}
    </section>
  )
}

export function Board() {
  const { data, update } = useStore()
  const layout = data.settings.look.board
  const [filter, setFilter] = useState<string>('all')
  const projectId = filter === 'all' || filter === 'personal' ? null : filter
  const shown = data.tasks.filter((t) =>
    filter === 'all' ? true : filter === 'personal' ? t.projectId === null : t.projectId === filter,
  )
  const by = (s: Status) =>
    shown
      .filter((t) => statusOf(t) === s)
      .sort((a, b) => (s === 'done' ? b.createdAt - a.createdAt : a.dueDate.localeCompare(b.dueDate) || a.createdAt - b.createdAt))

  return (
    <div className="page wide">
      <div className="head">
        <div>
          <div className="eyebrow">Board</div>
          <h1>To do, doing, done.</h1>
          <p className="lede">Drag a card across, or use the arrows. Starting a timer moves a task to Doing on its own.</p>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 24, gap: 16 }}>
      <div className="seg" style={{ flexWrap: 'wrap', borderRadius: 24 }}>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Everything</button>
        {data.projects.map((p) => (
          <button key={p.id} className={filter === p.id ? 'on' : ''} onClick={() => setFilter(p.id)}>{p.name}</button>
        ))}
        <button className={filter === 'personal' ? 'on' : ''} onClick={() => setFilter('personal')}>Personal</button>
      </div>
      <Seg
        label="Board layout"
        value={layout}
        options={[['columns', 'Columns'], ['stacked', 'Stacked']]}
        onChange={(board) => update((d) => ({ ...d, settings: { ...d.settings, look: { ...d.settings.look, board } } }))}
      />
      </div>

      <div className={`kboard ${layout === 'stacked' ? 'stacked' : ''}`}>
        {COLUMNS.map((c) => <Column key={c.id} col={c} tasks={by(c.id)} projectId={projectId} />)}
      </div>
    </div>
  )
}
