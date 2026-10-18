import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addDump, applySorted } from '../lib/actions'
import { ApiError, sortDump } from '../lib/api'
import { iso, smallDate } from '../lib/dates'
import { parseDump } from '../lib/parseDump'
import { money } from '../lib/stats'
import { useStore } from '../lib/store'
import type { SortedDump } from '../types'
import type { PageId } from '../App'

const DRAFT_KEY = 'studio-flow:draft'

const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function Dump({ go }: { go: (p: PageId) => void }) {
  const { data, update } = useStore()
  const [text, setText] = useState(readDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SortedDump | null>(null)

  const change = (v: string) => {
    setText(v)
    try {
      localStorage.setItem(DRAFT_KEY, v)
    } catch {
      /* ignore */
    }
  }

  const configured = !!data.settings.workerUrl && !!data.settings.appToken

  const sort = async () => {
    setBusy(true)
    setError('')
    try {
      const out = await sortDump(data.settings, text, {
        today: iso(),
        workDays: data.settings.workDays,
        defaultTaskDays: data.settings.defaultTaskDays,
        projects: data.projects.map((p) => p.name),
      })
      setResult(out)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Your words are safe.')
    } finally {
      setBusy(false)
    }
  }

  const finish = () => {
    update((d) => applySorted(addDump(d, text).data, result!))
    change('')
    setResult(null)
    toast('Placed on your calendar.')
    go('week')
  }

  const sortLocal = () => {
    setError('')
    setResult(parseDump(text))
  }

  const total = result
    ? result.projects.reduce((a, p) => a + p.tasks.length, 0) + (result.loose?.length ?? 0)
    : 0

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">Brain dump</div>
          <h1>Put it all down.</h1>
          <p className="lede">Messy is fine. Projects, tasks, fees, deadlines, worries. It will sort itself onto your calendar.</p>
        </div>
      </div>

      <textarea
        className="dump"
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder={'Logo refresh for Maya, £800, wants concepts by Friday. Need to invoice the cafe. Buy Procreate brushes £12…'}
        aria-label="Brain dump"
        autoFocus
      />

      {error && <div className="notice" style={{ marginTop: 20 }}>{error}</div>}

      <div className="row" style={{ marginTop: 24, flexWrap: 'wrap' }}>
        {configured ? (
          <>
            <button className="btn" onClick={sort} disabled={busy || !text.trim()}>{busy ? 'Sorting…' : 'Sort it out'}</button>
            <button className="btn quiet" onClick={sortLocal} disabled={busy || !text.trim()}>Sort without AI</button>
          </>
        ) : (
          <button className="btn" onClick={sortLocal} disabled={!text.trim()}>Sort it out</button>
        )}
        <span className="faint small">{text.length > 0 && `${text.trim().split(/\s+/).length} words`}</span>
      </div>

      <details className="howto">
        <summary>How to write it so it sorts well</summary>
        <div className="soft small">
          <p>Just write. A few habits help it understand you:</p>
          <pre>{`Maya café logo £800:
  concepts by Friday, 3h
    collect references
    pick palette
  send for review

Reply to emails tomorrow
Buy Procreate brushes £12`}</pre>
          <ul>
            <li>A line ending in <b>:</b> starts a project. Add its fee with <b>£800</b>.</li>
            <li>Indent to put tasks under it. Indent further for subtasks.</li>
            <li><b>Project: task</b> on one line also works.</li>
            <li>Deadlines: <b>by Friday</b>, <b>tomorrow</b>, <b>25 Oct</b>, <b>3/11</b>, <b>next week</b>.</li>
            <li>Time: <b>2h</b>, <b>90 min</b>. Days to finish: <b>5 days</b>.</li>
            <li>An amount with a spending word (<b>buy</b>, <b>paid</b>, <b>spent</b>) goes to Money.</li>
            <li>A blank line ends a project's group.</li>
          </ul>
          {!configured && (
            <p>
              Want it to understand loose, rambling writing? Connect the AI sorter in{' '}
              <button style={{ textDecoration: 'underline' }} onClick={() => go('settings')}>Settings</button>
              . It's optional.
            </p>
          )}
        </div>
      </details>

      {data.dumps.length > 0 && (
        <div className="section">
          <div className="row-head"><h2>Earlier dumps</h2></div>
          <div className="hairs">
            {data.dumps.slice(0, 5).map((d) => (
              <button key={d.id} className="item" style={{ width: '100%', textAlign: 'left' }} onClick={() => change(d.text)}>
                <span className="faint small" style={{ width: 64 }}>{smallDate(iso(new Date(d.at)))}</span>
                <span className="grow soft" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <Sheet title={total === 0 ? 'Nothing to place' : 'Here is what I found'} onClose={() => setResult(null)}>
          <div className="stack">
            {result.projects.map((p) => (
              <div key={p.name}>
                <div className="row">
                  <h3 className="grow">{p.name}{p.client ? <span className="faint"> · {p.client}</span> : null}</h3>
                  {p.pay ? <span className="chip">{money(p.pay)}</span> : null}
                </div>
                <ul className="soft small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {p.tasks.map((t, i) => (
                    <li key={i}>
                      {t.title}
                      {t.dueDate ? <span className="faint"> · due {smallDate(t.dueDate)}</span> : null}
                      {t.estimateMinutes ? <span className="faint"> · {t.estimateMinutes / 60}h</span> : null}
                      {t.subtasks?.length ? <span className="faint"> · {t.subtasks.length} steps</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!!result.loose?.length && (
              <div>
                <h3>Everything else</h3>
                <ul className="soft small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {result.loose.map((t, i) => (
                    <li key={i}>
                      {t.title}
                      {t.dueDate ? <span className="faint"> · due {smallDate(t.dueDate)}</span> : null}
                      {t.estimateMinutes ? <span className="faint"> · {t.estimateMinutes / 60}h</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!result.expenses?.length && (
              <div>
                <h3>Spending</h3>
                <ul className="soft small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {result.expenses.map((e, i) => <li key={i}>{e.note} · {money(e.amount)}</li>)}
                </ul>
              </div>
            )}
            {result.notes && <div className="faint small">{result.notes}</div>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={finish} disabled={total === 0 && !result.expenses?.length}>Place it</button>
              <button className="btn ghost" onClick={() => setResult(null)}>Not quite</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}
