import { useState } from 'react'
import { Sheet, Chip, Avatar, toast } from './ui.jsx'
import { setMe, addMember, removeMember, updateMember, updateGroup, forgetGroup, deleteGroupEverywhere, isShared, AVATAR_COLORS } from '../lib/store.js'
import { balances } from '../lib/money.js'
import { money, CURRENCIES } from '../lib/format.js'
import { go } from '../lib/router.js'

const EMOJIS = ['😎', '🐼', '🦊', '🐯', '🐸', '🐙', '🦄', '🐻', '🐨', '🐶', '🐱', '🐧', '🌸', '🌵', '🍕', '🍣', '🧋', '⚽️', '🎸', '🎮', '🚀', '🌙', '⭐️']

export default function GroupMenu({ open, onClose, group, me }) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)
  const b = balances(group.members, group.expenses)
  const active = group.members.filter((m) => !m.removed)
  const link = `${location.origin}${location.pathname}#/g/${group.id}`

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: group.name, text: `Split expenses for ${group.name} on Splitly`, url: link })
      else { await navigator.clipboard.writeText(link); toast('Link copied') }
    } catch { /* user cancelled */ }
  }

  const exportJson = async () => {
    const json = JSON.stringify({ app: 'splitly', version: 1, group: { ...group, expenses: undefined }, expenses: group.expenses }, null, 2)
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${group.name.replace(/[^\w-]+/g, '-')}-splitly.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch { /* download blocked */ }
    try { await navigator.clipboard.writeText(json); toast('Backup downloaded and copied') } catch { toast('Backup downloaded') }
  }

  const remove = (m) => {
    if (m.id === me) return toast("You can't remove yourself")
    if (b[m.id]) return toast(`${m.name} still ${b[m.id] > 0 ? 'is owed' : 'owes'} ${money(Math.abs(b[m.id]), group.currency)}. Settle up first.`)
    removeMember(group.id, m.id)
    toast(`Removed ${m.name}`)
  }

  const add = () => {
    const n = newName.trim()
    if (!n) return
    if (active.some((m) => m.name.toLowerCase() === n.toLowerCase())) return toast(`${n} is already here`)
    addMember(group.id, n)
    setNewName('')
  }

  return (
    <Sheet open={open} onClose={onClose} title={group.name}>
      <button className="btn primary block press" onClick={share}>
        {isShared() ? 'Share link' : 'Copy link'}
      </button>
      {!isShared() && <p className="fineprint">Sharing isn't set up yet, so this link only works on this device.</p>}

      <div className="label">I am</div>
      <div className="chips">
        {active.map((m) => (
          <Chip key={m.id} on={m.id === me} onClick={() => setMe(group.id, m.id)}>
            <Avatar member={m} size={24} /> {m.name}
          </Chip>
        ))}
      </div>

      <div className="label">People <span className="label-hint">Tap someone to change their emoji and colour</span></div>
      <ul className="member-list">
        {active.map((m) => (
          <li key={m.id} className={editing === m.id ? 'open' : ''}>
            <div className="member-row">
              <button className="member-btn" onClick={() => setEditing(editing === m.id ? null : m.id)} aria-expanded={editing === m.id}>
                <Avatar member={m} size={36} />
                <span className="member-name">{m.name}{m.id === me && <small> (you)</small>}</span>
              </button>
              <span className={`num ${b[m.id] > 0 ? 'pos' : b[m.id] < 0 ? 'neg' : 'muted'}`}>{b[m.id] ? money(b[m.id], group.currency) : 'settled'}</span>
              <button className="icon-btn small" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}>✕</button>
            </div>
            {editing === m.id && (
              <div className="avatar-editor pop">
                <div className="emoji-grid">
                  <button className={`emoji-opt ${!m.emoji ? 'on' : ''}`} onClick={() => updateMember(group.id, m.id, { emoji: null })} aria-label="Use initial">
                    {m.name.charAt(0).toUpperCase()}
                  </button>
                  {EMOJIS.map((e) => (
                    <button key={e} className={`emoji-opt ${m.emoji === e ? 'on' : ''}`} onClick={() => updateMember(group.id, m.id, { emoji: e })}>{e}</button>
                  ))}
                </div>
                <div className="color-row">
                  {AVATAR_COLORS.map((c) => (
                    <button key={c} className={`color-opt ${m.color === c ? 'on' : ''}`} style={{ '--c': c }} aria-label={`Colour ${c}`} onClick={() => updateMember(group.id, m.id, { color: c })} />
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="join">
        <input placeholder="Add a person" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn ghost press" disabled={!newName.trim()} onClick={add}>Add</button>
      </div>

      <div className="label">Group</div>
      <div className="menu-grid">
        <label className="field inline">
          <span>Name</span>
          <input defaultValue={group.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== group.name && updateGroup(group.id, { name: e.target.value.trim() })} />
        </label>
        <label className="field inline">
          <span>Currency</span>
          <select value={group.currency} onChange={(e) => updateGroup(group.id, { currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div className="menu-actions">
        <button className="btn ghost block press" onClick={exportJson}>Export backup</button>
        <button className="btn ghost block press" onClick={() => { forgetGroup(group.id); go('/') }}>Remove from this device</button>
        <button className="btn danger-ghost block press" onClick={() => {
          if (confirm(`Delete "${group.name}" for everyone? This can't be undone.`)) { deleteGroupEverywhere(group.id); go('/') }
        }}>Delete group for everyone</button>
      </div>
    </Sheet>
  )
}
