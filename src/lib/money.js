// All money is integer cents. Nothing in here touches floats for stored amounts.

// Parse a typed amount into cents. Returns NaN when it isn't a usable number.
// "1,000" -> 100000, "1,000.50" -> 100050, "12.5" -> 1250, "12,50" -> 1250 (European decimal comma).
export function parseAmount(input) {
  if (input == null) return NaN
  let s = String(input).trim().replace(/[\s$€£¥₹]/g, '').replace(/^(S|RM|A|NZ|HK|US)\$?/i, '')
  if (!s) return NaN
  if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) s = s.replace(/,/g, '') // thousands separators
  else if (/^\d*,\d{1,2}$/.test(s)) s = s.replace(',', '.') // lone decimal comma
  else s = s.replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN
  const [whole, frac = ''] = s.split('.')
  // Integer maths avoids parseFloat(x) * 100 rounding surprises.
  const cents = Number(whole || 0) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] || 0) >= 5 ? 1 : 0)
  return cents
}

// Parse a plain number (percent or share weight). Returns NaN when invalid.
export function parseNumber(input) {
  const s = String(input ?? '').trim().replace(',', '.')
  if (!s || !/^\d*\.?\d*$/.test(s) || s === '.') return NaN
  return Number(s)
}

// Split `total` cents by weights. Remainder cents go to the first members so the sum is exact.
export function splitByWeights(total, weights) {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0)
  const sum = ids.reduce((a, id) => a + weights[id], 0)
  const out = {}
  if (!sum) return out
  let given = 0
  for (const id of ids) {
    out[id] = Math.floor((total * weights[id]) / sum)
    given += out[id]
  }
  for (let i = 0; given < total; i = (i + 1) % ids.length, given++) out[ids[i]]++
  return out
}

// Positive = is owed, negative = owes.
export function balances(members, expenses) {
  const b = Object.fromEntries(members.map((m) => [m.id, 0]))
  for (const e of expenses) {
    b[e.paidBy] = (b[e.paidBy] ?? 0) + e.amount
    for (const [id, owed] of Object.entries(e.shares)) b[id] = (b[id] ?? 0) - owed
  }
  return b
}

// Greedy: biggest debtor pays biggest creditor. Usually the fewest transfers, not guaranteed.
export function simplify(b) {
  const cr = Object.entries(b).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((x, y) => y.v - x.v)
  const db = Object.entries(b).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((x, y) => y.v - x.v)
  const out = []
  let i = 0
  let j = 0
  while (i < cr.length && j < db.length) {
    const amt = Math.min(cr[i].v, db[j].v)
    out.push({ from: db[j].id, to: cr[i].id, amount: amt })
    cr[i].v -= amt
    db[j].v -= amt
    if (!cr[i].v) i++
    if (!db[j].v) j++
  }
  return out
}

// Turn the split editor's state into shares.
// mode: 'equal' | 'amounts' | 'percent' | 'shares'
// inputs: equal -> { id: true }, others -> { id: string }
// ids: member ids in display order (remainder cents go to the first ones).
// Returns { shares, valid, remaining } where remaining is cents (amounts) or percent points (percent).
export function computeShares(total, mode, inputs, ids) {
  const res = { shares: {}, valid: false, remaining: 0 }
  if (!(total > 0)) {
    if (mode === 'amounts') res.remaining = -sumAmounts(inputs, ids)
    return res
  }
  if (mode === 'equal') {
    const w = {}
    for (const id of ids) if (inputs?.[id]) w[id] = 1
    res.shares = splitByWeights(total, w)
    res.valid = Object.keys(res.shares).length > 0
    return res
  }
  if (mode === 'amounts') {
    let sum = 0
    let bad = false
    for (const id of ids) {
      const raw = inputs?.[id]
      if (raw == null || String(raw).trim() === '') continue
      const c = parseAmount(raw)
      if (Number.isNaN(c)) { bad = true; continue }
      if (c > 0) res.shares[id] = c
      sum += c
    }
    res.remaining = total - sum
    res.valid = !bad && sum === total
    return res
  }
  // percent and shares are both weights; scale to integers to keep maths exact.
  const w = {}
  let sum = 0
  let bad = false
  for (const id of ids) {
    const raw = inputs?.[id]
    if (raw == null || String(raw).trim() === '') continue
    const n = parseNumber(raw)
    if (Number.isNaN(n)) { bad = true; continue }
    w[id] = Math.round(n * 1000)
    sum += w[id]
  }
  res.shares = splitByWeights(total, w)
  if (mode === 'percent') {
    res.remaining = (100000 - sum) / 1000
    res.valid = !bad && sum === 100000
  } else {
    res.valid = !bad && sum > 0
  }
  return res
}

function sumAmounts(inputs, ids) {
  let s = 0
  for (const id of ids) {
    const c = parseAmount(inputs?.[id])
    if (!Number.isNaN(c)) s += c
  }
  return s
}

// Quick entry: one expense per line, e.g. "Grab 12.50", "48 dinner", "Coffee $4.20".
// The last number on the line is the amount; the rest is the description.
export function parseQuickLines(text) {
  const out = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(.*?)\s*((?:S?\$)?\d[\d,]*(?:\.\d+)?)\s*$/) || line.match(/^((?:S?\$)?\d[\d,]*(?:\.\d+)?)\s+(.*)$/)
    if (!m) { out.push({ line, error: true }); continue }
    const endsWithAmount = /\d\s*$/.test(line)
    const amountStr = endsWithAmount ? m[2] : m[1]
    const desc = (endsWithAmount ? m[1] : m[2]).replace(/[-:–]\s*$/, '').trim()
    const amount = parseAmount(amountStr)
    if (!(amount > 0)) { out.push({ line, error: true }); continue }
    out.push({ line, description: desc || 'Expense', amount })
  }
  return out
}
