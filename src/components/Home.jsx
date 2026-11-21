import { useRef, useState } from 'react'
import { useStore, createGroup, isShared, importGroup } from '../lib/store.js'
import { balances } from '../lib/money.js'
import { money, defaultCurrency } from '../lib/format.js'
import { Sheet, toast } from './ui.jsx'
import { go } from '../lib/router.js'

export default function Home() {
  const groups = useStore((s) => s.groups)
  const order = useStore((s) => s.order)
  const me = useStore((s) => s.me)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const list = order.map((id) => groups[id]).filter(Boolean)

  return (
    <main className="page">
      <header className="home-head">
        <div className="brand"><span className="logo">S</span>Splitly</div>
        {!isShared() && <span className="pill muted" title="Supabase isn't configured, data stays on this device">Local only</span>}
      </header>

      <h1 className="home-title">Groups</h1>

      {list.length === 0 ? (
        <div className="empty rise">
          <div className="empty-emoji">🧾</div>
          <p>No groups yet. Make one and share the link with your friends.</p>
        </div>
      ) : (
        <ul className="cards">
          {list.map((g, i) => {
            const mine = me[g.id] ? balances(g.members, g.expenses)[me[g.id]] || 0 : null
            return (
              <li key={g.id} className="rise" style={{ '--d': i }}>
                <button className="card group-card press" onClick={() => go(`/g/${g.id}`)}>
                  <div className="gc-main">
                    <div className="gc-name">{g.name}</div>
                    <div className="gc-members">{g.members.filter((m) => !m.removed).map((m) => m.name).join(', ')}</div>
                  </div>
                  {mine != null && (
                    <div className={`gc-bal ${mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}`}>
                      <small>{mine > 0 ? 'you are owed' : mine < 0 ? 'you owe' : 'settled'}</small>
                      {mine !== 0 && <span className="num">{money(Math.abs(mine), g.currency)}</span>}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="home-actions">
        <button className="btn primary block press" onClick={() => setCreating(true)}>+ New group</button>
        <button className="btn ghost block press" onClick={() => setImporting(true)}>Import from backup</button>
      </div>

      <NewGroupSheet open={creating} onClose={() => setCreating(false)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </main>
  )
}

function NewGroupSheet({ open, onClose }) {
  const [name, setName] = useState('')
  const [people, setPeople] = useState([])
  const [draft, setDraft] = useState('')
  const input = useRef(null)

  const addDraft = (text = draft) => {
    const names = text.split(',').map((s) => s.trim()).filter(Boolean)
    const next = [...people]
    for (const n of names) if (!next.some((p) => p.toLowerCase() === n.toLowerCase())) next.push(n)
    setPeople(next)
    setDraft('')
    return next
  }
  const all = draft.trim() ? [...people, draft.trim()] : people
  const valid = name.trim() && all.length >= 2

  const submit = () => {
    if (!valid) return
    const memberNames = addDraft()
    const gid = createGroup({ name: name.trim(), currency: defaultCurrency(), memberNames, meIndex: null })
    setName(''); setPeople([]); onClose()
    go(`/g/${gid}`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="New group"
      footer={<button className="btn primary block press" disabled={!valid} onClick={submit}>Create group</button>}>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bali trip, Flat 12B…"
          onKeyDown={(e) => e.key === 'Enter' && input.current?.focus()} />
      </label>
      <label className="field">
        <span>People</span>
        <div className="chip-input" onClick={() => input.current?.focus()}>
          {people.map((p) => (
            <span key={p} className="chip on pop">
              {p}<button type="button" aria-label={`Remove ${p}`} onClick={() => setPeople(people.filter((x) => x !== p))}>×</button>
            </span>
          ))}
          <input ref={input} value={draft} placeholder={people.length ? 'Add another' : 'Type a name, press Enter'}
            onChange={(e) => (e.target.value.includes(',') ? addDraft(e.target.value) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); draft.trim() ? addDraft() : submit() }
              if (e.key === 'Backspace' && !draft && people.length) setPeople(people.slice(0, -1))
            }} />
        </div>
        <small className="hint">Include yourself. You'll pick who you are next.</small>
      </label>
    </Sheet>
  )
}

function ImportSheet({ open, onClose }) {
  const [text, setText] = useState('')
  const run = () => {
    try {
      const data = JSON.parse(text)
      const gid = importGroup(data)
      setText(''); onClose(); go(`/g/${gid}`)
      toast('Group imported')
    } catch {
      toast("That doesn't look like a Splitly backup")
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Import backup"
      footer={<button className="btn primary block press" disabled={!text.trim()} onClick={run}>Import as new group</button>}>
      <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the JSON from Export" />
    </Sheet>
  )
}
