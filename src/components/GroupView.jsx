import { useEffect, useMemo, useState } from 'react'
import { useStore, refresh, watch, setMe, addMember, saveExpense, deleteExpense, uid } from '../lib/store.js'
import { balances, simplify } from '../lib/money.js'
import { money, shortDate } from '../lib/format.js'
import { Avatar, Chip, Segmented, toast, useTween } from './ui.jsx'
import ExpenseSheet from './ExpenseSheet.jsx'
import GroupMenu from './GroupMenu.jsx'
import { go } from '../lib/router.js'

export default function GroupView({ gid }) {
  const group = useStore((s) => s.groups[gid])
  const me = useStore((s) => s.me[gid])
  const [status, setStatus] = useState(group ? 'ok' : 'loading')
  const [tab, setTab] = useState('expenses')
  const [sheet, setSheet] = useState({ open: false, editing: null })
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    let alive = true
    refresh(gid).then((r) => alive && setStatus((s) => (r === 'offline' && s === 'ok' ? 'ok' : r)))
    const stop = watch(gid)
    return () => { alive = false; stop() }
  }, [gid])

  if (!group) {
    return (
      <main className="page">
        <TopBar title="" />
        {status === 'loading' ? <Skeleton /> : (
          <div className="empty rise">
            <div className="empty-emoji">{status === 'offline' ? '📡' : '🤷'}</div>
            <p>{status === 'offline' ? "You're offline and this group isn't saved on this device yet." : "This group doesn't exist, or it was deleted."}</p>
            <button className="btn ghost press" onClick={() => go('/')}>Back to groups</button>
          </div>
        )}
      </main>
    )
  }

  const active = group.members.filter((m) => !m.removed)
  if (!me || !group.members.some((m) => m.id === me)) return <WhoAreYou group={group} />

  return (
    <main className="page with-fab">
      <TopBar title={group.name} onMenu={() => setMenu(true)} subtitle={active.map((m) => m.name).join(', ')} />
      <Banner group={group} me={me} />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }]} />
      <div className="fade" key={tab}>
        {tab === 'expenses'
          ? <ExpenseList group={group} me={me} onOpen={(e) => setSheet({ open: true, editing: e })} />
          : <Balances group={group} me={me} />}
      </div>

      <button className="fab press" aria-label="Add expense" onClick={() => setSheet({ open: true, editing: null })}>
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </button>

      <ExpenseSheet open={sheet.open} editing={sheet.editing} group={group} me={me} onClose={() => setSheet((x) => ({ ...x, open: false }))} />
      <GroupMenu open={menu} onClose={() => setMenu(false)} group={group} me={me} />
    </main>
  )
}

function TopBar({ title, subtitle, onMenu }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => go('/')} aria-label="Back">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="tb-title">
        <h1>{title}</h1>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {onMenu ? (
        <button className="icon-btn" onClick={onMenu} aria-label="Group menu">
          <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      ) : <span className="icon-btn" />}
    </header>
  )
}

function Skeleton() {
  return <div className="skeleton"><div /><div /><div /></div>
}

function Banner({ group, me }) {
  const mine = balances(group.members, group.expenses)[me] || 0
  const shown = useTween(Math.abs(mine))
  const cls = mine > 0 ? 'pos' : mine < 0 ? 'neg' : 'zero'
  return (
    <section className={`banner ${cls}`}>
      {mine === 0 ? (
        <div className="banner-main">You're all settled up <span className="wave">✨</span></div>
      ) : (
        <>
          <small>{mine > 0 ? 'You are owed' : 'You owe'}</small>
          <div className="banner-amt num">{money(shown, group.currency)}</div>
        </>
      )}
    </section>
  )
}

function ExpenseList({ group, me, onOpen }) {
  const name = (id) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name || '?')
  const list = useMemo(() => [...group.expenses].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)), [group.expenses])
  if (!list.length) return <div className="empty rise"><p>No expenses yet. Tap + to add one.</p></div>

  const removePayment = (e) => {
    deleteExpense(group.id, e.id)
    toast('Payment deleted', { action: 'Undo', onAction: () => saveExpense(group.id, e) })
  }

  return (
    <ul className="rows">
      {list.map((e, i) => {
        const delta = (e.paidBy === me ? e.amount : 0) - (e.shares[me] || 0)
        if (e.kind === 'payment') {
          const to = Object.keys(e.shares)[0]
          return (
            <li key={e.id} className="row payment rise" style={{ '--d': Math.min(i, 12) }}>
              <span className="row-icon">💸</span>
              <div className="row-main">
                <div className="row-title">{name(e.paidBy)} paid {to === me ? 'you' : name(to)}</div>
                <div className="row-sub">{money(e.amount, group.currency)} · {shortDate(e.date)}</div>
              </div>
              <button className="icon-btn small" aria-label="Delete payment" onClick={() => removePayment(e)}>
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </li>
          )
        }
        return (
          <li key={e.id} className="rise" style={{ '--d': Math.min(i, 12) }}>
            <button className="row press-soft" onClick={() => onOpen(e)}>
              <Avatar name={e.description} size={38} />
              <div className="row-main">
                <div className="row-title">{e.description}</div>
                <div className="row-sub">{name(e.paidBy)} paid {money(e.amount, group.currency)} · {shortDate(e.date)}</div>
              </div>
              <div className={`row-delta num ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}`}>
                {delta === 0 ? <small>not involved</small> : <>{delta > 0 ? '+' : '−'}{money(Math.abs(delta), group.currency)}</>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Balances({ group, me }) {
  const b = balances(group.members, group.expenses)
  const plan = simplify(b)
  const name = (id) => (id === me ? 'You' : group.members.find((m) => m.id === id)?.name || '?')
  const people = group.members.filter((m) => !m.removed || b[m.id])

  const settle = (p) => {
    const e = { id: uid(), kind: 'payment', description: 'Payment', amount: p.amount, paidBy: p.from, shares: { [p.to]: p.amount }, date: new Date().toISOString(), createdBy: me }
    saveExpense(group.id, e)
    toast(`${name(p.from)} paid ${p.to === me ? 'you' : name(p.to)} ${money(p.amount, group.currency)}`, { action: 'Undo', onAction: () => deleteExpense(group.id, e.id) })
  }

  return (
    <>
      <ul className="rows">
        {people.map((m, i) => (
          <li key={m.id} className="row rise" style={{ '--d': i }}>
            <Avatar name={m.name} size={38} />
            <div className="row-main"><div className="row-title">{m.id === me ? `${m.name} (you)` : m.name}</div></div>
            <div className={`row-delta num ${b[m.id] > 0 ? 'pos' : b[m.id] < 0 ? 'neg' : ''}`}>
              {b[m.id] === 0 ? <small>settled</small> : <>{b[m.id] > 0 ? '+' : '−'}{money(Math.abs(b[m.id]), group.currency)}</>}
            </div>
          </li>
        ))}
      </ul>

      <h3 className="section">Suggested payments</h3>
      {plan.length === 0 ? (
        <div className="empty small rise"><p>Nothing to settle. 🎉</p></div>
      ) : (
        <ul className="rows">
          {plan.map((p, i) => (
            <li key={`${p.from}-${p.to}`} className="row rise" style={{ '--d': i }}>
              <div className="row-main">
                <div className="row-title">{name(p.from)} → {name(p.to)}</div>
                <div className="row-sub num">{money(p.amount, group.currency)}</div>
              </div>
              <button className="btn small primary press" onClick={() => settle(p)}>Settle</button>
            </li>
          ))}
        </ul>
      )}
      <p className="fineprint">Suggestions use a greedy match of biggest debts to biggest credits. Usually the fewest transfers, not always.</p>
    </>
  )
}

function WhoAreYou({ group }) {
  const [name, setName] = useState('')
  const join = () => {
    const n = name.trim()
    if (!n) return
    const existing = group.members.find((m) => !m.removed && m.name.toLowerCase() === n.toLowerCase())
    setMe(group.id, existing ? existing.id : addMember(group.id, n))
  }
  return (
    <main className="page">
      <TopBar title={group.name} />
      <section className="card who rise">
        <h2>Who are you?</h2>
        <p className="muted">So Splitly can show what you owe. You can change this later.</p>
        <div className="chips">
          {group.members.filter((m) => !m.removed).map((m) => (
            <Chip key={m.id} onClick={() => setMe(group.id, m.id)}>{m.name}</Chip>
          ))}
        </div>
        <div className="join">
          <input placeholder="Not listed? Add your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join()} />
          <button className="btn primary press" disabled={!name.trim()} onClick={join}>Join</button>
        </div>
      </section>
    </main>
  )
}
