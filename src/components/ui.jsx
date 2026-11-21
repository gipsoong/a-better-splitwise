import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

// ---------- Bottom sheet ----------
// Slides up over a fading backdrop. Closes on backdrop tap, ✕, or Esc.
export function Sheet({ open, onClose, title, children, footer }) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false) }
    else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => { setMounted(false); setClosing(false) }, 200)
      return () => clearTimeout(t)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('locked')
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('locked') }
  }, [open, onClose])

  if (!mounted) return null
  return (
    <div className={`sheet-wrap ${closing ? 'closing' : ''}`}>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div className="grabber" />
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ---------- Toasts ----------
let toasts = []
const tl = new Set()
const emit = () => tl.forEach((l) => l())
export function toast(text, { action, onAction, ms = 5000 } = {}) {
  const id = Math.random().toString(36).slice(2)
  toasts = [{ id, text, action, onAction }] // one at a time keeps it calm
  emit()
  setTimeout(() => dismiss(id), ms)
}
function dismiss(id) { toasts = toasts.filter((t) => t.id !== id); emit() }

export function Toasts() {
  const list = useSyncExternalStore((l) => { tl.add(l); return () => tl.delete(l) }, () => toasts)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.onAction(); dismiss(t.id) }}>{t.action}</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- Small pieces ----------
export function Chip({ on, onClick, children, ...rest }) {
  return <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={!!on} onClick={onClick} {...rest}>{children}</button>
}

export function Segmented({ value, onChange, options }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="seg" role="tablist" style={{ '--n': options.length, '--i': i }}>
      <div className="seg-pill" />
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} disabled={o.disabled}
          className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

// A member's avatar: their emoji (or initial) on their colour.
export function Avatar({ member, name, size = 32, ring = false }) {
  const label = member?.name || name || '?'
  const color = member?.color || hashColor(label)
  return (
    <span className={`avatar ${ring ? 'ring' : ''}`} style={{ width: size, height: size, fontSize: member?.emoji ? size * 0.55 : size * 0.42, '--c': color }} title={label}>
      {member?.emoji || label.trim().charAt(0).toUpperCase()}
    </span>
  )
}
const hashColor = (s) => `hsl(${([...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360} 55% 45%)`

export function AvatarStack({ members, size = 26, max = 5 }) {
  const shown = members.slice(0, max)
  return (
    <span className="avatar-stack">
      {shown.map((m) => <Avatar key={m.id} member={m} size={size} ring />)}
      {members.length > max && <span className="avatar more" style={{ width: size, height: size, fontSize: size * 0.4 }}>+{members.length - max}</span>}
    </span>
  )
}

// Category tile for an expense or group.
export function Tile({ icon, hue, size = 42 }) {
  return <span className="tile" style={{ width: size, height: size, fontSize: size * 0.5, '--h': hue }}>{icon}</span>
}

// Number that counts smoothly to its new value.
export function useTween(value, ms = 320) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    if (a === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return }
    let raf
    const step = (t) => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = Math.round(a + (value - a) * e)
      setShown(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}
