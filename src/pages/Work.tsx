import { useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDown, IconClose, IconPlus } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addSubtask, addTask, clientNamed, deleteProject, deleteTask, markPaid, patchTask, saveProject, sendInvoice, toggleSubtask, toggleTask, unsendInvoice } from '../lib/actions'
import { fmtDuration, iso, smallDate } from '../lib/dates'
import { clientStats, effectiveRate, estimateRatio, invoiceDue, money, projectSeconds, readyToInvoice, taskProgress, taskSeconds } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Client, Project, Task, TaskKind } from '../types'
import { ClientSheet } from '../components/ClientSheet'
import { useStart } from '../components/RestGuard'
import { Seg } from '../components/Fields'
import { ProjectOptions } from '../components/ProjectOptions'
import { ProjectPick } from '../components/ProjectPick'
import { StepEdit, TaskEdit } from '../components/TaskEdit'
import { kindOf, KIND_LABEL } from '../lib/kind'
import { splitEstimate } from '../lib/estimate'

function TaskRow({ task }: { task: Task }) {
  const { data, update } = useStore()
  const begin = useStart()
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
          <button className="icon-btn" aria-label="Start timer" onClick={() => begin(task.id)}>▶</button>
        )}
      </div>
      {open && (
        <div className="sub">
          <div style={{ padding: '4px 4px 10px' }} className="stack">
            <TaskEdit task={task} />
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
            <ProjectPick task={task} />
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
              <StepEdit task={task} step={s} />
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

/** One quiet line: type, press return, done. Stays open for the next one. */
function QuickAdd({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        onAdd(text.trim())
        setText('')
      }}
    >
      <IconPlus />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} enterKeyHint="done" />
    </form>
  )
}

/** Which clients are folded away, remembered on this device. */
function useFolded(): [Set<string>, (id: string) => void] {
  const [folded, setFolded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sf-folded') ?? '[]')) } catch { return new Set() }
  })
  const toggle = (id: string) => setFolded((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    try { localStorage.setItem('sf-folded', JSON.stringify([...next])) } catch { /* private mode: fine for this visit */ }
    return next
  })
  return [folded, toggle]
}

function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className={`fold-body ${open ? 'open' : ''}`} aria-hidden={!open}><div>{children}</div></div>
}

function ProjectSheet({ project, clientId, onClose }: { project?: Project; clientId?: string | null; onClose: () => void }) {
  const { data, update } = useStore()
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState<string>(project?.clientId ?? clientId ?? '')
  const [newClient, setNewClient] = useState('')
  const [pay, setPay] = useState(project?.pay ? String(project.pay) : '')
  return (
    <Sheet title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          update((d) => {
            let next = d
            let id: string | null = client || null
            if (client === 'new') {
              if (newClient.trim()) {
                const made = clientNamed(d, newClient)
                next = made.data
                id = made.id
              } else id = null
            }
            return saveProject(next, { id: project?.id, name: name.trim(), clientId: id, pay: Math.max(0, Number(pay) || 0) })
          })
          onClose()
        }}
      >
        <label className="lab">Name<input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="lab-row">
          <label className="lab">Client
            <select className="field" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">No client</option>
              {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">New client…</option>
            </select>
          </label>
          <label className="lab">Fee for the project (£)<input className="field" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" /></label>
        </div>
        {client === 'new' && (
          <label className="lab">Client's name<input className="field" value={newClient} onChange={(e) => setNewClient(e.target.value)} autoFocus /></label>
        )}
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
            <ProjectOptions data={data} />
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
  const { data, update } = useStore()
  const [folded, toggleFold] = useFolded()
  const quickTask = (projectId: string | null) => (text: string) => {
    const { title, minutes } = splitEstimate(text)
    update((d) => addTask(d, { projectId, title, estimateMinutes: minutes }))
    toast(`Added${minutes ? ` (${fmtDuration(minutes * 60)})` : ''} and placed on your calendar.`)
  }
  const quickProject = (clientId: string | null) => (name: string) => update((d) => saveProject(d, { name, clientId }))
  const [taskSheet, setTaskSheet] = useState(false)
  const [projectSheet, setProjectSheet] = useState<{ project?: Project; clientId?: string | null } | null>(null)
  const [clientSheet, setClientSheet] = useState<{ client?: Client } | null>(null)
  const [invoicing, setInvoicing] = useState<Project | null>(null)
  const learned = estimateRatio(data)
  const [showDone, setShowDone] = useState(false)
  const visible = (t: Task) => showDone || !t.done
  const loose = data.tasks.filter((t) => t.projectId === null && visible(t))
  const finished = data.tasks.filter((t) => t.done).length
  const noClient = data.projects.filter((p) => !p.clientId || !data.clients.some((c) => c.id === p.clientId))
  // Clients with open work first, then the quiet ones, each alphabetical.
  const clients = [...data.clients].sort((a, b) => {
    const open = (c: Client) => (clientStats(data, c.id).openTasks > 0 ? 0 : 1)
    return open(a) - open(b) || a.name.localeCompare(b.name)
  })

  const projectCard = (p: Project) => {
    const tasks = data.tasks.filter((t) => t.projectId === p.id && visible(t))
    const secs = projectSeconds(data, p.id)
    const rate = effectiveRate(data, p)
    return (
      <section key={p.id} className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="dot" style={{ background: p.color, marginTop: 9 }} />
          <button className="grow project-name" onClick={() => setProjectSheet({ project: p })} aria-label={`Edit ${p.name}`}>
            <h2>{p.name}</h2>
            <div className="faint small">{[secs > 0 ? `${fmtDuration(secs)} tracked` : '', rate ? `${money(Math.round(rate))}/hr so far` : '', 'tap to edit'].filter(Boolean).join(' · ')}</div>
          </button>
          <button className={`chip ${p.pay ? '' : 'clay'}`} onClick={() => setProjectSheet({ project: p })}>{p.pay ? money(p.pay) : 'Set fee'}</button>
        </div>
        <PayBar project={p} onInvoice={() => setInvoicing(p)} />
        <div className="hairs" style={{ marginTop: 12 }}>
          {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
          <QuickAdd placeholder={tasks.length ? 'Add a task' : 'No open tasks. Add one?'} label={`Add a task to ${p.name}`} onAdd={quickTask(p.id)} />
        </div>
      </section>
    )
  }

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">Work</div>
          <h1>Clients & projects</h1>
          <p className="lede">The people you work for, what you're making them, and what it pays.</p>
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
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn ghost small" onClick={() => setClientSheet({})}>＋ Client</button>
          <button className="btn ghost small" onClick={() => setProjectSheet({})}>＋ Project</button>
          <button className="btn quiet small" onClick={() => setTaskSheet(true)}>＋ Task</button>
        </div>
      </div>

      {data.clients.length === 0 && data.projects.length === 0 && loose.length === 0 && (
        <div className="empty"><b>Nothing here yet</b>Add a client, or put everything down on the Dump page.</div>
      )}

      <div className="stack" style={{ gap: 44 }}>
        {clients.map((c) => {
          const st = clientStats(data, c.id)
          return (
            <section key={c.id} className={`client ${folded.has(c.id) ? 'folded' : ''}`}>
              <div className="client-head">
                <button className="fold-btn" onClick={() => toggleFold(c.id)} aria-expanded={!folded.has(c.id)} aria-label={`${folded.has(c.id) ? 'Show' : 'Hide'} ${c.name}`}>
                  <IconChevronDown />
                </button>
                <button className="client-who" onClick={() => toggleFold(c.id)} aria-expanded={!folded.has(c.id)}>
                  <span className="avatar" style={{ background: `color-mix(in srgb, ${c.color} 35%, var(--raised))` }} aria-hidden="true">{c.name.charAt(0).toUpperCase()}</span>
                  <span className="grow">
                    <span className="name">{c.name}</span>
                    <span className="faint small meta">
                      {[
                        `${st.projects.length} ${st.projects.length === 1 ? 'project' : 'projects'}`,
                        st.paid ? `${money(st.paid)} paid` : '',
                        st.waiting ? `${money(st.waiting)} waiting` : '',
                        st.spent ? `${money(st.spent)} spent` : '',
                        st.openTasks ? `${st.openTasks} open ${st.openTasks === 1 ? 'task' : 'tasks'}` : 'all quiet',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                <button className="btn ghost small" onClick={() => setClientSheet({ client: c })}>Details</button>
              </div>
              <Fold open={!folded.has(c.id)}>
                <div className="stack" style={{ gap: 18 }}>
                  {st.projects.map(projectCard)}
                  <QuickAdd placeholder={`New project for ${c.name.split(' ')[0]}`} label={`New project for ${c.name}`} onAdd={quickProject(c.id)} />
                </div>
              </Fold>
            </section>
          )
        })}

        {noClient.length > 0 && (
          <section className={`client ${folded.has('none') ? 'folded' : ''}`}>
            {data.clients.length > 0 && (
              <div className="client-head plain">
                <button className="fold-btn" onClick={() => toggleFold('none')} aria-expanded={!folded.has('none')} aria-label={`${folded.has('none') ? 'Show' : 'Hide'} projects without a client`}><IconChevronDown /></button>
                <button className="client-who" onClick={() => toggleFold('none')} aria-expanded={!folded.has('none')}>
                  <span className="name">Projects without a client</span>
                  {folded.has('none') && <span className="faint small">{noClient.length}</span>}
                </button>
              </div>
            )}
            <Fold open={data.clients.length === 0 || !folded.has('none')}>
              <div className="stack" style={{ gap: 18 }}>{noClient.map(projectCard)}</div>
            </Fold>
          </section>
        )}

        {loose.length > 0 && (
          <section className="card flat">
            <h2>Everything else</h2>
            <div className="hairs" style={{ marginTop: 12 }}>
              {loose.map((t) => <TaskRow key={t.id} task={t} />)}
              <QuickAdd placeholder="Add a task" label="Add a task with no project" onAdd={quickTask(null)} />
            </div>
          </section>
        )}
      </div>

      {finished > 0 && (
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <button className="btn ghost small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {finished} finished</button>
        </div>
      )}

      {taskSheet && <TaskSheet onClose={() => setTaskSheet(false)} />}
      {projectSheet && <ProjectSheet project={projectSheet.project} clientId={projectSheet.clientId} onClose={() => setProjectSheet(null)} />}
      {clientSheet && <ClientSheet client={clientSheet.client} onClose={() => setClientSheet(null)} />}
      {invoicing && <InvoiceSheet project={invoicing} onClose={() => setInvoicing(null)} />}
    </div>
  )
}
