// Turn history entries into readable lines. Pure functions, so they're easy to test.

const MODE_LABEL = { equal: 'equally', amounts: 'by amounts', percent: 'by %', shares: 'by shares' }

// What changed between two versions of an expense. Returns short human strings.
export function diffExpense(before, after, { name, money }) {
  if (!before || !after) return []
  const out = []
  if (before.description !== after.description) out.push(`Name: “${before.description}” → “${after.description}”`)
  if (before.amount !== after.amount) out.push(`Amount: ${money(before.amount)} → ${money(after.amount)}`)
  if (before.paidBy !== after.paidBy) out.push(`Paid by: ${name(before.paidBy)} → ${name(after.paidBy)}`)
  const bm = before.split?.mode
  const am = after.split?.mode
  if (bm && am && bm !== am) out.push(`Split: ${MODE_LABEL[bm]} → ${MODE_LABEL[am]}`)
  const ids = [...new Set([...Object.keys(before.shares || {}), ...Object.keys(after.shares || {})])]
  const shareChanges = ids
    .filter((id) => (before.shares?.[id] || 0) !== (after.shares?.[id] || 0))
    .map((id) => `${name(id)} ${money(before.shares?.[id] || 0)} → ${money(after.shares?.[id] || 0)}`)
  // Amount changes move every share; only list shares when the total stayed the same or there are few.
  if (shareChanges.length && (before.amount === after.amount || shareChanges.length <= 2)) out.push(`Shares: ${shareChanges.join(', ')}`)
  else if (shareChanges.length && !out.some((l) => l.startsWith('Amount'))) out.push('Shares changed')
  return out
}

// One activity-feed line for an event.
export function describe(ev, { name, money }) {
  const who = ev.actor ? name(ev.actor) : 'Someone'
  const exp = ev.after || ev.before
  const isPayment = exp?.kind === 'payment'
  const title = exp?.description || 'an expense'
  switch (ev.action) {
    case 'added':
      if (isPayment) {
        const to = Object.keys(exp.shares || {})[0]
        return { icon: '💸', text: `${who} recorded ${name(exp.paidBy)} paying ${name(to)} ${money(exp.amount)}` }
      }
      return { icon: '＋', text: `${who} added ${title}`, sub: `${money(exp.amount)} paid by ${name(exp.paidBy)}` }
    case 'edited':
      return { icon: '✎', text: `${who} edited ${title}`, details: diffExpense(ev.before, ev.after, { name, money }) }
    case 'deleted':
      return { icon: '🗑', text: `${who} deleted ${isPayment ? 'a payment' : title}`, sub: exp ? money(exp.amount) : undefined }
    case 'restored':
      return { icon: '↩', text: `${who} restored ${isPayment ? 'a payment' : title}` }
    case 'member_added':
      return { icon: '👋', text: ev.actor === ev.memberId ? `${ev.name} joined` : `${who} added ${ev.name}` }
    case 'member_removed':
      return { icon: '👋', text: `${who} removed ${name(ev.memberId)}` }
    case 'member_updated':
      return { icon: '🎨', text: ev.actor === ev.memberId ? `${who} changed ${who === 'You' ? 'your' : 'their'} avatar` : `${who} changed ${name(ev.memberId) === 'You' ? 'your' : `${name(ev.memberId)}'s`} avatar` }
    case 'group_updated': {
      const parts = []
      if (ev.after?.name) parts.push(`renamed the group to “${ev.after.name}”`)
      if (ev.after?.currency) parts.push(`changed the currency to ${ev.after.currency}`)
      return { icon: '⚙', text: `${who} ${parts.join(' and ') || 'updated the group'}` }
    }
    case 'group_created':
      return { icon: '✨', text: `${who} created the group` }
    default:
      return { icon: '•', text: `${who} made a change` }
  }
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
