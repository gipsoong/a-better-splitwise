import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, Chip, Segmented, toast } from './ui.jsx'
import { computeShares, parseAmount, parseQuickLines } from '../lib/money.js'
import { money, symbol, centsToInput } from '../lib/format.js'
import { saveExpense, deleteExpense, setPrefs, getState, uid } from '../lib/store.js'

const MODES = [
  { value: 'equal', label: 'Equally' },
  { value: 'amounts', label: 'Amounts' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' },
]

const blankInputs = () => ({ equal: {}, amounts: {}, percent: {}, shares: {} })

// Work out the starting state: the expense being edited, else this group's last-used settings, else defaults.
function initial(group, me, editing) {
  const active = group.members.filter((m) => !m.removed).map((m) => m.id)
  const inputs = blankInputs()
  inputs.equal = Object.fromEntries(active.map((id) => [id, true]))

  if (editing) {
    const split = editing.split || { mode: 'amounts', inputs: Object.fromEntries(Object.entries(editing.shares).map(([id, c]) => [id, centsToInput(c)])) }
    inputs[split.mode] = { ...split.inputs }
    return { amount: centsToInput(editing.amount), desc: editing.description === 'Expense' ? '' : editing.description, paidBy: editing.paidBy, mode: split.mode, inputs }
  }

  const prefs = getState().prefs[group.id]
  if (prefs) {
    const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id]) => active.includes(id)))
    if (prefs.mode !== 'amounts') inputs[prefs.mode] = keep(prefs.inputs)
    if (prefs.mode === 'equal' && !Object.keys(inputs.equal).length) inputs.equal = Object.fromEntries(active.map((id) => [id, true]))
    return { amount: '', desc: '', paidBy: active.includes(prefs.paidBy) ? prefs.paidBy : me || active[0], mode: prefs.mode, inputs }
  }
  return { amount: '', desc: '', paidBy: me || active[0], mode: 'equal', inputs }
}

export default function ExpenseSheet({ open, onClose, group, me, editing }) {
  const [s, setS] = useState(() => initial(group, me, editing))
  const [multi, setMulti] = useState(false)
  const [quick, setQuick] = useState('')
  const [added, setAdded] = useState(0)
  const amountRef = useRef(null)
  const quickRef = useRef(null)

  useEffect(() => {
    if (open) { setS(initial(group, me, editing)); setMulti(false); setQuick(''); setAdded(0) }
  }, [open, editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autofocus the amount once the sheet has started sliding in.
  useEffect(() => {
    if (open) { const t = setTimeout(() => (multi ? quickRef : amountRef).current?.focus(), 60); return () => clearTimeout(t) }
  }, [open, multi])

  const memberIds = useMemo(() => {
    const used = new Set(editing ? [editing.paidBy, ...Object.keys(editing.shares)] : [])
    return group.members.filter((m) => !m.removed || used.has(m.id))
  }, [group.members, editing])
  const ids = memberIds.map((m) => m.id)
  const name = (id) => group.members.find((m) => m.id === id)?.name || '?'
  const cur = group.currency

  const total = parseAmount(s.amount)
  const inputs = s.inputs[s.mode]
  const split = computeShares(total, s.mode, inputs, ids)
  const lines = multi ? parseQuickLines(quick) : []
  const goodLines = lines.filter((l) => !l.error)
  const quickTotal = goodLines.reduce((a, l) => a + l.amount, 0)
  // In quick entry the split is checked against a nominal total; Amounts mode isn't offered there.
  const quickSplit = computeShares(quickTotal || 100, s.mode, inputs, ids)
  const canSave = multi ? goodLines.length > 0 && quickSplit.valid && !lines.some((l) => l.error) : total > 0 && split.valid

  const patch = (p) => setS((x) => ({ ...x, ...p }))
  const setInput = (id, v) => setS((x) => ({ ...x, inputs: { ...x.inputs, [x.mode]: { ...x.inputs[x.mode], [id]: v } } }))
  const setMode = (mode) => {
    setS((x) => {
      const next = { ...x, mode, inputs: { ...x.inputs } }
      // Prefill something sensible the first time a mode is opened.
      const included = ids.filter((id) => x.inputs.equal[id])
      const people = included.length ? included : ids
      if (mode === 'percent' && !Object.keys(next.inputs.percent).length) {
        const base = Math.floor(10000 / people.length) / 100
        next.inputs.percent = Object.fromEntries(people.map((id, i) => [id, String(i === 0 ? +(100 - base * (people.length - 1)).toFixed(2) : base)]))
      }
      if (mode === 'shares' && !Object.keys(next.inputs.shares).length) next.inputs.shares = Object.fromEntries(people.map((id) => [id, '1']))
      return next
    })
  }

  const build = (amount, description, shares) => {
    const now = new Date().toISOString()
    return {
      id: editing?.id || uid(),
      kind: 'expense',
      description: description || 'Expense',
      amount,
      paidBy: s.paidBy,
      shares,
      split: { mode: s.mode, inputs: { ...inputs } },
      date: editing?.date || now,
      createdBy: editing ? editing.createdBy : me,
      updatedBy: editing ? me : undefined,
      updatedAt: now,
    }
  }

  const remember = () => setPrefs(group.id, { paidBy: s.paidBy, mode: s.mode, inputs: s.mode === 'amounts' ? {} : inputs })

  const save = (another = false) => {
    if (!canSave) return
    remember()
    if (multi) {
      const made = goodLines.map((l) => build(l.amount, l.description, computeShares(l.amount, s.mode, inputs, ids).shares))
      made.forEach((e) => saveExpense(group.id, e))
      toast(`Added ${made.length} expenses · ${money(quickTotal, cur)}`, { action: 'Undo', onAction: () => made.forEach((e) => deleteExpense(group.id, e.id)) })
      onClose()
      return
    }
    const e = build(total, s.desc.trim(), split.shares)
    saveExpense(group.id, e)
    if (another) {
      setAdded((n) => n + 1)
      patch({ amount: '', desc: '' })
      toast(`Added ${e.description} · ${money(total, cur)}`, { action: 'Undo', onAction: () => deleteExpense(group.id, e.id), ms: 3000 })
      amountRef.current?.focus()
    } else {
      if (!editing) toast(`Added ${e.description} · ${money(total, cur)}`, { action: 'Undo', onAction: () => deleteExpense(group.id, e.id), ms: 3000 })
      onClose()
    }
  }

  const remove = () => {
    const e = editing
    deleteExpense(group.id, e.id)
    toast(`Deleted ${e.description}`, { action: 'Undo', onAction: () => saveExpense(group.id, e) })
    onClose()
  }

  const onEnter = (e) => { if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); save(false) } }
  const modes = multi ? MODES.map((m) => (m.value === 'amounts' ? { ...m, disabled: true } : m)) : MODES

  const hint = (() => {
    if (s.mode === 'equal') {
      const n = Object.keys(split.shares).length || ids.filter((id) => inputs[id]).length
      if (!n) return { text: 'Pick at least one person', bad: true }
      const each = total > 0 ? Math.round(total / n) : 0
      return { text: multi ? `Split between ${n}` : `${money(each, cur)} each` }
    }
    if (s.mode === 'amounts') {
      const r = split.remaining
      if (!(total > 0)) return { text: 'Enter the total first' }
      if (r === 0) return { text: 'Adds up ✓', good: true }
      return { text: r > 0 ? `${money(r, cur)} left to assign` : `${money(-r, cur)} over`, bad: true }
    }
    if (s.mode === 'percent') {
      const r = Math.round((multi ? quickSplit : split).remaining * 1000) / 1000
      if (r === 0) return { text: '100% ✓', good: true }
      return { text: r > 0 ? `${r}% left` : `${-r}% over`, bad: true }
    }
    return { text: (multi ? quickSplit : split).valid ? 'Split by weight' : 'Add at least one share', bad: !(multi ? quickSplit : split).valid }
  })()

  const preview = multi ? null : split.shares
  const title = editing ? 'Edit expense' : multi ? 'Quick add' : 'Add expense'

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={
        <div className="foot-row">
          {editing ? (
            <button className="btn danger-ghost press" onClick={remove}>Delete</button>
          ) : !multi && (
            <button className="btn ghost press" disabled={!canSave} onClick={() => save(true)}>Save & add another</button>
          )}
          <button className="btn primary press grow" disabled={!canSave} onClick={() => save(false)}>
            {multi ? `Add ${goodLines.length || ''} expense${goodLines.length === 1 ? '' : 's'}` : 'Save'}
          </button>
        </div>
      }>
      <div onKeyDown={onEnter}>
        {!editing && (
          <div className="mode-switch">
            <button className={`link ${!multi ? 'on' : ''}`} onClick={() => setMulti(false)}>One expense</button>
            <button className={`link ${multi ? 'on' : ''}`} onClick={() => { setMulti(true); if (s.mode === 'amounts') setMode('equal') }}>Several at once</button>
          </div>
        )}

        {multi ? (
          <div className="quick">
            <textarea ref={quickRef} className="textarea mono" rows={5} value={quick} onChange={(e) => setQuick(e.target.value)}
              placeholder={'One per line:\nGrab 12.50\nDinner 48\nHotel 1,200'} />
            {lines.length > 0 && (
              <ul className="quick-preview">
                {lines.map((l, i) => (
                  <li key={i} className={l.error ? 'bad' : ''}>
                    <span>{l.error ? l.line : l.description}</span>
                    <span className="num">{l.error ? 'no amount' : money(l.amount, cur)}</span>
                  </li>
                ))}
                <li className="total"><span>Total</span><span className="num">{money(quickTotal, cur)}</span></li>
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="amount-box">
              <span className="cur">{symbol(cur)}</span>
              <input ref={amountRef} className="amount num" inputMode="decimal" placeholder="0.00" value={s.amount}
                style={{ width: `${Math.max(4, s.amount.length + 0.5)}ch` }}
                onChange={(e) => patch({ amount: e.target.value })} aria-label="Amount" />
            </div>
            <input className="desc" placeholder="What was it for?" value={s.desc} onChange={(e) => patch({ desc: e.target.value })} aria-label="Description" />
            {added > 0 && <div className="added-note pop">{added} added. Same payer and split kept.</div>}
          </>
        )}

        <div className="label">Paid by</div>
        <div className="chips">
          {memberIds.map((m) => (
            <Chip key={m.id} on={s.paidBy === m.id} onClick={() => patch({ paidBy: m.id })}>{m.id === me ? 'Me' : m.name}</Chip>
          ))}
        </div>

        <div className="label">Split</div>
        <Segmented value={s.mode} onChange={setMode} options={modes} />

        <div className="split-body fade" key={s.mode}>
          {s.mode === 'equal' ? (
            <div className="chips">
              {memberIds.map((m) => (
                <Chip key={m.id} on={!!inputs[m.id]} onClick={() => setInput(m.id, !inputs[m.id])}>{m.id === me ? 'Me' : m.name}</Chip>
              ))}
            </div>
          ) : (
            <ul className="split-rows">
              {memberIds.map((m) => (
                <li key={m.id}>
                  <span className="who">{m.id === me ? 'Me' : m.name}</span>
                  {s.mode !== 'amounts' && preview && <span className="calc num">{money(preview[m.id] || 0, cur)}</span>}
                  <span className="in-wrap">
                    {s.mode === 'amounts' && <span className="unit">{symbol(cur)}</span>}
                    <input inputMode="decimal" className="num" value={inputs[m.id] ?? ''} placeholder="0"
                      onChange={(e) => setInput(m.id, e.target.value)} aria-label={`${m.name} ${s.mode}`} />
                    {s.mode === 'percent' && <span className="unit">%</span>}
                    {s.mode === 'shares' && <span className="unit">×</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className={`split-hint ${hint.bad ? 'bad' : ''} ${hint.good ? 'good' : ''}`}>{hint.text}</div>
        </div>

        {editing && (
          <div className="meta">
            Added by {name(editing.createdBy) === '?' ? 'someone' : name(editing.createdBy)}
            {editing.updatedBy && ` · edited by ${name(editing.updatedBy)}`}
          </div>
        )}
      </div>
    </Sheet>
  )
}
