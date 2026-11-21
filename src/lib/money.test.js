import { describe, it, expect } from 'vitest'
import { parseAmount, splitByWeights, balances, simplify, computeShares, parseQuickLines } from './money.js'

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)

describe('parseAmount', () => {
  it('handles thousands separators', () => {
    expect(parseAmount('1,000')).toBe(100000)
    expect(parseAmount('12,345.67')).toBe(1234567)
    expect(parseAmount('100,000')).toBe(10000000)
  })
  it('handles plain and decimal input', () => {
    expect(parseAmount('90.50')).toBe(9050)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount('.5')).toBe(50)
    expect(parseAmount('48')).toBe(4800)
    expect(parseAmount('12,50')).toBe(1250)
    expect(parseAmount('$4.20')).toBe(420)
    expect(parseAmount('S$4.20')).toBe(420)
    expect(parseAmount('0.1')).toBe(10)
    expect(parseAmount('1.005')).toBe(101)
  })
  it('rejects junk', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('1.2.3')).toBeNaN()
    expect(parseAmount('.')).toBeNaN()
  })
})

describe('splitByWeights', () => {
  it('$90.50 three ways is 30.17 / 30.17 / 30.16', () => {
    const s = splitByWeights(9050, { a: 1, b: 1, c: 1 })
    expect(s).toEqual({ a: 3017, b: 3017, c: 3016 })
    expect(sum(s)).toBe(9050)
  })
  it('ignores zero weights', () => {
    expect(splitByWeights(100, { a: 1, b: 0 })).toEqual({ a: 100 })
  })
})

describe('computeShares', () => {
  const ids = ['a', 'b', 'c']
  it('equal', () => {
    const r = computeShares(9050, 'equal', { a: true, b: true, c: true }, ids)
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ a: 3017, b: 3017, c: 3016 })
  })
  it('50/30/20 percent of $90.50 is 45.25 / 27.15 / 18.10', () => {
    const r = computeShares(9050, 'percent', { a: '50', b: '30', c: '20' }, ids)
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ a: 4525, b: 2715, c: 1810 })
  })
  it('percent must total 100', () => {
    const r = computeShares(9050, 'percent', { a: '50', b: '30', c: '10' }, ids)
    expect(r.valid).toBe(false)
    expect(r.remaining).toBe(10)
  })
  it('amounts must equal total', () => {
    expect(computeShares(1000, 'amounts', { a: '6', b: '4' }, ids).valid).toBe(true)
    const r = computeShares(1000, 'amounts', { a: '6', b: '3' }, ids)
    expect(r.valid).toBe(false)
    expect(r.remaining).toBe(100)
  })
  it('shares weights', () => {
    const r = computeShares(1000, 'shares', { a: '2', b: '1', c: '1' }, ids)
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ a: 500, b: 250, c: 250 })
    expect(sum(computeShares(1000, 'shares', { a: '1.5', b: '1', c: '0.5' }, ids).shares)).toBe(1000)
  })
})

describe('balances and simplify', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  const expenses = [
    { paidBy: 'a', amount: 9050, shares: splitByWeights(9050, { a: 1, b: 1, c: 1 }) },
    { paidBy: 'b', amount: 12000, shares: splitByWeights(12000, { a: 1, b: 2, c: 1, d: 1 }) },
    { paidBy: 'd', amount: 777, shares: { c: 777 } },
  ]
  it('balances always sum to 0', () => {
    expect(sum(balances(members, expenses))).toBe(0)
  })
  it('settling every suggested payment leaves everyone at 0', () => {
    const b = balances(members, expenses)
    const payments = simplify(b).map((p) => ({ paidBy: p.from, amount: p.amount, shares: { [p.to]: p.amount } }))
    const after = balances(members, [...expenses, ...payments])
    expect(Object.values(after).every((v) => v === 0)).toBe(true)
  })
  it('a payment moves both balances toward zero', () => {
    const b = balances(members, [{ paidBy: 'a', amount: 1000, shares: { b: 1000 } }])
    expect(b).toMatchObject({ a: 1000, b: -1000 })
    const after = balances(members, [
      { paidBy: 'a', amount: 1000, shares: { b: 1000 } },
      { paidBy: 'b', amount: 400, shares: { a: 400 } },
    ])
    expect(after).toMatchObject({ a: 600, b: -600 })
  })
})

describe('parseQuickLines', () => {
  it('reads description then amount', () => {
    expect(parseQuickLines('Grab 12.50\nDinner 48\n\n  Hotel 1,200  ')).toEqual([
      { line: 'Grab 12.50', description: 'Grab', amount: 1250 },
      { line: 'Dinner 48', description: 'Dinner', amount: 4800 },
      { line: 'Hotel 1,200', description: 'Hotel', amount: 120000 },
    ])
  })
  it('reads amount first, bare amounts, and flags bad lines', () => {
    const r = parseQuickLines('12.50 taxi\n30\nlunch')
    expect(r[0]).toMatchObject({ description: 'taxi', amount: 1250 })
    expect(r[1]).toMatchObject({ description: 'Expense', amount: 3000 })
    expect(r[2].error).toBe(true)
  })
  it('handles a number inside the description', () => {
    expect(parseQuickLines('Day 2 lunch 15')[0]).toMatchObject({ description: 'Day 2 lunch', amount: 1500 })
  })
})
