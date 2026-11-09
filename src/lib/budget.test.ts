import { describe, expect, it } from 'vitest'
import { addTxn, emptyData } from './actions'
import { monthBudget } from './stats'

const base = () => {
  const d = emptyData()
  return {
    ...d,
    settings: {
      ...d.settings,
      taxPercent: 25,
      budget: {
        takeHome: 2400,
        payDay: 25,
        rent: 900,
        savings: 200,
        bills: [
          { id: 'a', name: 'Phone', amount: 30, day: 12 },
          { id: 'b', name: 'Electric', amount: 70, day: 20 },
        ],
      },
    },
  }
}

describe('what is left to spend', () => {
  it('is salary minus rent, bills and savings before anything else', () => {
    const b = monthBudget(base(), '2026-11', '2026-11-09')
    expect(b.left).toBe(2400 - 900 - 100 - 200)
    expect(b.next).toEqual({ name: 'Phone', amount: 30, day: 12 })
  })

  it('adds freelance money but keeps tax back from it, and takes off spending', () => {
    let d = base()
    d = addTxn(d, { kind: 'income', amount: 400, date: '2026-11-03', category: 'Client work', note: '' })
    d = addTxn(d, { kind: 'expense', amount: 60, date: '2026-11-04', category: 'Food', note: '' })
    const b = monthBudget(d, '2026-11', '2026-11-09')
    expect(b.tax).toBe(100)
    expect(b.left).toBe(1200 + 400 - 100 - 60)
  })

  it('spreads what is left over the days remaining', () => {
    const b = monthBudget(base(), '2026-11', '2026-11-21')
    expect(b.daysLeft).toBe(10)
    expect(b.perDay).toBe(120)
  })

  it('never suggests a negative day', () => {
    const d = base()
    d.settings.budget.rent = 5000
    const b = monthBudget(d, '2026-11', '2026-11-09')
    expect(b.left).toBeLessThan(0)
    expect(b.perDay).toBe(0)
  })

  it('knows when nothing has been entered yet', () => {
    expect(monthBudget(emptyData(), '2026-11').set).toBe(false)
  })
})
