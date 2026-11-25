import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Card, Empty, ErrorNote, ListSkeleton, PageHeader, SearchInput } from '../../components/ui'
import { api } from '../../lib/api'
import { qs, timeAgo, useDebounced } from '../../lib/utils'
import type { Customer } from '../../types'

const sentTone = (s: string) => (s === 'angry' || s === 'negative' ? 'rose' : s === 'positive' ? 'mint' : 'slate') as 'rose' | 'mint' | 'slate'

export function Customers() {
  const [q, setQ] = useState(''), dq = useDebounced(q)
  const list = useQuery({ queryKey: ['customers', dq], queryFn: () => api<Customer[]>(`/customers${qs({ q: dq })}`) })
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader title="Customers" sub="Everyone your team and AI have talked to" />
      <div className="mb-4 max-w-sm"><SearchInput data-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone" aria-label="Search customers" /></div>
      <Card className="overflow-hidden">
        {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorNote error={list.error} /> : !list.data?.length ? <Empty icon={<Users />} title="No customers found" /> : (
          <ul className="divide-y divide-line">{list.data.map((c) => (
            <li key={c.id}><Link to={`/customers/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 transition duration-fast hover:bg-soft/70">
              <Avatar name={c.name} /><div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="truncate text-xs text-muted">{c.email} · {c.phone}</p></div>
              <div className="hidden gap-1 sm:flex">{c.tags.map((t) => <Badge key={t} tone="indigo">{t}</Badge>)}<Badge tone={sentTone(c.sentiment)}>{c.sentiment}</Badge></div>
              <span className="w-10 text-right text-xs text-muted">{timeAgo(c.last_interaction_at)}</span></Link></li>))}</ul>)}
      </Card>
    </div>
  )
}

export function Segments() {
  const list = useQuery({ queryKey: ['customers', ''], queryFn: () => api<Customer[]>('/customers?limit=200') })
  const c = list.data ?? []
  const groups: [string, string, Customer[]][] = [
    ['VIP', 'Tagged as VIP', c.filter((x) => x.tags.includes('vip'))],
    ['Needs attention', 'Negative or angry sentiment', c.filter((x) => ['negative', 'angry'].includes(x.sentiment))],
    ['Hindi & Hinglish speakers', 'Prefer a Hindi-first experience', c.filter((x) => x.language !== 'en')],
    ['Recently active', 'Interacted in the last 7 days', c.filter((x) => x.last_interaction_at && Date.now() - new Date(x.last_interaction_at).getTime() < 7 * 864e5)],
  ]
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader title="Customer Segments" sub="Smart groups computed from tags, sentiment, language and activity" />
      {list.isLoading ? <ListSkeleton /> : <div className="grid gap-4 md:grid-cols-2">{groups.map(([name, desc, members]) => (
        <Card key={name} className="p-5 transition duration-base hover:shadow-pop"><div className="flex items-baseline justify-between"><p className="font-medium">{name}</p><span className="font-display text-3xl font-bold text-accent">{members.length}</span></div>
          <p className="mb-3 text-xs text-muted">{desc}</p>
          {members.length ? <div className="flex flex-wrap gap-2">{members.slice(0, 8).map((m) => <Link key={m.id} to={`/customers/${m.id}`} className="flex items-center gap-1.5 rounded-full bg-soft py-1 pl-1 pr-3 text-xs transition hover:bg-tint"><Avatar name={m.name} size={22} />{m.name}</Link>)}</div> : <p className="text-sm text-muted">No customers in this segment.</p>}
        </Card>))}</div>}
    </div>
  )
}
