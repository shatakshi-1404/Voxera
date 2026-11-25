import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, ChevronRight, Headphones, MessageSquare, Mic, Paperclip, Search, Send, Sparkles, StickyNote, Ticket as TicketIcon, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card, ConvBadge, Empty, ErrorNote, ListSkeleton, Select, Skeleton, Textarea, Typing, cn } from '../../components/ui'
import { api } from '../../lib/api'
import { useBus } from '../../lib/bus'
import { fmtTime, money, qs, timeAgo, useDebounced } from '../../lib/utils'
import { msgIn } from '../../lib/motion'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'
import type { Conv, ConvDetail, Customer, Member, Msg, Order } from '../../types'

const TABS = [['all', 'All'], ['open', 'Open'], ['escalated', 'Escalated'], ['waiting', 'Waiting'], ['resolved', 'Resolved']] as const

export default function Inbox() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [typing, setTyping] = useState<string | null>(null)
  const typingTimer = useRef<number>()

  const list = useQuery({ queryKey: ['convs', tab, dq], queryFn: () => api<{ items: Conv[]; counts: Record<string, number> }>(`/conversations${qs({ status: tab === 'all' ? '' : tab, q: dq })}`) })

  useBus((e) => {
    if (e.type === 'agent.typing' && e.conversation_id === id) {
      setTyping(e.payload.who); clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => setTyping(null), 4000)
      return
    }
    if (e.type !== 'agent.typing') {
      qc.invalidateQueries({ queryKey: ['convs'] })
      if (e.conversation_id && e.conversation_id === id) { setTyping(null); qc.invalidateQueries({ queryKey: ['conv', id] }) }
    }
  })

  const counts = list.data?.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className="flex h-full">
      <section className={cn('flex w-full flex-col border-r border-line bg-surface md:w-80 lg:w-[22rem]', id && 'hidden md:flex')}>
        <div className="space-y-3 border-b border-line p-3">
          <div className="flex items-center justify-between"><h1 className="font-display text-lg font-bold">Inbox</h1>
            <div className="flex gap-3 text-xs text-muted"><span><b className="text-ink">{counts.open ?? 0}</b> open</span><span><b className="text-rose-600">{counts.escalated ?? 0}</b> escalated</span></div></div>
          <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input data-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations  ( / )" aria-label="Search conversations"
              className="w-full rounded-xl border border-line bg-soft/60 py-2.5 pl-9 pr-3 text-sm transition placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10" /></div>
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition duration-fast', tab === k ? 'bg-accent text-on-accent shadow-sm' : 'bg-soft text-muted hover:text-ink')}>
                {label}{k === 'all' ? ` ${total}` : counts[k] ? ` ${counts[k]}` : ''}</button>))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorNote error={list.error} /> : !list.data?.items.length ? <Empty icon={<MessageSquare />} title="No conversations" hint="Customer chats and calls will appear here in real time." /> : (
            <ul>{list.data.items.map((c) => (
              <li key={c.id}><Link to={`/inbox/${c.id}`} className={cn('relative flex gap-3 border-b border-line/60 px-4 py-3.5 transition duration-fast hover:bg-soft/70', c.id === id && 'bg-tint/60 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent')}>
                <Avatar name={c.customer?.name ?? '? ?'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{c.customer?.name ?? 'Anonymous visitor'}</p><span className="text-[11px] text-muted">{timeAgo(c.last_message_at)}</span></div>
                  <p className="truncate text-xs text-muted">{c.preview ?? c.subject ?? '…'}</p>
                  <div className="mt-1.5 flex items-center gap-1.5"><ConvBadge c={c} />{c.channel === 'voice' && <Badge tone="slate"><Mic size={10} />Voice</Badge>}{c.sentiment === 'angry' && <Badge tone="rose">Angry</Badge>}</div>
                </div></Link></li>))}</ul>
          )}
        </div>
      </section>
      {id ? <Thread key={id} id={id} typing={typing} /> : <div className="hidden flex-1 md:grid md:place-items-center"><Empty icon={<MessageSquare />} title="Select a conversation" hint="Choose one from the list to see the full thread and customer context." /></div>}
    </div>
  )
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === 'system') return <p className="my-2 text-center text-xs text-muted">{m.content}</p>
  const mine = m.role === 'agent', cust = m.role === 'customer', note = m.role === 'note'
  return (
    <motion.div variants={msgIn} initial="initial" animate="animate" className={cn('flex flex-col', cust ? 'items-start' : 'items-end')}>
      <div className={cn('max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed', cust && 'rounded-bl-md border border-line bg-surface shadow-card', m.role === 'ai' && 'rounded-br-md bg-tint text-ink', mine && 'rounded-br-md bg-accent text-on-accent shadow-glow', note && 'border border-dashed border-warn/60 bg-warn/10 text-ink')}>
        {note && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase"><StickyNote size={10} />Internal note</p>}
        {m.content}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {m.role === 'ai' && <span className="inline-flex items-center gap-1 text-accent"><Sparkles size={10} />Voxera AI</span>}{mine && 'You'}
        <span>{fmtTime(m.created_at)}</span>
        {m.role === 'ai' && m.meta?.intent && <Badge>{m.meta.intent.replace('_', ' ')}</Badge>}
        {m.role === 'ai' && m.meta?.tools?.map((t, i) => <Badge key={i} tone="mint">{t.tool}</Badge>)}
        {m.role === 'ai' && m.meta?.citations?.slice(0, 2).map((c, i) => <Badge key={i} tone="indigo">📄 {c.title}</Badge>)}
        {m.role === 'ai' && m.meta?.latency_ms ? <span>{m.meta.latency_ms} ms</span> : null}
      </div>
    </motion.div>
  )
}

function Thread({ id, typing }: { id: string; typing: string | null }) {
  const qc = useQueryClient(), nav = useNavigate(), toast = useUI((s) => s.toast), role = useAuth((s) => s.role)
  const canAct = role !== 'analyst'
  const detail = useQuery({ queryKey: ['conv', id], queryFn: () => api<ConvDetail>(`/conversations/${id}`) })
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('/team'), staleTime: 60_000 })
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'agent' | 'note' | 'customer'>('agent')
  const bottom = useRef<HTMLDivElement>(null)
  const c = detail.data

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [c?.messages.length, typing])

  const refresh = () => { qc.invalidateQueries({ queryKey: ['conv', id] }); qc.invalidateQueries({ queryKey: ['convs'] }) }
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/conversations/${id}${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: refresh, onError: (e: Error) => toast({ title: 'Action failed', body: e.message, tone: 'error' }),
  })
  const send = useMutation({
    mutationFn: (b: { content: string; sender: string }) => api(`/conversations/${id}/messages`, { body: b }),
    onSuccess: () => { setText(''); refresh() }, onError: (e: Error) => toast({ title: 'Could not send', body: e.message, tone: 'error' }),
  })
  const submit = () => text.trim() && send.mutate({ content: text.trim(), sender: mode })

  if (detail.isLoading) return <div className="flex-1 p-6"><Skeleton className="h-full" /></div>
  if (detail.error || !c) return <div className="flex-1"><ErrorNote error={detail.error} /></div>

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-3.5">
          <button className="rounded p-1 text-muted hover:bg-soft md:hidden" onClick={() => nav('/inbox')} aria-label="Back"><ArrowLeft size={18} /></button>
          <Avatar name={c.customer?.name ?? '? ?'} size={34} />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.customer?.name ?? 'Anonymous visitor'}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted"><ConvBadge c={c} />{c.verified ? <Badge tone="mint"><CheckCircle2 size={10} />Verified</Badge> : <Badge tone="amber">Unverified</Badge>}<span className="uppercase">{c.language}</span></div></div>
          {canAct && <div className="flex flex-wrap items-center gap-1.5">
            <Select aria-label="Assign" className="!w-36 !py-1.5 text-xs" value={c.assigned_to ?? ''} onChange={(e) => act.mutate({ path: '/assign', body: { user_id: e.target.value || null } })}>
              <option value="">Unassigned</option>{team.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</Select>
            {c.handler === 'ai' ? <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: '/takeover' })}><Headphones size={14} />Take over</Button>
              : <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: '/release' })}><Bot size={14} />Hand back to AI</Button>}
            <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: '/tickets', body: { subject: c.subject ?? 'Support request', priority: 'medium' } })}><TicketIcon size={14} />Ticket</Button>
            {c.status !== 'escalated' && c.status !== 'resolved' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: '/escalate', body: { reason: 'Escalated by staff' } })}><AlertTriangle size={14} />Escalate</Button>}
            {c.status !== 'resolved' && <Button size="sm" variant="mint" onClick={() => act.mutate({ path: '/resolve' })}><CheckCircle2 size={14} />Resolve</Button>}
          </div>}
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto bg-bg p-5" aria-live="polite">
          {c.escalations.length > 0 && <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"><b>Escalated:</b> {c.escalations[c.escalations.length - 1].reason}</div>}
          {c.messages.map((m) => <Bubble key={m.id} m={m} />)}
          {typing && <div className="flex items-center gap-2"><Typing /><span className="text-xs text-muted">{typing === 'ai' ? 'Voxera AI is typing' : 'Agent is typing'}</span></div>}
          <div ref={bottom} />
        </div>
        {canAct && (
          <footer className="border-t border-line bg-surface p-4">
            {c.handler === 'ai' && mode === 'agent' && <p className="mb-2 text-xs text-muted">AI is handling this conversation. Sending a reply will take over automatically.</p>}
            <div className="mb-2 flex gap-1 text-xs">
              {([['agent', 'Reply', <Send size={12} />], ['note', 'Internal note', <StickyNote size={12} />], ['customer', 'Simulate customer', <UserRound size={12} />]] as const).map(([k, label, icon]) => (
                <button key={k} onClick={() => setMode(k)} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1', mode === k ? 'bg-tint font-medium text-accent' : 'text-muted hover:bg-soft')}>{icon}{label}</button>))}
            </div>
            <div className="flex items-end gap-2">
              <button className="rounded-lg p-2 text-muted hover:bg-soft" aria-label="Attach file (not enabled in demo)" disabled><Paperclip size={18} /></button>
              <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'note' ? 'Only your team can see this…' : 'Type a message…  (Ctrl+Enter to send)'}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() } }} aria-label="Message" />
              <Button onClick={submit} disabled={send.isPending || !text.trim()} aria-label="Send"><Send size={16} /></Button>
            </div>
          </footer>
        )}
      </section>
      <ContextPanel c={c} />
    </>
  )
}

function ContextPanel({ c }: { c: ConvDetail }) {
  const cid = c.customer?.id
  const cust = useQuery({ queryKey: ['customer', cid], queryFn: () => api<Customer>(`/customers/${cid}`), enabled: !!cid })
  const orders = useQuery({ queryKey: ['orders', cid], queryFn: () => api<Order[]>(`/customers/${cid}/orders`), enabled: !!cid && c.verified })
  const x = cust.data
  return (
    <aside className="hidden w-[21rem] shrink-0 overflow-y-auto border-l border-line bg-surface xl:block">
      <div className="p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Customer</p>
        {!cid ? <p className="text-sm text-muted">Customer not identified yet.</p> : !x ? <Skeleton className="h-24" /> : (
          <div className="space-y-1">
            <div className="flex items-center gap-3"><Avatar name={x.name} size={44} /><div><p className="font-semibold">{x.name}</p><p className="text-xs text-muted">{x.email}</p></div></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Card className="p-3"><p className="text-muted">Orders</p><p className="font-display text-lg font-bold">{x.stats?.orders}</p></Card>
              <Card className="p-3"><p className="text-muted">Open tickets</p><p className="font-display text-lg font-bold">{x.stats?.open_tickets}</p></Card>
            </div>
            <p className="pt-2 text-xs text-muted">Phone {x.phone} · Prefers {x.language.toUpperCase()}</p>
            <div className="flex flex-wrap gap-1 pt-1">{x.tags.map((t) => <Badge key={t} tone="indigo">{t}</Badge>)}</div>
            <Link to={`/customers/${x.id}`} className="inline-flex items-center gap-1 pt-2 text-xs text-accent">Open Customer 360 <ChevronRight size={12} /></Link>
          </div>)}
      </div>
      <div className="border-t border-line p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">AI understanding</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Detected intent</dt><dd>{c.last_intent?.replace('_', ' ') ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Sentiment</dt><dd className="capitalize">{c.sentiment}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Awaiting confirmation</dt><dd>{c.pending_action ? String(c.pending_action.type) : 'No'}</dd></div>
        </dl>
      </div>
      {c.verified && <div className="border-t border-line p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Orders</p>
        {orders.isLoading ? <Skeleton className="h-20" /> : <ul className="space-y-2">{orders.data?.map((o) => (
          <li key={o.order_id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex justify-between"><b>{o.code}</b><span>{money(o.total, o.currency)}</span></div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Badge tone={o.shipment?.status === 'delayed' ? 'rose' : o.status === 'delivered' ? 'mint' : 'indigo'}>{(o.shipment?.status ?? o.status).replace('_', ' ')}</Badge>{o.shipment?.expected_delivery && `ETA ${o.shipment.expected_delivery}`}</div>
          </li>))}</ul>}
      </div>}
      {c.tickets.length > 0 && <div className="border-t border-line p-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Tickets</p>
        {c.tickets.map((t) => <Link key={t.id} to="/tickets" className="mb-1.5 flex items-center justify-between rounded-lg border border-line p-2 text-xs hover:bg-soft"><span className="truncate"><b>{t.code}</b> {t.subject}</span><Badge tone={t.priority === 'high' || t.priority === 'urgent' ? 'rose' : 'slate'}>{t.priority}</Badge></Link>)}</div>}
    </aside>
  )
}
