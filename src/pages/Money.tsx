import { useState } from 'react'
import { IconClose } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { addTxn, deleteTxn } from '../lib/actions'
import { iso, monthLabel, smallDate } from '../lib/dates'
import { money, monthSummary } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Txn } from '../types'

const EXPENSE_CATS = ['Software', 'Supplies', 'Food', 'Bills', 'Travel', 'Fun', 'Other']
const INCOME_CATS = ['Client work', 'Other']

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function TxnSheet({ onClose }: { onClose: () => void }) {
  const { update } = useStore()
  const [kind, setKind] = useState<Txn['kind']>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(iso())
  const cats = kind === 'expense' ? EXPENSE_CATS : INCOME_CATS
  const value = Number(amount.replace(/[£,]/g, ''))
  return (
    <Sheet title="Add money in or out" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!(value > 0)) return
          update((d) => addTxn(d, { kind, amount: value, date, category: category || cats[cats.length - 1], note: note.trim() }))
          onClose()
        }}
      >
        <div className="seg" style={{ justifySelf: 'start' }}>
          <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategory('') }}>Spent</button>
          <button type="button" className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setCategory('') }}>Received</button>
        </div>
        <div className="lab-row">
          <label className="lab">Amount (£)<input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="0.00" /></label>
          <label className="lab">Date<input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <div className="lab-row">
          <label className="lab">Category
            <select className="field" value={category || cats[cats.length - 1]} onChange={(e) => setCategory(e.target.value)}>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="lab">Note<input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
        </div>
        <button className="btn" style={{ marginTop: 8 }} disabled={!(value > 0)}>Save</button>
      </form>
    </Sheet>
  )
}

export function Money() {
  const { data, update } = useStore()
  const [month, setMonth] = useState(iso().slice(0, 7))
  const [adding, setAdding] = useState(false)
  const sum = monthSummary(data, month)
  const top = sum.categories[0]?.[1] ?? 1
  const rows = [...sum.rows].sort((a, b) => b.date.localeCompare(a.date))
  const booked = data.projects.reduce((a, p) => a + p.pay, 0)

  return (
    <div className="page">
      <div className="head">
        <div>
          <div className="eyebrow">Money</div>
          <h1>{monthLabel(month + '-01')}</h1>
          <p className="lede">What came in, what went out, what's left.</p>
        </div>
        <div className="row">
          <button className="btn ghost small" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <button className="btn ghost small" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
          <button className="btn" onClick={() => setAdding(true)}>Add</button>
        </div>
      </div>

      <div className="cols three">
        <div><div className="eyebrow">In</div><div className="big pos">{money(sum.income)}</div></div>
        <div><div className="eyebrow">Out</div><div className="big">{money(sum.expense)}</div></div>
        <div><div className="eyebrow">Left</div><div className={`big ${sum.net < 0 ? 'neg' : ''}`}>{money(sum.net)}</div></div>
      </div>

      {sum.categories.length > 0 && (
        <div className="section">
          <div className="row-head"><h2>Where it went</h2></div>
          <div className="card flat wash-clay">
            {sum.categories.map(([name, amt]) => (
              <div key={name} className="cat">
                <span>{name}</span>
                <div className="bar"><i style={{ width: `${(amt / top) * 100}%` }} /></div>
                <span className="num">{money(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="row-head"><h2>Activity</h2></div>
        {rows.length === 0 ? (
          <div className="empty"><b>Quiet month</b>Nothing recorded yet.</div>
        ) : (
          <div className="hairs">
            {rows.map((t) => (
              <div key={t.id} className="item">
                <span className="faint small" style={{ width: 56 }}>{smallDate(t.date)}</span>
                <div className="grow">
                  <div className="title">{t.note || t.category}</div>
                  <div className="faint small">{t.category}</div>
                </div>
                <span className={`num ${t.kind === 'income' ? 'pos' : ''}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</span>
                <button className="icon-btn" aria-label="Delete" onClick={() => update((d) => deleteTxn(d, t.id))}><IconClose /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {booked > 0 && (
        <div className="section">
          <div className="notice ok">Your projects are booked at {money(booked)} in total. Record each payment above when it lands. (Automatic income is coming later.)</div>
        </div>
      )}

      {adding && <TxnSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
