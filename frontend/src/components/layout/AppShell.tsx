import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, BookOpen, Bell, Bot, ChevronRight, LayoutDashboard, Menu, Mic, Moon, PanelLeftClose, PanelLeftOpen, PlugZap, Search, Settings, Ticket, Users, UsersRound, MessageSquare, Layers, LogOut, FlaskConical, X,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { publish } from '../../lib/bus'
import { api } from '../../lib/api'
import { useSocket } from '../../lib/ws'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'
import type { Role } from '../../types'
import { dur, ease, pageVariants, tx } from '../../lib/motion'
import { Avatar, Dropdown, IconButton, MenuItem, Tooltip, cn } from '../ui'

interface Item { to: string; label: string; icon: ReactNode; roles?: Role[] }
const NAV: { title: string; items: Item[] }[] = [
  { title: 'Workspace', items: [
    { to: '/', label: 'Overview', icon: <LayoutDashboard size={18} strokeWidth={1.9} /> },
    { to: '/inbox', label: 'Inbox', icon: <MessageSquare size={18} strokeWidth={1.9} />, roles: ['owner', 'admin', 'manager', 'agent'] },
    { to: '/voice', label: 'Voice Studio', icon: <Mic size={18} strokeWidth={1.9} />, roles: ['owner', 'admin', 'manager', 'agent'] },
    { to: '/tickets', label: 'Tickets', icon: <Ticket size={18} strokeWidth={1.9} /> },
  ] },
  { title: 'Customers', items: [
    { to: '/customers', label: 'Customers', icon: <Users size={18} strokeWidth={1.9} /> },
    { to: '/segments', label: 'Customer Segments', icon: <Layers size={18} strokeWidth={1.9} /> },
  ] },
  { title: 'AI Platform', items: [
    { to: '/playground', label: 'AI Playground', icon: <FlaskConical size={18} strokeWidth={1.9} />, roles: ['owner', 'admin', 'manager', 'agent'] },
    { to: '/knowledge', label: 'Knowledge Library', icon: <BookOpen size={18} strokeWidth={1.9} /> },
    { to: '/ai-config', label: 'AI Configuration', icon: <Bot size={18} strokeWidth={1.9} /> },
  ] },
  { title: 'Analytics', items: [{ to: '/insights', label: 'Insights Studio', icon: <BarChart3 size={18} strokeWidth={1.9} /> }] },
  { title: 'Administration', items: [
    { to: '/team', label: 'Team', icon: <UsersRound size={18} strokeWidth={1.9} /> },
    { to: '/integrations', label: 'Integrations', icon: <PlugZap size={18} strokeWidth={1.9} />, roles: ['owner', 'admin'] },
    { to: '/settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.9} /> },
  ] },
]
const GO: Record<string, string> = { o: '/', i: '/inbox', v: '/voice', t: '/tickets', c: '/customers', p: '/playground', k: '/knowledge', a: '/insights' }

export function RequireAuth() {
  const token = useAuth((s) => s.token)
  return token ? <AppShell /> : <Navigate to="/login" replace />
}


export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="relative grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent2 to-accent text-on-accent shadow-glow" aria-hidden>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 9v6M8.5 5v14M13 8v8M17.5 3.5v17M21 10v4" /></svg>
    </div>
  )
}

const flat = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))
const readCollapsed = () => { try { return localStorage.getItem('voxera-sidebar') === '1' } catch { return false } }

function AppShell() {
  const { user, org, role, token, logout } = useAuth()
  const { dark, toggleDark, toast, bump, unread, clearUnread } = useUI()
  const [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(readCollapsed)
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => { try { localStorage.setItem('voxera-sidebar', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])

  // Single org-wide realtime socket; pages subscribe through the bus.
  useSocket(token ? `/stream?token=${token}` : null, (e) => {
    publish(e)
    if (e.type === 'escalation.requested') { toast({ title: 'Escalation requested', body: e.payload.reason, tone: 'warn' }); bump() }
    if (e.type === 'ticket.created') { toast({ title: `Ticket ${e.payload.code} created`, tone: 'info' }); bump() }
    if (e.type === 'conversation.created') bump()
  })

  // Keyboard shortcuts: "g" then a letter (g i = Inbox, g v = Voice ...), "/" focuses search.
  useEffect(() => {
    let g = false, t: number
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.metaKey || e.ctrlKey) return
      if (e.key === '/') { e.preventDefault(); (document.querySelector<HTMLInputElement>('[data-search]') ?? document.querySelector<HTMLInputElement>('[data-global-search]'))?.focus(); return }
      if (g && GO[e.key]) nav(GO[e.key])
      g = e.key === 'g'
      clearTimeout(t); if (g) t = window.setTimeout(() => (g = false), 1200)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [nav])

  useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me'), staleTime: 60_000, retry: false })

  const allowed = flat.filter((i) => !i.roles || (role && i.roles.includes(role)))
  const seg = '/' + (loc.pathname.split('/')[1] ?? '')
  const current = allowed.find((i) => i.to === seg) ?? (loc.pathname === '/onboarding' ? { label: 'Getting started', group: 'Workspace' } : undefined)
  const sub = loc.pathname.split('/')[2]

  const sidebar = (compact: boolean) => (
    <nav aria-label="Main" className={cn('glass flex h-full flex-col overflow-hidden border-line transition-[width] duration-slow ease-voxera md:rounded-2xl md:border', compact ? 'w-[72px]' : 'w-64')}>
      <div className={cn('flex items-center gap-3 px-4 pb-3 pt-5', compact && 'justify-center px-0')}>
        <Logo />
        {!compact && <div className="min-w-0"><p className="font-display text-[18px] font-bold leading-none tracking-tight">Voxera</p><p className="eyebrow mt-1.5 truncate !text-[10px]">{org?.name ?? 'Workspace'}</p></div>}
      </div>
      <LayoutGroup id="nav">
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.roles || (role && i.roles.includes(role)))
            if (!items.length) return null
            return (
              <div key={g.title} className="mt-5">
                {!compact ? <p className="eyebrow px-3 pb-1.5 !text-[10px]">{g.title}</p> : <div className="mx-3 mb-2 h-px bg-line" />}
                {items.map((i) => {
                  const link = (
                    <NavLink key={i.to} to={i.to} end={i.to === '/'} aria-label={i.label}
                      className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition duration-fast ease-voxera', compact && 'justify-center px-0 py-2.5', isActive ? 'font-semibold text-accent' : 'text-muted hover:bg-soft hover:text-ink')}>
                      {({ isActive }) => <>
                        {isActive && <motion.span layoutId="nav-active" transition={tx(dur.base)} className="absolute inset-0 rounded-xl bg-accent/10 ring-1 ring-accent/25" />}
                        <span className="relative">{i.icon}</span>{!compact && <span className="relative truncate">{i.label}</span>}
                      </>}
                    </NavLink>
                  )
                  return compact ? <div key={i.to} className="mb-0.5 flex justify-center"><Tooltip label={i.label}>{link}</Tooltip></div> : <div key={i.to} className="mb-0.5">{link}</div>
                })}
              </div>
            )
          })}
        </div>
      </LayoutGroup>
      <div className={cn('border-t border-line p-3', compact && 'flex flex-col items-center gap-2')}>
        <div className={cn('flex items-center gap-2.5 rounded-xl p-2', compact && 'p-0')}>
          <Avatar name={user?.full_name ?? '? ?'} size={34} />
          {!compact && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.full_name}</p><p className="truncate text-[11px] capitalize text-muted">{role}</p></div>}
          {!compact && <IconButton label="Log out" onClick={() => { logout(); nav('/login') }} className="h-8 w-8"><LogOut size={16} /></IconButton>}
        </div>
        {compact && <Tooltip label="Log out"><IconButton label="Log out" onClick={() => { logout(); nav('/login') }}><LogOut size={16} /></IconButton></Tooltip>}
      </div>
    </nav>
  )

  return (
    <div className="ambient relative flex h-screen overflow-hidden bg-bg md:gap-3 md:p-3">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(70%_55%_at_70%_0%,black,transparent)]" aria-hidden />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <div className="relative z-10 hidden md:block">{sidebar(collapsed)}</div>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tx(dur.base)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div className="absolute inset-y-0 left-0" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ duration: dur.page, ease }}>
              {sidebar(false)}
              <IconButton label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-4"><X size={18} /></IconButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col md:gap-3">
        <header className="glass z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 md:rounded-2xl md:border md:px-5">
          <IconButton label="Open menu" className="md:hidden" onClick={() => setOpen(true)}><Menu size={20} /></IconButton>
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden md:inline-grid" onClick={() => setCollapsed((c) => !c)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</IconButton>
          <div className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex" aria-label="Breadcrumb">
            <span className="eyebrow !text-[10.5px]">{current?.group ?? 'Voxera'}</span><ChevronRight size={14} className="text-faint" />
            <span className="truncate font-display font-semibold">{current?.label ?? 'Workspace'}</span>
            {sub && <><ChevronRight size={14} className="text-faint" /><span className="text-muted">Detail</span></>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <PageSearch pages={allowed} />
            <IconButton label={unread ? `Notifications (${unread} new) — click to mark read` : 'Notifications'} onClick={clearUnread}><Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{unread}</span>}</IconButton>
            <IconButton label="Toggle dark mode" onClick={toggleDark}>{dark ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
            <Dropdown trigger={({ toggle }) => <button onClick={toggle} aria-label="Account menu" className="ml-1 rounded-full ring-2 ring-transparent transition hover:ring-accent/20"><Avatar name={user?.full_name ?? '? ?'} size={34} /></button>}>
              {(close) => <>
                <div className="px-3 pb-2 pt-1.5"><p className="truncate text-sm font-semibold">{user?.full_name}</p><p className="truncate text-xs text-muted">{user?.email}</p><p className="mt-1 text-[11px] capitalize text-faint">{role} · {org?.name}</p></div>
                <div className="my-1 h-px bg-line" />
                <MenuItem onClick={() => { nav('/settings'); close() }}><Settings size={16} className="text-muted" />Settings</MenuItem>
                <MenuItem onClick={() => { toggleDark(); close() }}>{dark ? <Sun size={16} className="text-muted" /> : <Moon size={16} className="text-muted" />}{dark ? 'Light theme' : 'Dark theme'}</MenuItem>
                <MenuItem className="text-danger" onClick={() => { logout(); nav('/login') }}><LogOut size={16} />Log out</MenuItem>
              </>}
            </Dropdown>
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto md:rounded-2xl">
          <motion.div key={seg} variants={pageVariants} initial="initial" animate="animate" className="h-full"><Outlet /></motion.div>
        </main>
      </div>
      <Toasts />
    </div>
  )
}

/** Jump-to-page search over the pages this role can open (real navigation, no fake results). */
function PageSearch({ pages }: { pages: { to: string; label: string; icon: ReactNode }[] }) {
  const [q, setQ] = useState(''), [focus, setFocus] = useState(false), nav = useNavigate()
  const hits = q.trim() ? pages.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())) : []
  const go = (to: string) => { nav(to); setQ(''); (document.activeElement as HTMLElement)?.blur() }
  return (
    <div className="relative hidden lg:block">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input data-global-search value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].to); if (e.key === 'Escape') setQ('') }}
        placeholder="Jump to page…" aria-label="Jump to page" className="w-60 rounded-xl border border-line bg-white/[0.03] py-2 pl-9 pr-8 text-sm transition focus:w-72 focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10" />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 text-[10px] text-faint">/</kbd>
      <AnimatePresence>{focus && q.trim() && (
        <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tx(dur.micro)} className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {hits.length ? hits.map((h) => <li key={h.to}><button onMouseDown={() => go(h.to)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-soft"><span className="text-muted">{h.icon}</span>{h.label}</button></li>) : <li className="px-3 py-2 text-sm text-muted">No matching page</li>}
        </motion.ul>)}</AnimatePresence>
    </div>
  )
}

const toastTone: Record<string, string> = { warn: 'bg-warn', error: 'bg-danger', success: 'bg-mint', info: 'bg-accent' }
function Toasts() {
  const { toasts, dismiss } = useUI()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={tx(dur.base)}
            onClick={() => dismiss(t.id)} className="pointer-events-auto flex cursor-pointer gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 shadow-pop">
            <span className={cn('mt-0.5 h-8 w-1 shrink-0 rounded-full', toastTone[t.tone ?? 'info'])} />
            <div className="min-w-0"><p className="text-sm font-semibold">{t.title}</p>{t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
