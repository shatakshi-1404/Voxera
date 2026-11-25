import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, FileText, MessageSquare, Package, RotateCcw, Star, Ticket } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Card, Empty, ErrorNote, Skeleton, Stat, Tabs } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate, money, timeAgo } from '../../lib/utils'
import type { Customer, Order } from '../../types'

const icons: Record<string, ReactNode> = { conversation: <MessageSquare size={14} />, ticket: <Ticket size={14} />, refund: <RotateCcw size={14} />, feedback: <Star size={14} /> }

export default function Customer360() {
  const { id } = useParams()
  const [tab, setTab] = useState<'orders' | 'timeline'>('timeline')
  const cust = useQuery({ queryKey: ['customer', id], queryFn: () => api<Customer>(`/customers/${id}`) })
  const orders = useQuery({ queryKey: ['orders', id], queryFn: () => api<Order[]>(`/customers/${id}/orders`) })
  const tl = useQuery({ queryKey: ['timeline', id], queryFn: () => api<any[]>(`/customers/${id}/timeline`) })
  const c = cust.data
  if (cust.error) return <ErrorNote error={cust.error} />
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} />Customers</Link>
      {!c ? <Skeleton className="h-32" /> : (
        <Card className="mb-4 flex flex-wrap items-center gap-4 p-5">
          <Avatar name={c.name} size={64} />
          <div className="min-w-0 flex-1"><h1 className="font-display text-2xl font-bold">{c.name}</h1><p className="text-sm text-muted">{c.email} · {c.phone}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="slate">Prefers {c.language.toUpperCase()}</Badge><Badge tone={c.sentiment === 'angry' || c.sentiment === 'negative' ? 'rose' : 'mint'}>{c.sentiment}</Badge>{c.tags.map((t) => <Badge key={t} tone="indigo">{t}</Badge>)}</div></div>
          <p className="text-xs text-muted">Customer since {fmtDate(c.created_at)}<br />Last interaction {timeAgo(c.last_interaction_at)}</p>
        </Card>)}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={c?.stats?.orders ?? '—'} /><Stat label="Open tickets" value={c?.stats?.open_tickets ?? '—'} /><Stat label="Interactions" value={tl.data?.length ?? '—'} />
      </div>
      <div className="mb-4"><Tabs id="c360" value={tab} onChange={setTab} tabs={[{ key: 'timeline', label: 'Activity timeline' }, { key: 'orders', label: 'Orders' }]} /></div>
      {tab === 'timeline' ? (
        <Card className="p-4">{!tl.data?.length ? <Empty title="No activity yet" /> : <ol className="relative space-y-4 border-l border-line pl-5">{tl.data.map((e) => (
          <li key={e.kind + e.id} className="relative"><span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-muted">{icons[e.kind] ?? <FileText size={14} />}</span>
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{e.kind === 'conversation' ? <Link className="hover:text-accent" to={`/inbox/${e.id}`}>{e.title}</Link> : e.title}</p><span className="shrink-0 text-xs text-muted">{fmtDate(e.at)}</span></div>
            <div className="mt-0.5 flex gap-1.5"><Badge>{e.kind}</Badge>{e.status && <Badge tone={e.status === 'resolved' ? 'mint' : 'amber'}>{e.status}</Badge>}{e.channel === 'voice' && <Badge>voice</Badge>}</div></li>))}</ol>}</Card>
      ) : (
        <div className="space-y-3">{!orders.data?.length ? <Card><Empty icon={<Package />} title="No orders" /></Card> : orders.data.map((o) => (
          <Card key={o.order_id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{o.code}</p><div className="flex items-center gap-2"><Badge tone={o.shipment?.status === 'delayed' ? 'rose' : o.status === 'delivered' ? 'mint' : 'indigo'}>{(o.shipment?.status ?? o.status).replace('_', ' ')}</Badge><span className="font-medium">{money(o.total, o.currency)}</span></div></div>
            <p className="mt-1 text-sm text-muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')} · placed {fmtDate(o.placed_at)}</p>
            {o.shipment && <p className="mt-2 text-xs text-muted">{o.shipment.carrier} · {o.shipment.tracking_no}{o.shipment.last_location && ` · ${o.shipment.last_location}`}{o.shipment.expected_delivery && ` · ETA ${o.shipment.expected_delivery}`}</p>}
            {o.payment && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><CreditCard size={12} />{o.payment.brand} •••• {o.payment.last4} · {o.payment.status}</p>}
          </Card>))}</div>)}
    </div>
  )
}
