import { clsx } from 'clsx'
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'framer-motion'
import { Check, Search, X } from 'lucide-react'
import {
  forwardRef, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { dur, ease, pageVariants, popIn, riseIn, stagger, tx } from '../lib/motion'
import type { Conv } from '../types'

export const cn = clsx

/* ───────── Page + section scaffolding ───────── */
export const Page = ({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) => (
  <motion.div variants={stagger} initial="initial" animate="animate" className={cn('mx-auto p-4 md:p-8', wide ? 'max-w-[88rem]' : 'max-w-7xl', className)}>{children}</motion.div>
)
export const Rise = ({ children, className }: { children: ReactNode; className?: string }) => <motion.div variants={riseIn} className={className}>{children}</motion.div>
export { pageVariants }

export const PageHeader = ({ title, sub, actions, eyebrow }: { title: string; sub?: string; actions?: ReactNode; eyebrow?: string }) => {
  const words = title.split(' '), last = words.pop()
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow mb-3 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent))]" />{eyebrow ?? 'Voxera'}</p>
        <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-tight md:text-[42px]">{words.length ? words.join(' ') + ' ' : ''}<span className="text-gradient">{last}</span></h1>
        {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
export const SectionHeader = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <div><h2 className="font-display text-base font-semibold">{title}</h2>{sub && <p className="text-xs text-muted">{sub}</p>}</div>{actions}
  </div>
)

/* ───────── Buttons ───────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'mint'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent font-semibold shadow-sm hover:brightness-110 hover:shadow-glow',
  secondary: 'bg-white/[0.03] text-ink border border-line hover:bg-white/[0.07] hover:border-faint/50',
  ghost: 'text-muted hover:bg-soft hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-110',
  mint: 'bg-mint text-on-accent shadow-sm hover:brightness-110',
}
export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return <button {...p} className={cn('inline-flex select-none items-center justify-center gap-1.5 rounded-xl font-medium transition duration-fast ease-voxera active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50', size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm', variants[variant], className)} />
}
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(({ label, className, children, ...p }, ref) => (
  <button ref={ref} aria-label={label} title={label} {...p} className={cn('relative inline-grid h-9 w-9 place-items-center rounded-xl text-muted transition duration-fast ease-voxera hover:bg-soft hover:text-ink active:scale-95 disabled:opacity-50', className)}>{children}</button>
))

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('rounded-2xl border border-line bg-surface/80 shadow-card backdrop-blur-sm', className)}>{children}</div>
)

/* ───────── Badges / status ───────── */
const tones = {
  indigo: 'bg-accent/10 text-accent', mint: 'bg-mint/12 text-mint', amber: 'bg-warn/15 text-warn',
  rose: 'bg-danger/10 text-danger', slate: 'bg-soft text-muted',
}
export type Tone = keyof typeof tones
export const Badge = ({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>
)
const dotTone: Record<string, string> = { mint: 'bg-mint', amber: 'bg-warn', rose: 'bg-danger', indigo: 'bg-accent', slate: 'bg-faint' }
export const StatusDot = ({ tone = 'mint', pulse, label }: { tone?: Tone; pulse?: boolean; label?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="relative grid h-2 w-2 place-items-center">
    {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dotTone[tone])} />}<span className={cn('relative h-2 w-2 rounded-full', dotTone[tone])} /></span>{label}</span>
)
export function ConvBadge({ c }: { c: Pick<Conv, 'status' | 'handler'> }) {
  if (c.status === 'resolved') return <Badge tone="mint">Resolved</Badge>
  if (c.status === 'escalated') return <Badge tone="rose">Escalated</Badge>
  if (c.handler === 'human') return <Badge tone="amber">Human</Badge>
  return <Badge tone="indigo">AI handling</Badge>
}
export const priorityTone = (p: string): Tone => ({ urgent: 'rose', high: 'amber', medium: 'indigo', low: 'slate' } as Record<string, Tone>)[p] ?? 'slate'

export const Avatar = ({ name, size = 36, tone = 'indigo' }: { name: string; size?: number; tone?: 'indigo' | 'mint' }) => (
  <div style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden
    className={cn('grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-inset', tone === 'indigo' ? 'bg-gradient-to-br from-accent/25 to-accent2/10 text-accent ring-accent/25' : 'bg-mint/15 text-mint ring-mint/20')}>
    {name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()}
  </div>
)

/* ───────── Form controls ───────── */
const field = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink transition duration-fast ease-voxera placeholder:text-faint hover:border-faint/50 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10'
// forwardRef so react-hook-form's register() ref reaches the DOM node (default values, focus-on-error)
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cn(field, className)} />)
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} {...p} className={cn(field, 'resize-none', className)} />)
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} {...p} className={cn(field, 'appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239AA0AE' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", ...p.style }} />
))
export const Label = ({ children }: { children: ReactNode }) => <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>
export const FieldError = ({ msg }: { msg?: string }) => (msg ? <p role="alert" className="mt-1 text-xs text-danger">{msg}</p> : null)
export const SearchInput = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" /><input type="search" {...p} className={cn(field, 'pl-9', className)} /></div>
)
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition duration-base ease-voxera', checked ? 'bg-accent' : 'bg-line')}>
      <motion.span layout transition={tx(dur.micro)} className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'left-[22px]' : 'left-0.5')} /></button>
  )
}

/* ───────── Loading / empty / error ───────── */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton rounded-xl', className)} />
export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2 p-3" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
)
export const Empty = ({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    {icon && <div className="grid h-12 w-12 place-items-center rounded-2xl bg-tint text-accent">{icon}</div>}
    <p className="font-semibold">{title}</p>
    {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
    {action}
  </div>
)
export const ErrorNote = ({ error }: { error: unknown }) => (
  <div role="alert" className="m-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{(error as Error)?.message ?? 'Something went wrong'}</div>
)

/* ───────── Overlays ───────── */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tx(dur.base)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div variants={popIn} initial="initial" animate="animate" exit="exit" role="dialog" aria-modal="true" aria-label={title}
            className={cn('max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-line bg-surface p-6 shadow-pop sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose} className="-mr-2 h-8 w-8"><X size={17} /></IconButton></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {body && <p className="mb-5 text-sm text-muted">{body}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button></div>
    </Modal>
  )
}
export function Tooltip({ label, children, side = 'right' }: { label: string; children: ReactNode; side?: 'right' | 'bottom' }) {
  const id = useId()
  return (
    <span className="group relative inline-flex" aria-describedby={id}>{children}
      <span id={id} role="tooltip" className={cn('pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-bg opacity-0 shadow-pop transition duration-fast group-hover:opacity-100 group-focus-within:opacity-100', side === 'right' ? 'left-full top-1/2 ml-3 -translate-y-1/2' : 'left-1/2 top-full mt-2 -translate-x-1/2')}>{label}</span>
    </span>
  )
}
/** Click-away dropdown shell: render-prop trigger + animated panel. */
export function Dropdown({ trigger, children, align = 'right', className }: { trigger: (o: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} className="relative">{trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>{open && (
        <motion.div variants={popIn} initial="initial" animate="animate" exit="exit" className={cn('absolute z-50 mt-2 min-w-56 origin-top rounded-xl border border-line bg-surface p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0', className)}>{children(() => setOpen(false))}</motion.div>
      )}</AnimatePresence>
    </div>
  )
}
export const MenuItem = ({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition duration-fast hover:bg-soft', className)} />
)

/* ───────── Tabs (animated underline) ───────── */
export function Tabs<T extends string>({ tabs, value, onChange, id = 'tabs' }: { tabs: readonly (readonly [T, string])[] | { key: T; label: string }[]; value: T; onChange: (v: T) => void; id?: string }) {
  const items = (tabs as any[]).map((t) => (Array.isArray(t) ? { key: t[0] as T, label: t[1] as string } : (t as { key: T; label: string })))
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} className={cn('relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition duration-fast', value === t.key ? 'text-accent' : 'text-muted hover:text-ink')}>
          {t.label}{value === t.key && <motion.span layoutId={`${id}-ul`} transition={tx(dur.base)} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}</button>
      ))}
    </div>
  )
}

/* ───────── Metrics ───────── */
/** Counts up to numeric values (also "78%" / "₹1,200"); anything non-numeric renders as-is. */
export function AnimatedCounter({ value }: { value: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null), inView = useInView(ref, { once: true }), reduce = useReducedMotion()
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null
  const [shown, setShown] = useState<string | null>(null)
  const prev = useRef(0)
  useEffect(() => {
    const m = raw?.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/)
    if (!m || !inView || reduce) { setShown(null); return }
    const [, pre, num, post] = m, to = parseFloat(num), dec = num.includes('.') ? num.split('.')[1].length : 0
    const c = animate(prev.current, to, { duration: 0.8, ease, onUpdate: (v) => setShown(`${pre}${v.toFixed(dec)}${post}`), onComplete: () => { prev.current = to; setShown(null) } })
    return () => c.stop()
  }, [raw, inView, reduce])
  return <span ref={ref}>{shown ?? raw ?? value}</span>
}
export const Stat = ({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: string; tone?: 'mint' | 'indigo'; icon?: ReactNode }) => (
  <motion.div variants={riseIn} whileHover={{ y: -3 }} transition={tx(dur.micro)} className="group relative overflow-hidden rounded-2xl border border-line bg-surface/80 p-5 shadow-card transition-colors duration-base hover:border-accent/40">
    <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-slow group-hover:opacity-100" />
    <div className="relative flex items-center justify-between"><p className="eyebrow !text-[10.5px]">{label}</p>{icon && <span className={cn('grid h-8 w-8 place-items-center rounded-lg border', tone === 'mint' ? 'border-mint/25 bg-mint/10 text-mint' : 'border-accent/25 bg-accent/10 text-accent')}>{icon}</span>}</div>
    <p className={cn('relative mt-3 font-display text-4xl font-bold tracking-tight', tone === 'mint' && 'text-mint', tone === 'indigo' && 'text-gradient')}><AnimatedCounter value={value} /></p>
    {hint && <p className="relative mt-1.5 text-xs text-muted">{hint}</p>}
  </motion.div>
)
export const Check2 = Check

export const Typing = () => (
  <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-soft px-3.5 py-3" aria-label="Typing">
    {[0, 1, 2].map((i) => <span key={i} className="dot h-1.5 w-1.5 rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />)}
  </div>
)

/** Responsive table wrapper: horizontal scroll on small screens, shared header style. */
export const TableWrap = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('overflow-x-auto', className)}>{children}</div>
export { ease, dur, stagger, riseIn }
