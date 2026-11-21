// Supabase transport. If the env vars are missing, the app runs local-only on this device.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

// Postgres error codes are 5 characters (e.g. "P0002"). Anything else is a network problem worth retrying.
const isServerError = (error) => typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)

async function rpc(fn, args) {
  try {
    const { data, error } = await client.rpc(fn, args)
    if (!error) return { ok: true, data }
    return { ok: false, permanent: isServerError(error), error }
  } catch (error) {
    return { ok: false, permanent: false, error }
  }
}

function call(op) {
  switch (op.t) {
    case 'createGroup': {
      const g = op.group
      return rpc('create_group', { p_id: g.id, p_name: g.name, p_currency: g.currency, p_members: g.members, p_created_at: g.createdAt })
    }
    case 'updateGroup':
      return rpc('update_group', { p_id: op.gid, p_name: op.patch.name ?? null, p_currency: op.patch.currency ?? null })
    case 'addMember':
      return rpc('add_member', { p_id: op.gid, p_member: op.member })
    case 'removeMember':
      return rpc('remove_member', { p_id: op.gid, p_member_id: op.mid })
    case 'upsertExpense':
      return rpc('upsert_expense', { p_group: op.gid, p_expense: op.expense })
    case 'deleteExpense':
      return rpc('delete_expense', { p_group: op.gid, p_id: op.id })
    case 'deleteGroup':
      return rpc('delete_group', { p_id: op.gid })
    default:
      return Promise.resolve({ ok: true })
  }
}

const channels = new Map()
function channel(gid) {
  if (!channels.has(gid)) {
    const ch = client.channel(`splitly:${gid}`, { config: { broadcast: { self: false } } })
    channels.set(gid, { ch, handlers: new Set(), ready: false })
    const entry = channels.get(gid)
    ch.on('broadcast', { event: 'changed' }, () => entry.handlers.forEach((h) => h()))
    ch.subscribe((status) => { entry.ready = status === 'SUBSCRIBED' })
  }
  return channels.get(gid)
}

export const remote = {
  enabled: !!client,

  // Returns 'ok', 'drop' (server said no, don't retry) or 'retry'.
  async send(op) {
    const r = await call(op)
    if (r.ok) return 'ok'
    console.warn('[splitly] sync', op.t, r.error)
    return r.permanent ? 'drop' : 'retry'
  },

  // Returns { group, expenses }, null when the group doesn't exist, or 'offline'.
  async fetchGroup(gid) {
    const r = await rpc('get_group', { p_id: gid })
    if (!r.ok) return 'offline'
    return r.data || null
  },

  listen(gid, handler) {
    if (!client) return () => {}
    const entry = channel(gid)
    entry.handlers.add(handler)
    return () => {
      entry.handlers.delete(handler)
      if (!entry.handlers.size) { client.removeChannel(entry.ch); channels.delete(gid) }
    }
  },

  // Tell other people viewing this group to refetch.
  notify(gid) {
    if (!client) return
    const entry = channels.get(gid)
    if (entry?.ready) entry.ch.send({ type: 'broadcast', event: 'changed', payload: {} })
  },
}
