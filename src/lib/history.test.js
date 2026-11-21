import { describe as d, it, expect } from 'vitest'
import { diffExpense, describe } from './history.js'
import { applyOp } from './store.js'

const ctx = { name: (id) => ({ a: 'Ann', b: 'Ben', me: 'You' })[id] || 'Someone', money: (c) => `$${(c / 100).toFixed(2)}` }
const base = { id: 'x', description: 'Dinner', amount: 9050, paidBy: 'a', shares: { a: 4525, b: 4525 }, split: { mode: 'equal' } }

d('diffExpense', () => {
  it('lists what changed', () => {
    const after = { ...base, description: 'Late dinner', amount: 10000, paidBy: 'b', shares: { a: 5000, b: 5000 } }
    expect(diffExpense(base, after, ctx)).toEqual([
      'Name: “Dinner” → “Late dinner”',
      'Amount: $90.50 → $100.00',
      'Paid by: Ann → Ben',
      'Shares: Ann $45.25 → $50.00, Ben $45.25 → $50.00',
    ])
  })
  it('shows split mode and share moves when the total is unchanged', () => {
    const after = { ...base, shares: { a: 6000, b: 3050 }, split: { mode: 'amounts' } }
    expect(diffExpense(base, after, ctx)).toEqual(['Split: equally → by amounts', 'Shares: Ann $45.25 → $60.00, Ben $45.25 → $30.50'])
  })
  it('returns nothing when nothing changed', () => {
    expect(diffExpense(base, { ...base }, ctx)).toEqual([])
  })
})

d('describe', () => {
  it('reads naturally', () => {
    expect(describe({ action: 'added', actor: 'me', after: base }, ctx).text).toBe('You added Dinner')
    expect(describe({ action: 'deleted', actor: 'b', before: base }, ctx).text).toBe('Ben deleted Dinner')
    expect(describe({ action: 'member_added', actor: 'b', memberId: 'b', name: 'Ben' }, ctx).text).toBe('Ben joined')
    expect(describe({ action: 'added', actor: 'a', after: { kind: 'payment', paidBy: 'b', amount: 500, shares: { a: 500 } } }, ctx).text).toBe('Ann recorded Ben paying Ann $5.00')
  })
})

d('applyOp history', () => {
  it('appends each event once', () => {
    let groups = { g: { id: 'g', members: [], expenses: [], events: [] } }
    const op = { t: 'upsertExpense', gid: 'g', expense: base, event: { id: 'e1', action: 'added' } }
    groups = applyOp(applyOp(groups, op), op)
    expect(groups.g.events.map((e) => e.id)).toEqual(['e1'])
    expect(groups.g.expenses).toHaveLength(1)
  })
})
