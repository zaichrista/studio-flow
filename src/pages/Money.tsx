import { useState } from 'react'
import { IconClose } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { addTxn, deleteTxn, markPaid } from '../lib/actions'
import { uid } from '../lib/id'
import { iso, longDate, monthLabel, smallDate } from '../lib/dates'
import { txnClient, awaitingPayment, daysBetween, invoiceDue, money, monthBudget, monthSummary, nextTaxDay, taxSetAside, taxYear } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Bill, Txn } from '../types'

// Rent and bills live in the budget, so they aren't counted twice here.
const EXPENSE_CATS = ['Software', 'Supplies', 'Food', 'Travel', 'Fun', 'Other']
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

const num = (v: string) => Math.max(0, Number(v.replace(/[£,\s]/g, '')) || 0)

/** Salary, rent and the bills that leave every month. */
function BudgetSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore()
  const b = data.settings.budget
  const [takeHome, setTakeHome] = useState(b.takeHome ? String(b.takeHome) : '')
  const [payDay, setPayDay] = useState(String(b.payDay))
  const [rent, setRent] = useState(b.rent ? String(b.rent) : '')
  const [savings, setSavings] = useState(b.savings ? String(b.savings) : '')
  return (
    <Sheet title="Salary, rent and savings" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          update((d) => ({
            ...d,
            settings: {
              ...d.settings,
              budget: { ...d.settings.budget, takeHome: num(takeHome), payDay: Math.min(28, Math.max(1, Math.round(Number(payDay)) || 25)), rent: num(rent), savings: num(savings) },
            },
          }))
          toast('Saved.')
          onClose()
        }}
      >
        <div className="lab-row">
          <label className="lab">Take-home pay a month (£)<input className="field" inputMode="decimal" value={takeHome} onChange={(e) => setTakeHome(e.target.value)} placeholder="After tax" autoFocus /></label>
          <label className="lab">Paid on the<input className="field" inputMode="numeric" value={payDay} onChange={(e) => setPayDay(e.target.value)} /></label>
        </div>
        <div className="lab-row">
          <label className="lab">Rent (£)<input className="field" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="0" /></label>
          <label className="lab">Savings a month (£)<input className="field" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="0" /></label>
        </div>
        <div className="faint small">Use take-home pay, after tax and pension. Your salary is already taxed, so only freelance money has tax set aside.</div>
        <button className="btn" style={{ marginTop: 8 }}>Save</button>
      </form>
    </Sheet>
  )
}

/** One monthly bill, edited in place: every change is saved as you go. */
function BillRow({ bill }: { bill: Bill }) {
  const { update } = useStore()
  const [name, setName] = useState(bill.name)
  const [amount, setAmount] = useState(bill.amount ? String(bill.amount) : '')
  const save = (patch: Partial<Bill>) =>
    update((d) => ({ ...d, settings: { ...d.settings, budget: { ...d.settings.budget, bills: d.settings.budget.bills.map((x) => (x.id === bill.id ? { ...x, ...patch } : x)) } } }))
  return (
    <div className="bill-row" onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}>
      <input className="field" aria-label="Bill name" value={name} placeholder="Name" onChange={(e) => { setName(e.target.value); save({ name: e.target.value }) }} onBlur={(e) => save({ name: e.target.value.trim() })} />
      <input className="field" aria-label="Amount" inputMode="decimal" value={amount} placeholder="£" onChange={(e) => { setAmount(e.target.value); save({ amount: num(e.target.value) }) }} />
      <button type="button" className="icon-btn" aria-label={`Remove ${bill.name || 'bill'}`} onClick={() => update((d) => ({ ...d, settings: { ...d.settings, budget: { ...d.settings.budget, bills: d.settings.budget.bills.filter((x) => x.id !== bill.id) } } }))}><IconClose /></button>
    </div>
  )
}

/** The bills that leave every month, always in view and always editable. */
function BillsSection() {
  const { data, update } = useStore()
  const bills = data.settings.budget.bills
  const add = () => update((d) => ({ ...d, settings: { ...d.settings, budget: { ...d.settings.budget, bills: [...d.settings.budget.bills, { id: uid(), name: '', amount: 0, day: 1 }] } } }))
  return (
    <div className="section">
      <div className="row-head">
        <h2>Bills each month</h2>
        <span className="faint small">{bills.length ? `${money(bills.reduce((a, x) => a + x.amount, 0))} a month` : ''}</span>
      </div>
      <div className="stack">
        {bills.length === 0 && <div className="faint small">No bills yet. Add one and it’s counted straight away.</div>}
        {bills.map((x) => <BillRow key={x.id} bill={x} />)}
        <div><button className="btn quiet small" onClick={add}>Add a bill</button></div>
        <div className="faint small">Just a name and what it costs each month. Changes save as you type.</div>
      </div>
    </div>
  )
}

export function Money() {
  const { data, update } = useStore()
  const [month, setMonth] = useState(iso().slice(0, 7))
  const [adding, setAdding] = useState(false)
  const [budgeting, setBudgeting] = useState(false)
  const sum = monthSummary(data, month)
  const bud = monthBudget(data, month)
  const top = sum.categories[0]?.[1] ?? 1
  const rows = [...sum.rows].sort((a, b) => b.date.localeCompare(a.date))
  const today = iso()
  const pct = data.settings.taxPercent
  const monthTax = taxSetAside(data, `${month}-01`, `${month}-31`)
  const year = taxYear(today)
  const yearTax = taxSetAside(data, year.from, today)
  const taxDay = nextTaxDay(today)
  const toTaxDay = daysBetween(today, taxDay)
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
          <p className="lede">Salary and freelance in, rent and bills out, what's left to spend.</p>
        </div>
        <div className="row">
          <button className="btn ghost small" onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <button className="btn ghost small" onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
          <button className="btn ghost small" onClick={() => setBudgeting(true)}>Salary & bills</button>
          <button className="btn" onClick={() => setAdding(true)}>Add</button>
        </div>
      </div>

      {!bud.set && (
        <div className="notice" style={{ marginBottom: 24 }}>
          Put in your salary, rent and bills and this page tells you what you can actually spend.{' '}
          <button className="btn small" onClick={() => setBudgeting(true)}>Set it up</button>
        </div>
      )}

      <div className="cols three">
        <div>
          <div className="eyebrow">Left to spend</div>
          <div className={`big ${bud.left < 0 ? 'neg' : 'pos'}`}>{money(bud.left)}</div>
          <div className="faint small" style={{ marginTop: 6 }}>
            {bud.daysLeft > 0 ? (bud.left > 0 ? `About ${money(Math.floor(bud.perDay))} a day for ${bud.daysLeft} ${bud.daysLeft === 1 ? 'day' : 'days'}` : 'Nothing to spare. Hold off.') : 'After rent, bills, savings and tax'}
          </div>
        </div>
        <div><div className="eyebrow">Freelance in</div><div className="big">{money(bud.freelance)}</div><div className="faint small" style={{ marginTop: 6 }}>{money(bud.tax)} set aside for tax</div></div>
        <div><div className="eyebrow">Spent</div><div className="big">{money(bud.spent)}</div></div>
      </div>

      {bud.set && (
        <div className="section">
          <div className="row-head"><h2>Where the month goes</h2></div>
          <div className="card flat">
            <div className="ledger">
              <div><span>Take-home pay</span><span className="num pos">+{money(bud.takeHome)}</span></div>
              <div><span>Freelance received</span><span className="num pos">+{money(bud.freelance)}</span></div>
              <div><span>Tax on freelance ({pct}%)</span><span className="num">−{money(bud.tax)}</span></div>
              <div><span>Rent</span><span className="num">−{money(bud.rent)}</span></div>
              {data.settings.budget.bills.map((x) => <div key={x.id}><span>{x.name || 'Bill'}</span><span className="num">−{money(x.amount)}</span></div>)}
              {bud.savings > 0 && <div><span>Savings</span><span className="num">−{money(bud.savings)}</span></div>}
              <div><span>Spent so far</span><span className="num">−{money(bud.spent)}</span></div>
              <div className="total"><span>Left to spend</span><span className={`num ${bud.left < 0 ? 'neg' : ''}`}>{money(bud.left)}</span></div>
            </div>
          </div>
        </div>
      )}

      <BillsSection />

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
          <div className="faint small">Your salary is taxed before it reaches you. Freelance money on top is taxed at your highest rate, so 20–40% is usual. A rough guide, not tax advice.</div>
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
          <div className="notice ok">{money(unbilled)} of project fees not invoiced yet. When you send one, tap “Invoice sent” on the Projects page, and payments land here on their own.</div>
        </div>
      )}

      {adding && <TxnSheet onClose={() => setAdding(false)} />}
      {budgeting && <BudgetSheet onClose={() => setBudgeting(false)} />}
    </div>
  )
}
