import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { ChartTip } from '../../components/charts'
import { Card, ErrorNote, Page, PageHeader, Rise, Select, Skeleton, Stat } from '../../components/ui'
import { api } from '../../lib/api'
import { pct } from '../../lib/utils'

const C = ['#FF7A45', '#5EEAD4', '#FFC857', '#FF9F6B', '#7DD3FC', '#FF5C7A']
const dur = (s?: number | null) => (s == null ? '—' : s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`)
const entries = (o: Record<string, number> = {}) => Object.entries(o).map(([name, value]) => ({ name, value }))

function Chart({ title, children, h = 240 }: { title: string; children: React.ReactNode; h?: number }) {
  return <Rise><Card className="p-5"><p className="mb-4 text-sm font-semibold">{title}</p><div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer></div></Card></Rise>
}
const grid = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(255 255 255 / 0.07)" />

export default function Insights() {
  const [days, setDays] = useState(30)
  const q = useQuery({ queryKey: ['overview', days], queryFn: () => api<any>(`/analytics/overview?days=${days}`) })
  const d = q.data
  return (
    <Page>
      <PageHeader title="Insights Studio" sub="Customer satisfaction and support performance" actions={<Select className="!w-36" value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Range"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>} />
      {q.error && <ErrorNote error={q.error} />}
      {q.isLoading ? <Skeleton className="h-96" /> : d && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Conversations" value={d.total_conversations} />
          <Stat label="AI containment" value={pct(d.ai_containment_rate)} tone="mint" hint="Only customer-confirmed AI resolutions" />
          <Stat label="Escalation rate" value={pct(d.escalation_rate)} />
          <Stat label="CSAT" value={d.csat_avg ?? '—'} hint={`${d.csat_count} responses`} tone="indigo" />
          <Stat label="First response" value={dur(d.avg_first_response_sec)} />
          <Stat label="Avg resolution time" value={dur(d.avg_resolution_sec)} />
          <Stat label="Voice avg latency" value={d.voice.avg_latency_ms ? `${Math.round(d.voice.avg_latency_ms)} ms` : '—'} hint={`${d.voice.sessions} calls`} />
          <Stat label="Unresolved" value={d.open_conversations} hint={`${d.sla_breached} tickets past SLA`} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Chart title="Conversations over time"><LineChart data={d.conversations_over_time}>{grid}<XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} fontSize={11} tickLine={false} axisLine={false} stroke="#8A8176" /><YAxis fontSize={11} width={28} tickLine={false} axisLine={false} /><Tooltip content={<ChartTip />} /><Legend />
            <Line dataKey="total" name="All" stroke="#FF7A45" strokeWidth={2} dot={false} /><Line dataKey="ai_resolved" name="AI resolved" stroke="#5EEAD4" strokeWidth={2} dot={false} /></LineChart></Chart>
          <Chart title="CSAT trend"><LineChart data={d.csat_trend}>{grid}<XAxis dataKey="date" tickFormatter={(x) => x.slice(5)} fontSize={11} tickLine={false} axisLine={false} stroke="#8A8176" /><YAxis domain={[1, 5]} fontSize={11} width={28} tickLine={false} axisLine={false} /><Tooltip content={<ChartTip />} /><Line dataKey="csat" name="CSAT" stroke="#FFC857" strokeWidth={2} dot={{ r: 3 }} /></LineChart></Chart>
          <Chart title="Top customer intents"><BarChart data={d.top_intents} layout="vertical" margin={{ left: 30 }}>{grid}<XAxis type="number" fontSize={11} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="intent" fontSize={11} width={110} axisLine={false} tickLine={false} tickFormatter={(s) => s.replace('_', ' ')} /><Tooltip content={<ChartTip />} /><Bar dataKey="count" fill="#FF7A45" radius={[0, 4, 4, 0]} /></BarChart></Chart>
          <div className="grid gap-4 sm:grid-cols-2">
            <Chart title="Voice vs chat" h={200}><PieChart><Pie data={entries(d.by_channel)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} label>{entries(d.by_channel).map((_, i) => <Cell key={i} fill={C[i]} />)}</Pie><Tooltip content={<ChartTip />} /></PieChart></Chart>
            <Chart title="Language distribution" h={200}><PieChart><Pie data={entries(d.by_language)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} label>{entries(d.by_language).map((_, i) => <Cell key={i} fill={C[i + 2]} />)}</Pie><Tooltip content={<ChartTip />} /></PieChart></Chart>
          </div>
        </div>
      </>}
    </Page>
  )
}
