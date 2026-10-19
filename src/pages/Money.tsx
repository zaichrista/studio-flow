import { useState } from 'react'
import { IconClose } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addTxn, deleteTxn, markPaid } from '../lib/actions'
import { iso, longDate, monthLabel, smallDate } from '../lib/dates'
import { txnClient, awaitingPayment, daysBetween, invoiceDue, money, monthSummary, nextTaxDay, taxSetAside, taxYear } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Txn } from '../types'

const EXPENSE_CATS = ['Software', 'Supplies', 'Food', 'Bills', 'Travel', 'Fun', 'Other']
const INCOME_CATS = ['Client work', 'Other']
const TAX_PERCENTS = [15, 20, 25, 30, 35, 40, 45]

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function TxnSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const [kind, setKind] = useState<Txn['kind']>('expense')
  const [clientId, setClientId] = useState('')
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
          update((d) => addTxn(d, { kind, amount: value, date, category: category || cats[cats.length - 1], note: note.trim(), ...(clientId ? { clientId } : {}) }))
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
        {data.clients.length > 0 && (
          <label className="lab">{kind === 'income' ? 'Received from' : 'Spent for'}
            <select className="field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {[...data.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
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
  const today = iso()
  const pct = data.settings.taxPercent
  const monthTax = taxSetAside(data, `${month}-01`, `${month}-31`)
  const year = taxYear(today)
  const yearTax = taxSetAside(data, year.from, today)
  const taxDay = nextTaxDay(today)
  const toTaxDay = daysBetween(today, taxDay)
  const safe = sum.income - monthTax - sum.expense
  const waiting = awaitingPayment(data)
  const waitingTotal = waiting.reduce((a, p) => a + p.pay, 0)
  const unbilled = data.projects.filter((p) => p.pay > 0 && !p.invoice && !p.archived).reduce((a, p) => a + p.pay, 0)
  const setPct = (n: number) => update((d) => ({ ...d, settings: { ...d.settings, taxPercent: n } }))

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
        <div>
          <div className="eyebrow">Safe to spend</div>
          <div className={`big ${safe < 0 ? 'neg' : ''}`}>{money(Math.round(safe * 100) / 100)}</div>
          <div className="faint small" style={{ marginTop: 6 }}>after {pct}% for tax</div>
        </div>
      </div>

      <div className="section">
        <div className="row-head"><h2>Tax pot</h2></div>
        <div className="card flat wash-sage stack">
          <div className="cols two">
            <div>
              <div className="eyebrow">Put aside this month</div>
              <div className="big" style={{ fontSize: 'clamp(28px,4vw,38px)', marginTop: 8 }}>{money(monthTax)}</div>
              <div className="faint small" style={{ marginTop: 6 }}>{pct}% of {money(sum.income)} in</div>
            </div>
            <div>
              <div className="eyebrow">This tax year so far</div>
              <div className="big" style={{ fontSize: 'clamp(28px,4vw,38px)', marginTop: 8 }}>{money(yearTax)}</div>
              <div className="faint small" style={{ marginTop: 6 }}>since {smallDate(year.from)}</div>
            </div>
          </div>
          <div className={`notice ${toTaxDay <= 45 ? '' : 'ok'}`} style={{ background: toTaxDay <= 45 ? undefined : 'var(--raised)' }}>
            Next tax day: <b>{longDate(taxDay)}</b>, in {toTaxDay} {toTaxDay === 1 ? 'day' : 'days'}. Move each payment's share into a separate savings pot as it lands, and it's never a scary bill.
          </div>
          <label className="lab" style={{ maxWidth: 280 }}>
            Share to set aside
            <select className="field" value={pct} onChange={(e) => setPct(Number(e.target.value))}>
              {(TAX_PERCENTS.includes(pct) ? TAX_PERCENTS : [...TAX_PERCENTS, pct].sort((a, b) => a - b)).map((n) => <option key={n} value={n}>{n}%</option>)}
            </select>
          </label>
          <div className="faint small">About 20–25% suits most basic-rate sole traders; more if you earn over £50,270. A rough guide, not tax advice.</div>
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="section">
          <div className="row-head"><h2>Waiting to be paid</h2><span className="faint small">{money(waitingTotal)}</span></div>
          <div className="hairs">
            {waiting.map((p) => {
              const due = invoiceDue(p, today)!
              const client = data.clients.find((c) => c.id === p.clientId)
              const chase = client?.email
                ? `mailto:${client.email}?subject=${encodeURIComponent(`Invoice for ${p.name}`)}&body=${encodeURIComponent(
                    `Hi ${client.name.split(' ')[0]},\n\nHope you're well. Just a gentle nudge on the invoice for ${p.name} (${money(p.pay)}), which was due on ${smallDate(due.due)}. Let me know if you need anything from me to get it paid.\n\nThank you!`,
                  )}`
                : null
              return (
                <div key={p.id} className="item">
                  <span className="dot" style={{ background: p.color }} />
                  <div className="grow">
                    <div className="title">{p.name}{client && <span className="faint" style={{ fontWeight: 400 }}> · {client.name}</span>}</div>
                    <div className={`small ${due.late > 0 ? 'neg' : 'faint'}`}>
                      {due.late > 0 ? `${due.late} ${due.late === 1 ? 'day' : 'days'} late. A friendly chase is fair.` : due.due === today ? 'Due today' : `Due ${smallDate(due.due)}`}
                    </div>
                  </div>
                  <span className="num">{money(p.pay)}</span>
                  {chase && due.late > 0 && <a className="btn ghost small" href={chase}>Chase</a>}
                  <button className="btn quiet small" onClick={() => { update((d) => markPaid(d, p.id)); toast(`Paid. Keep ${money(Math.round(p.pay * pct / 100))} aside for tax.`) }}>Paid</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            {rows.map((t) => {
              const who = data.clients.find((c) => c.id === txnClient(data, t))
              return (
              <div key={t.id} className="item">
                <span className="faint small" style={{ width: 56 }}>{smallDate(t.date)}</span>
                <div className="grow">
                  <div className="title">{t.note || t.category}</div>
                  <div className="faint small">{t.category}{who && ` · ${who.name}`}</div>
                </div>
                <span className={`num ${t.kind === 'income' ? 'pos' : ''}`}>{t.kind === 'income' ? '+' : '−'}{money(t.amount)}</span>
                <button className="icon-btn" aria-label="Delete" onClick={() => update((d) => deleteTxn(d, t.id))}><IconClose /></button>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {unbilled > 0 && (
        <div className="section">
          <div className="notice ok">{money(unbilled)} of project fees not invoiced yet. When you send one, tap “Invoice sent” on the Work page, and payments land here on their own.</div>
        </div>
      )}

      {adding && <TxnSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
