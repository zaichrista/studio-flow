import { useState } from 'react'
import { IconClose, IconPlus } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addSubtask, addTask, deleteProject, deleteTask, saveProject, startTimer, toggleSubtask, toggleTask } from '../lib/actions'
import { fmtDuration, iso, smallDate } from '../lib/dates'
import { effectiveRate, money, projectSeconds, taskProgress, taskSeconds } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Project, Task } from '../types'

function TaskRow({ task }: { task: Task }) {
  const { data, update } = useStore()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const blocks = data.blocks.filter((b) => b.taskId === task.id && !b.done).length
  const spent = taskSeconds(data, task.id)
  const done = task.subtasks.filter((s) => s.done).length
  const overdue = !task.done && task.dueDate < iso()

  return (
    <div>
      <div className={`item ${task.done ? 'done' : ''}`}>
        <input className="check" type="checkbox" checked={task.done} onChange={() => update((d) => toggleTask(d, task.id))} aria-label={`Finish ${task.title}`} />
        <button className="grow" style={{ textAlign: 'left' }} onClick={() => setOpen(!open)}>
          <div className="title">{task.title}</div>
          <div className="faint small">
            {task.subtasks.length > 0 && `${done}/${task.subtasks.length} steps · `}
            {blocks > 0 && `${blocks} ${blocks === 1 ? 'block' : 'blocks'} · `}
            {spent > 0 && `${fmtDuration(spent)} spent · `}
            <span className={overdue ? 'neg' : ''}>due {smallDate(task.dueDate)}</span>
          </div>
        </button>
        {taskProgress(task) > 0 && !task.done && <span className="chip">{Math.round(taskProgress(task) * 100)}%</span>}
        {!task.done && (
          <button className="icon-btn" aria-label="Start timer" onClick={() => update((d) => startTimer(d, task.id))}>▶</button>
        )}
      </div>
      {open && (
        <div className="sub">
          {task.subtasks.map((s) => (
            <div key={s.id} className={`item ${s.done ? 'done' : ''}`}>
              <input className="check sm" type="checkbox" checked={s.done} onChange={() => update((d) => toggleSubtask(d, task.id, s.id))} />
              <span className="grow title" style={{ fontWeight: 400 }}>{s.title}</span>
            </div>
          ))}
          <form
            className="row"
            style={{ padding: '6px 4px 14px' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              update((d) => addSubtask(d, task.id, draft.trim()))
              setDraft('')
            }}
          >
            <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a step" />
            <button className="icon-btn" aria-label="Add step"><IconPlus /></button>
            <button type="button" className="icon-btn" aria-label="Delete task" onClick={() => confirm(`Delete “${task.title}”?`) && update((d) => deleteTask(d, task.id))}>
              <IconClose />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function ProjectSheet({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { update } = useStore()
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [pay, setPay] = useState(project?.pay ? String(project.pay) : '')
  return (
    <Sheet title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          update((d) => saveProject(d, { id: project?.id, name: name.trim(), client: client.trim(), pay: Math.max(0, Number(pay) || 0) }))
          onClose()
        }}
      >
        <label className="lab">Name<input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="lab-row">
          <label className="lab">Client<input className="field" value={client} onChange={(e) => setClient(e.target.value)} /></label>
          <label className="lab">Fee for the project (£)<input className="field" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" /></label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn">Save</button>
          {project && (
            <button type="button" className="btn ghost" onClick={() => {
              if (confirm(`Delete “${project.name}”? Its tasks stay, without a project.`)) {
                update((d) => deleteProject(d, project.id))
                onClose()
              }
            }}>Delete</button>
          )}
        </div>
      </form>
    </Sheet>
  )
}

function TaskSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? '')
  const [hours, setHours] = useState('1')
  const [days, setDays] = useState(String(data.settings.defaultTaskDays))
  return (
    <Sheet title="New task" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          update((d) => addTask(d, {
            projectId: projectId || null,
            title,
            estimateMinutes: Math.max(0.25, Number(hours) || 1) * 60,
            daysToComplete: Math.max(1, Math.round(Number(days) || d.settings.defaultTaskDays)),
          }))
          toast('Task placed on your calendar.')
          onClose()
        }}
      >
        <label className="lab">What needs doing?<input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <label className="lab">Project
          <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="lab-row">
          <label className="lab">Hours of work<input className="field" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
          <label className="lab">Working days to finish<input className="field" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
        </div>
        <button className="btn" style={{ marginTop: 8 }}>Add and schedule</button>
      </form>
    </Sheet>
  )
}

export function Work() {
  const { data } = useStore()
  const [sheet, setSheet] = useState<'task' | 'project' | Project | null>(null)
  const [showDone, setShowDone] = useState(false)
  const visible = (t: Task) => showDone || !t.done
  const loose = data.tasks.filter((t) => t.projectId === null && visible(t))
  const finished = data.tasks.filter((t) => t.done).length

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">Work</div>
          <h1>Projects & tasks</h1>
          <p className="lede">Everything you're carrying, with what it pays and what it costs you in time.</p>
        </div>
        <div className="row">
          <button className="btn quiet" onClick={() => setSheet('project')}>New project</button>
          <button className="btn" onClick={() => setSheet('task')}>New task</button>
        </div>
      </div>

      {data.projects.length === 0 && loose.length === 0 && (
        <div className="empty"><b>Nothing here yet</b>Use the Dump page, or add a project to begin.</div>
      )}

      <div className="stack" style={{ gap: 28 }}>
        {data.projects.map((p) => {
          const tasks = data.tasks.filter((t) => t.projectId === p.id && visible(t))
          const secs = projectSeconds(data, p.id)
          const rate = effectiveRate(data, p)
          return (
            <section key={p.id} className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ background: p.color, marginTop: 9 }} />
                <div className="grow">
                  <h2>{p.name}</h2>
                  <div className="faint small">{[p.client, secs > 0 ? `${fmtDuration(secs)} tracked` : '', rate ? `${money(Math.round(rate))}/hr so far` : ''].filter(Boolean).join(' · ')}</div>
                </div>
                <button className={`chip ${p.pay ? '' : 'clay'}`} onClick={() => setSheet(p)}>{p.pay ? money(p.pay) : 'Set fee'}</button>
              </div>
              <div className="hairs" style={{ marginTop: 12 }}>
                {tasks.length === 0 ? <div className="faint small" style={{ padding: '14px 4px' }}>No open tasks.</div> : tasks.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            </section>
          )
        })}

        {loose.length > 0 && (
          <section className="card flat">
            <h2>Everything else</h2>
            <div className="hairs" style={{ marginTop: 12 }}>{loose.map((t) => <TaskRow key={t.id} task={t} />)}</div>
          </section>
        )}
      </div>

      {finished > 0 && (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <button className="btn ghost small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {finished} finished</button>
        </div>
      )}

      {sheet === 'task' && <TaskSheet onClose={() => setSheet(null)} />}
      {sheet === 'project' && <ProjectSheet onClose={() => setSheet(null)} />}
      {sheet && typeof sheet === 'object' && <ProjectSheet project={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}
