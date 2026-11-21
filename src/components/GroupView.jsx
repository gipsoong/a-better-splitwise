import { useEffect, useMemo, useState } from 'react'
import { useStore, refresh, watch, setMe, addMember, saveExpense, deleteExpense, uid } from '../lib/store.js'
import { balances, simplify } from '../lib/money.js'
import { money, shortDate } from '../lib/format.js'
import { categorize } from '../lib/category.js'
import { describe, timeAgo } from '../lib/history.js'
import { Avatar, AvatarStack, Segmented, Tile, toast, useTween } from './ui.jsx'
import { Illustration } from './Illustration.jsx'
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
            <Illustration kind="lost" />
            <p>{status === 'offline' ? "You're offline and this group isn't saved on this device yet." : "This group doesn't exist, or it was deleted."}</p>
            <button className="btn ghost press" onClick={() => go('/')}>Back to groups</button>
          </div>
        )}
      </main>
    )
  }

  const active = group.members.filter((m) => !m.removed)
  if (!me || !group.members.some((m) => m.id === me)) return <WhoAreYou group={group} />

  const ctx = helpers(group, me)

  return (
    <main className="page with-fab">
      <TopBar title={group.name} onMenu={() => setMenu(true)} right={<AvatarStack members={active} size={24} max={4} />} />
      <Hero group={group} me={me} ctx={ctx} />
      <div className="sticky-tabs">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'balances', label: 'Balances' }, { value: 'activity', label: 'Activity' }]} />
      </div>
      <div className="fade" key={tab}>
        {tab === 'expenses' && <ExpenseList group={group} me={me} ctx={ctx} onOpen={(e) => setSheet({ open: true, editing: e })} />}
        {tab === 'balances' && <Balances group={group} me={me} ctx={ctx} />}
        {tab === 'activity' && <Activity group={group} ctx={ctx} />}
      </div>

      <button className="fab press" aria-label="Add expense" onClick={() => setSheet({ open: true, editing: null })}>
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </button>

      <ExpenseSheet open={sheet.open} editing={sheet.editing} group={group} me={me} onClose={() => setSheet((x) => ({ ...x, open: false }))} />
      <GroupMenu open={menu} onClose={() => setMenu(false)} group={group} me={me} />
    </main>
  )
}

function helpers(group, me) {
  const byId = Object.fromEntries(group.members.map((m) => [m.id, m]))
  return {
    member: (id) => byId[id],
    name: (id) => (id === me ? 'You' : byId[id]?.name || 'Someone'),
    money: (c) => money(c, group.currency),
  }
}

function TopBar({ title, onMenu, right }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => go('/')} aria-label="Back">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <h1 className="tb-title">{title}</h1>
      {right}
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

function Hero({ group, me, ctx }) {
  const b = balances(group.members, group.expenses)
  const mine = b[me] || 0
  const shown = useTween(Math.abs(mine))
  const plan = simplify(b).filter((p) => p.from === me || p.to === me)
  const spent = group.expenses.filter((e) => e.kind !== 'payment')
  const total = spent.reduce((a, e) => a + e.amount, 0)
  const myShare = spent.reduce((a, e) => a + (e.shares[me] || 0), 0)
  const cls = mine > 0 ? 'pos' : mine < 0 ? 'neg' : 'zero'

  return (
    <section className={`hero ${cls}`}>
      <div className="hero-glow" />
      <div className="hero-top">
        <span className="hero-label">{mine > 0 ? 'You are owed' : mine < 0 ? 'You owe' : 'All square'}</span>
        <Avatar member={ctx.member(me)} size={30} ring />
      </div>
      <div className="hero-amt num">{mine === 0 ? "You're settled up" : ctx.money(shown)}</div>
      {plan.length > 0 && (
        <div className="hero-lines">
          {plan.slice(0, 3).map((p) => (
            <span key={p.from + p.to} className="hero-line">
              <Avatar member={ctx.member(p.from === me ? p.to : p.from)} size={18} />
              {p.from === me ? `You owe ${ctx.member(p.to)?.name}` : `${ctx.member(p.from)?.name} owes you`} <b className="num">{ctx.money(p.amount)}</b>
            </span>
          ))}
          {plan.length > 3 && <span className="hero-line">+{plan.length - 3} more</span>}
        </div>
      )}
      <div className="stats">
        <div><small>Group spend</small><b className="num">{ctx.money(total)}</b></div>
        <div><small>Your share</small><b className="num">{ctx.money(myShare)}</b></div>
        <div><small>Expenses</small><b className="num">{spent.length}</b></div>
      </div>
    </section>
  )
}

function ExpenseList({ group, me, ctx, onOpen }) {
  const days = useMemo(() => {
    const list = [...group.expenses].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
    const out = []
    for (const e of list) {
      const label = shortDate(e.date)
      if (out.at(-1)?.label !== label) out.push({ label, items: [] })
      out.at(-1).items.push(e)
    }
    return out
  }, [group.expenses])

  if (!days.length) return <div className="empty rise"><Illustration kind="receipts" /><p><b>No expenses yet.</b><br />Tap + to add the first one.</p></div>

  const removePayment = (e) => {
    deleteExpense(group.id, e.id)
    toast('Payment deleted', { action: 'Undo', onAction: () => saveExpense(group.id, e) })
  }

  let n = 0
  return days.map((day) => (
    <section key={day.label} className="day">
      <h3 className="day-label">{day.label}</h3>
      <ul className="rows">
        {day.items.map((e) => {
          const i = n++
          const delta = (e.paidBy === me ? e.amount : 0) - (e.shares[me] || 0)
          if (e.kind === 'payment') {
            const to = Object.keys(e.shares)[0]
            return (
              <li key={e.id} className="row payment rise" style={{ '--d': Math.min(i, 12) }}>
                <span className="pay-avatars"><Avatar member={ctx.member(e.paidBy)} size={28} ring /><Avatar member={ctx.member(to)} size={28} ring /></span>
                <div className="row-main">
                  <div className="row-title">{ctx.name(e.paidBy)} paid {to === me ? 'you' : ctx.name(to)}</div>
                  <div className="row-sub">Settlement · {ctx.money(e.amount)}</div>
                </div>
                <button className="icon-btn small" aria-label="Delete payment" onClick={() => removePayment(e)}>
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </li>
            )
          }
          const cat = categorize(e.description)
          return (
            <li key={e.id} className="rise" style={{ '--d': Math.min(i, 12) }}>
              <button className="row press-soft" onClick={() => onOpen(e)}>
                <span className="tile-wrap">
                  <Tile icon={cat.icon} hue={cat.hue} />
                  <span className="tile-badge"><Avatar member={ctx.member(e.paidBy)} size={18} ring /></span>
                </span>
                <div className="row-main">
                  <div className="row-title">{e.description}</div>
                  <div className="row-sub">{ctx.name(e.paidBy)} paid <span className="num">{ctx.money(e.amount)}</span>{e.updatedBy ? ' · edited' : ''}</div>
                </div>
                <div className={`row-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}`}>
                  {delta === 0 ? <small>not involved</small> : (
                    <>
                      <small>{delta > 0 ? 'you lent' : 'you borrowed'}</small>
                      <span className="num">{ctx.money(Math.abs(delta))}</span>
                    </>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  ))
}

function Balances({ group, me, ctx }) {
  const b = balances(group.members, group.expenses)
  const plan = simplify(b)
  const people = group.members.filter((m) => !m.removed || b[m.id])
  const max = Math.max(1, ...people.map((m) => Math.abs(b[m.id] || 0)))

  const settle = (p) => {
    const e = { id: uid(), kind: 'payment', description: 'Payment', amount: p.amount, paidBy: p.from, shares: { [p.to]: p.amount }, date: new Date().toISOString(), createdBy: me }
    saveExpense(group.id, e)
    toast(`${ctx.name(p.from)} paid ${p.to === me ? 'you' : ctx.name(p.to)} ${ctx.money(p.amount)}`, { action: 'Undo', onAction: () => deleteExpense(group.id, e.id) })
  }

  return (
    <>
      <ul className="rows">
        {people.map((m, i) => {
          const v = b[m.id] || 0
          return (
            <li key={m.id} className="row bal rise" style={{ '--d': i }}>
              <Avatar member={m} size={40} />
              <div className="row-main">
                <div className="row-title">{m.id === me ? `${m.name} (you)` : m.name}</div>
                <div className="bar"><span className={v > 0 ? 'pos' : 'neg'} style={{ '--w': `${(Math.abs(v) / max) * 100}%` }} /></div>
              </div>
              <div className={`row-delta ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>
                {v === 0 ? <small>settled</small> : <><small>{v > 0 ? 'gets back' : 'owes'}</small><span className="num">{ctx.money(Math.abs(v))}</span></>}
              </div>
            </li>
          )
        })}
      </ul>

      <h3 className="day-label">Suggested payments</h3>
      {plan.length === 0 ? (
        <div className="empty small rise"><Illustration kind="party" size={120} /><p>Nothing to settle. Nice.</p></div>
      ) : (
        <ul className="rows">
          {plan.map((p, i) => (
            <li key={`${p.from}-${p.to}`} className="row rise" style={{ '--d': i }}>
              <span className="flow">
                <Avatar member={ctx.member(p.from)} size={32} ring />
                <svg viewBox="0 0 24 12" width="22" height="12"><path d="M1 6h20m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <Avatar member={ctx.member(p.to)} size={32} ring />
              </span>
              <div className="row-main">
                <div className="row-title">{ctx.name(p.from)} → {ctx.name(p.to)}</div>
                <div className="row-sub num">{ctx.money(p.amount)}</div>
              </div>
              <button className="btn small primary press" onClick={() => settle(p)}>Settle</button>
            </li>
          ))}
        </ul>
      )}
      <p className="fineprint">Suggestions match the biggest debts with the biggest credits. That's usually the fewest transfers, though not always.</p>
    </>
  )
}

function Activity({ group, ctx }) {
  const events = [...(group.events || [])].reverse()
  if (!events.length) return <div className="empty rise"><Illustration kind="clock" /><p>Changes will show up here: who added, edited or deleted what.</p></div>
  return (
    <ul className="feed">
      {events.slice(0, 200).map((ev, i) => {
        const d = describe(ev, ctx)
        return (
          <li key={ev.id} className="feed-item rise" style={{ '--d': Math.min(i, 12) }}>
            <span className="feed-avatar">
              <Avatar member={ctx.member(ev.actor)} name="?" size={34} />
              <span className="feed-icon">{d.icon}</span>
            </span>
            <div className="feed-main">
              <div className="feed-text">{d.text}</div>
              {d.sub && <div className="feed-sub">{d.sub}</div>}
              {d.details?.length > 0 && <ul className="feed-details">{d.details.map((x) => <li key={x}>{x}</li>)}</ul>}
              <time className="feed-time" dateTime={ev.at} title={new Date(ev.at).toLocaleString()}>{timeAgo(ev.at)}</time>
            </div>
          </li>
        )
      })}
    </ul>
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
        <Illustration kind="wave" size={120} />
        <h2>Who are you?</h2>
        <p className="muted">So Splitly can show what you owe. You can change this later.</p>
        <div className="who-grid">
          {group.members.filter((m) => !m.removed).map((m, i) => (
            <button key={m.id} className="who-pick press pop" style={{ animationDelay: `${i * 30}ms` }} onClick={() => setMe(group.id, m.id)}>
              <Avatar member={m} size={44} />
              <span>{m.name}</span>
            </button>
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
