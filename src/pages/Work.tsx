import { useState } from 'react'
import { IconClose, IconPlus } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addSubtask, addTask, deleteProject, deleteTask, markPaid, patchTask, saveProject, sendInvoice, startTimer, toggleSubtask, toggleTask, unsendInvoice } from '../lib/actions'
import { fmtDuration, iso, smallDate } from '../lib/dates'
import { effectiveRate, estimateRatio, invoiceDue, money, projectSeconds, readyToInvoice, taskProgress, taskSeconds } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Project, Task, TaskKind } from '../types'
import { Seg } from '../components/Fields'
import { kindOf, KIND_LABEL } from '../lib/kind'

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
          <div style={{ padding: '4px 4px 10px' }} className="stack">
            {!task.done && (
              <div className="kind-seg">
                <Seg<TaskKind>
                  label="Kind of work"
                  value={kindOf(task)}
                  options={(['focus', 'ideas', 'admin'] as TaskKind[]).map((k) => [k, KIND_LABEL[k]])}
                  onChange={(kind) => update((d) => patchTask(d, task.id, { kind }))}
                />
              </div>
            )}
            <label className="lab">
              First tiny step
              <input
                className="inline-field"
                value={task.firstStep ?? ''}
                onChange={(e) => update((d) => patchTask(d, task.id, { firstStep: e.target.value }))}
                placeholder="The smallest thing that gets it going"
              />
            </label>
            {task.resumeNote && <div className="faint small">Where you left off: {task.resumeNote}</div>}
          </div>
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

const TERMS = [7, 14, 30, 60]

function InvoiceSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const { update } = useStore()
  const [sentOn, setSentOn] = useState(iso())
  const [terms, setTerms] = useState(14)
  return (
    <Sheet title={`Invoice for ${project.name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          update((d) => sendInvoice(d, project.id, { sentOn, termsDays: terms }))
          toast("Invoice noted. I'll nudge you on the day it's due.")
          onClose()
        }}
      >
        <p className="soft small" style={{ margin: 0 }}>
          {project.pay > 0 ? `${money(project.pay)}. ` : ''}You'll get a nudge the morning it's due, and another a week later if it still hasn't landed.
        </p>
        <div className="lab-row">
          <label className="lab">Sent on<input className="field" type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></label>
          <label className="lab">They have
            <select className="field" value={terms} onChange={(e) => setTerms(Number(e.target.value))}>
              {TERMS.map((t) => <option key={t} value={t}>{t} days to pay</option>)}
            </select>
          </label>
        </div>
        <button className="btn" style={{ marginTop: 8 }}>Save</button>
      </form>
    </Sheet>
  )
}

/** Where the project's money is: not invoiced, waiting, late, or paid. */
function PayBar({ project, onInvoice }: { project: Project; onInvoice: () => void }) {
  const { data, update } = useStore()
  if (project.pay <= 0 && !project.invoice) return null
  const due = invoiceDue(project)
  const pay = () => {
    update((d) => markPaid(d, project.id))
    const aside = Math.round(project.pay * (data.settings.taxPercent / 100))
    toast(project.pay > 0 ? `Paid. Lovely. Keep ${money(aside)} of it aside for tax.` : 'Marked paid.')
  }
  return (
    <div className="paybar">
      {project.invoice?.paidOn ? (
        <span className="chip">Paid {smallDate(project.invoice.paidOn)}</span>
      ) : due ? (
        <>
          <span className={`chip ${due.late > 0 ? 'clay' : ''}`}>
            {due.late > 0 ? `${due.late} ${due.late === 1 ? 'day' : 'days'} late` : due.due === iso() ? 'Due today' : `Invoiced · due ${smallDate(due.due)}`}
          </span>
          <button className="btn small" onClick={pay}>Mark paid</button>
          <button className="btn ghost small" onClick={() => update((d) => unsendInvoice(d, project.id))}>Undo</button>
        </>
      ) : (
        <>
          {readyToInvoice(data, project) ? <span className="chip clay">All done. Time to invoice?</span> : <span className="faint small">Not invoiced yet</span>}
          <button className="btn quiet small" onClick={onInvoice}>Invoice sent</button>
        </>
      )}
      {project.invoice?.paidOn && <button className="btn ghost small" onClick={() => update((d) => unsendInvoice(d, project.id))}>Undo</button>}
    </div>
  )
}

function TaskSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? '')
  const [hours, setHours] = useState('1')
  const [days, setDays] = useState(String(data.settings.defaultTaskDays))
  const learned = estimateRatio(data)
  const [padIt, setPadIt] = useState(true)
  const pad = learned && learned.ratio >= 1.15 && padIt ? learned.ratio : undefined
  const planned = Math.max(0.25, Number(hours) || 1) * 60
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
            estimateMinutes: planned,
            daysToComplete: Math.max(1, Math.round(Number(days) || d.settings.defaultTaskDays)),
            pad,
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
        {learned && learned.ratio >= 1.15 && (
          <label className="toggle">
            <input className="check sm" type="checkbox" checked={padIt} onChange={(e) => setPadIt(e.target.checked)} />
            <span>Lately things take you about ×{learned.ratio} what you plan. Book {fmtDuration(Math.max(15, Math.round((planned * learned.ratio) / 15) * 15) * 60)} instead?</span>
          </label>
        )}
        <button className="btn" style={{ marginTop: 8 }}>Add and schedule</button>
      </form>
    </Sheet>
  )
}

export function Work() {
  const { data } = useStore()
  const [sheet, setSheet] = useState<'task' | 'project' | Project | null>(null)
  const [invoicing, setInvoicing] = useState<Project | null>(null)
  const learned = estimateRatio(data)
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
          {learned && (
            <p className="faint small" style={{ marginTop: 8 }}>
              {learned.ratio >= 1.15
                ? `Your last ${learned.count} finished tasks took about ×${learned.ratio} what you planned. Everyone underestimates; new tasks can plan for it.`
                : learned.ratio <= 0.85
                  ? `Your last ${learned.count} finished tasks took less time than planned (×${learned.ratio}). Nice.`
                  : `Your last ${learned.count} finished tasks took about as long as you planned. Good instincts.`}
            </p>
          )}
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
              <PayBar project={p} onInvoice={() => setInvoicing(p)} />
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
      {invoicing && <InvoiceSheet project={invoicing} onClose={() => setInvoicing(null)} />}
    </div>
  )
}
