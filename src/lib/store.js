// The one place that reads and writes data.
//
// Every change is an "op". It is applied to local state immediately (instant UI), saved to
// localStorage (works offline, survives reloads) and, when Supabase is configured, queued and
// sent to the server in order. When a fresh copy comes back from the server, still-pending ops
// are re-applied on top so nothing typed offline is lost.

import { useSyncExternalStore } from 'react'
import { remote } from './remote.js'

const KEY = 'splitly.v1'
const empty = () => ({ groups: {}, order: [], me: {}, prefs: {}, queue: [] })

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...JSON.parse(raw) }
  } catch { /* storage unavailable: fall back to memory */ }
  return empty()
}

let state = load()
const listeners = new Set()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* memory only */ }
}

function set(next) {
  state = next
  persist()
  for (const l of listeners) l()
}

export function subscribe(l) { listeners.add(l); return () => listeners.delete(l) }
export function getState() { return state }
export function useStore(selector) { return useSyncExternalStore(subscribe, () => selector(state)) }

// ---------- pure reducer ----------

export function applyOp(groups, op) {
  const g = groups[op.gid]
  switch (op.t) {
    case 'createGroup':
      return groups[op.gid] ? groups : { ...groups, [op.gid]: { ...op.group, expenses: op.expenses || [] } }
    case 'deleteGroup': {
      const { [op.gid]: _, ...rest } = groups
      return rest
    }
  }
  if (!g) return groups
  let next = g
  switch (op.t) {
    case 'updateGroup':
      next = { ...g, ...op.patch }
      break
    case 'addMember':
      if (g.members.some((m) => m.id === op.member.id)) return groups
      next = { ...g, members: [...g.members, op.member] }
      break
    case 'removeMember':
      next = { ...g, members: g.members.map((m) => (m.id === op.mid ? { ...m, removed: true } : m)) }
      break
    case 'upsertExpense': {
      const i = g.expenses.findIndex((e) => e.id === op.expense.id)
      const expenses = i < 0 ? [...g.expenses, op.expense] : g.expenses.map((e, k) => (k === i ? op.expense : e))
      next = { ...g, expenses }
      break
    }
    case 'deleteExpense':
      next = { ...g, expenses: g.expenses.filter((e) => e.id !== op.id) }
      break
    default:
      return groups
  }
  return { ...groups, [op.gid]: next }
}

// ---------- actions ----------

function dispatch(op) {
  const queue = remote.enabled ? [...state.queue, op] : state.queue
  set({ ...state, groups: applyOp(state.groups, op), queue })
  flush()
}

export const uid = () => crypto.randomUUID()

// 128 bits of randomness, URL-safe. This is the group's share secret.
export function newGroupId() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createGroup({ name, currency, memberNames, meIndex = 0, expenses = [] }) {
  const gid = newGroupId()
  const members = memberNames.map((n) => ({ id: uid(), name: n }))
  const group = { id: gid, name, currency, members, createdAt: new Date().toISOString() }
  set({ ...state, order: [gid, ...state.order.filter((x) => x !== gid)], me: meIndex == null ? state.me : { ...state.me, [gid]: members[meIndex]?.id } })
  dispatch({ t: 'createGroup', gid, group })
  for (const e of expenses) dispatch({ t: 'upsertExpense', gid, expense: e })
  return gid
}

export function importGroup(data) {
  const src = data.group || data
  const gid = newGroupId()
  const group = { id: gid, name: src.name || 'Imported group', currency: src.currency || 'SGD', members: src.members || [], createdAt: new Date().toISOString() }
  set({ ...state, order: [gid, ...state.order] })
  dispatch({ t: 'createGroup', gid, group })
  for (const e of data.expenses || src.expenses || []) dispatch({ t: 'upsertExpense', gid, expense: e })
  return gid
}

export const updateGroup = (gid, patch) => dispatch({ t: 'updateGroup', gid, patch })
export const addMember = (gid, name) => {
  const member = { id: uid(), name }
  dispatch({ t: 'addMember', gid, member })
  return member.id
}
export const removeMember = (gid, mid) => dispatch({ t: 'removeMember', gid, mid })
export const saveExpense = (gid, expense) => dispatch({ t: 'upsertExpense', gid, expense })
export const deleteExpense = (gid, id) => dispatch({ t: 'deleteExpense', gid, id })

export function deleteGroupEverywhere(gid) {
  set({ ...state, order: state.order.filter((x) => x !== gid) })
  dispatch({ t: 'deleteGroup', gid })
}

// Remove from this device only. Anyone with the link still has it.
export function forgetGroup(gid) {
  const { [gid]: _, ...groups } = state.groups
  set({ ...state, groups, order: state.order.filter((x) => x !== gid), queue: state.queue.filter((o) => o.gid !== gid) })
}

export function setMe(gid, mid) { set({ ...state, me: { ...state.me, [gid]: mid } }) }

// Remember payer + split per group so the next expense starts where the last one left off.
export function setPrefs(gid, prefs) { set({ ...state, prefs: { ...state.prefs, [gid]: prefs } }) }

// ---------- sync ----------

let flushing = false
let retryTimer = null

export async function flush() {
  if (!remote.enabled || flushing) return
  flushing = true
  const touched = new Set()
  try {
    while (state.queue.length) {
      const op = state.queue[0]
      const res = await remote.send(op)
      if (res === 'retry') { scheduleRetry(); break }
      // 'ok' or 'drop' (server rejected it permanently): move on either way.
      set({ ...state, queue: state.queue.slice(1) })
      touched.add(op.gid)
    }
  } finally {
    flushing = false
  }
  for (const gid of touched) remote.notify(gid)
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(flush, 5000)
}

// Fetch the latest copy of a group. Returns 'ok', 'missing' or 'offline'.
export async function refresh(gid) {
  if (!remote.enabled) return state.groups[gid] ? 'ok' : 'missing'
  const data = await remote.fetchGroup(gid)
  if (data === 'offline') return 'offline'
  const pending = state.queue.filter((o) => o.gid === gid)
  if (!data) {
    // Not on the server. If we're still uploading it, keep the local copy.
    if (pending.some((o) => o.t === 'createGroup')) return 'ok'
    if (state.groups[gid]) {
      const { [gid]: _, ...groups } = state.groups
      set({ ...state, groups })
    }
    return 'missing'
  }
  let groups = { ...state.groups, [gid]: { ...data.group, expenses: data.expenses } }
  for (const op of pending) groups = applyOp(groups, op)
  const order = state.order.includes(gid) ? state.order : [gid, ...state.order]
  set({ ...state, groups, order })
  return 'ok'
}

// Live updates while a group is open.
export function watch(gid) {
  let t = null
  const onChange = () => { clearTimeout(t); t = setTimeout(() => refresh(gid), 250) }
  const onVisible = () => { if (document.visibilityState === 'visible') { flush(); onChange() } }
  document.addEventListener('visibilitychange', onVisible)
  const stop = remote.listen(gid, onChange)
  return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisible); stop() }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flush)
  flush()
}

export const isShared = () => remote.enabled
