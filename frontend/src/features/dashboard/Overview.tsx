import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Gauge, MessageSquare, Smile } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Avatar, Card, ConvBadge, Empty, ErrorNote, Page, PageHeader, Rise, SectionHeader, Skeleton, Stat } from '../../components/ui'
import { CHART, ChartTip } from '../../components/charts'
import { api } from '../../lib/api'
import { useBus } from '../../lib/bus'
import { pct, timeAgo } from '../../lib/utils'
import { useAuth } from '../../stores/auth'
import type { Conv } from '../../types'

export default function Overview() {
  const qc = useQueryClient(), name = useAuth((s) => s.user?.full_name.split(' ')[0])
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<{ summary: any; recent_conversations: Conv[] }>('/dashboard') })
  const an = useQuery({ queryKey: ['overview', 14], queryFn: () => api<any>('/analytics/overview?days=14') })
  useBus((e) => { if (e.type.startsWith('conversation') || e.type.startsWith('ticket')) qc.invalidateQueries({ queryKey: ['dashboard'] }) })
  const s = dash.data?.summary
  return (
    <Page>
      <PageHeader title={`Good to see you, ${name ?? ''}`} sub="Here's how support is doing" />
      {dash.error && <ErrorNote error={dash.error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dash.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[126px]" />) : s && <>
          <Stat label="Open conversations" value={s.open_conversations} tone="indigo" icon={<MessageSquare size={16} />} />
          <Stat label="AI resolved today" value={s.ai_resolved_today} tone="mint" icon={<Bot size={16} />} />
          <Stat label="AI containment" value={pct(s.ai_containment_rate)} hint="Last 7 days, genuinely resolved" icon={<Gauge size={16} />} />
          <Stat label="CSAT" value={s.csat_avg ?? '—'} hint={`${s.open_tickets} open tickets · ${s.sla_breached} SLA breached`} icon={<Smile size={16} />} />
        </>}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Rise className="lg:col-span-3"><Card className="h-full p-5">
          <SectionHeader title="Conversations" sub="Last 14 days" actions={<div className="flex gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: CHART.accent }} />Total</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: CHART.mint }} />AI resolved</span></div>} />
          <div className="h-64">
            {an.isLoading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={an.data?.conversations_over_time ?? []} margin={{ left: -12, right: 4, top: 6 }}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} /><stop offset="100%" stopColor={CHART.accent} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} tickLine={false} axisLine={false} stroke={CHART.tick} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={36} stroke={CHART.tick} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: CHART.accent2, strokeOpacity: 0.3 }} />
                  <Area dataKey="total" stroke={CHART.accent} fill="url(#g)" strokeWidth={2.25} name="Conversations" animationDuration={900} />
                  <Area dataKey="ai_resolved" stroke={CHART.mint} fill="transparent" strokeWidth={2.25} name="AI resolved" animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer>)}
          </div>
        </Card></Rise>
        <Rise className="lg:col-span-2"><Card className="h-full">
          <div className="flex items-center justify-between p-5 pb-2"><SectionHeader title="Recent activity" sub="Latest conversations" /><Link to="/inbox" className="mb-3 text-xs font-medium text-accent hover:underline">Open inbox</Link></div>
          {dash.isLoading ? <Skeleton className="m-5 h-48" /> : !dash.data?.recent_conversations.length ? <Empty icon={<CheckCircle2 size={20} />} title="No conversations yet" hint="Open your public chat link to start one." /> : (
            <ul className="px-2 pb-3">{dash.data.recent_conversations.map((c) => (
              <li key={c.id}><Link to={`/inbox/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition duration-fast hover:bg-soft">
                <Avatar name={c.customer?.name ?? '? ?'} size={34} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.customer?.name ?? 'Anonymous'}</p><p className="truncate text-xs text-muted">{c.preview}</p></div>
                <div className="flex flex-col items-end gap-1"><ConvBadge c={c} /><p className="text-[11px] text-faint">{timeAgo(c.last_message_at)}</p></div>
              </Link></li>))}</ul>
          )}
        </Card></Rise>
      </div>
    </Page>
  )
}
