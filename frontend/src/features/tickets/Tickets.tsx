import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Ticket as TicketIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Badge, Button, Card, Empty, ErrorNote, FieldError, Input, Label, ListSkeleton, Modal, PageHeader, Select, Textarea, Tabs, cn, priorityTone } from '../../components/ui'
import { api } from '../../lib/api'
import { useBus } from '../../lib/bus'
import { fmtDate, fmtSla, money, qs, useNow } from '../../lib/utils'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'
import type { Member, Ticket } from '../../types'

function Sla({ t, now }: { t: Ticket; now: number }) {
  if (!t.sla_due_at || ['resolved', 'closed'].includes(t.status)) return <span className="text-muted">—</span>
  const left = Math.round((new Date(t.sla_due_at).getTime() - now) / 1000)
  return <span className={cn('inline-flex items-center gap-1 text-xs font-medium', left < 0 ? 'text-danger' : left < 3600 ? 'text-warn' : 'text-muted')}><Clock size={12} />{left < 0 ? 'Breached ' : ''}{fmtSla(left)}</span>
}

export default function Tickets() {
  const qc = useQueryClient(), role = useAuth((s) => s.role), now = useNow(30_000)
  const [tab, setTab] = useState<'tickets' | 'refunds'>('tickets'), [status, setStatus] = useState(''), [priority, setPriority] = useState('')
  const [sel, setSel] = useState<Ticket | null>(null), [creating, setCreating] = useState(false)
  const list = useQuery({ queryKey: ['tickets', status, priority], queryFn: () => api<Ticket[]>(`/tickets${qs({ status, priority })}`) })
  useBus((e) => { if (e.type.startsWith('ticket') || e.type === 'escalation.requested') qc.invalidateQueries({ queryKey: ['tickets'] }) })
  const canWrite = role !== 'analyst'
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader title="Tickets & escalations" sub="SLA-tracked follow-ups created by the AI or your team" actions={canWrite && <Button onClick={() => setCreating(true)}><Plus size={15} />New ticket</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="mr-2 min-w-[14rem]"><Tabs id="tix" value={tab} onChange={setTab} tabs={[{ key: 'tickets', label: 'Tickets' }, { key: 'refunds', label: 'Refund requests' }]} /></div>
        {tab === 'tickets' && <>
          <Select className="!w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">All statuses</option>{['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
          <Select className="!w-36" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority filter"><option value="">All priorities</option>{['urgent', 'high', 'medium', 'low'].map((s) => <option key={s}>{s}</option>)}</Select></>}
      </div>
      {tab === 'refunds' ? <Refunds /> : (
        <Card className="overflow-hidden overflow-x-auto">
          {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorNote error={list.error} /> : !list.data?.length ? <Empty icon={<TicketIcon />} title="No tickets" hint="Tickets appear when the AI escalates or your team creates one." /> : (
            <table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-line bg-soft/50"><th className="th">Ticket</th><th className="th">Priority</th><th className="th">Status</th><th className="th">SLA</th><th className="th">Created</th></tr></thead>
              <tbody>{list.data.map((t) => (
                <tr key={t.id} onClick={() => setSel(t)} className="cursor-pointer border-b border-line/70 transition duration-fast last:border-0 hover:bg-soft/60">
                  <td className="px-4 py-3.5"><p className="font-medium">{t.code} <span className="font-normal text-muted">· {t.created_by}</span></p><p className="max-w-md truncate text-xs text-muted">{t.subject}</p></td>
                  <td className="px-4"><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge></td><td className="px-4"><Badge tone={t.status === 'resolved' ? 'mint' : 'slate'}>{t.status.replace('_', ' ')}</Badge></td>
                  <td className="px-4"><Sla t={t} now={now} /></td><td className="px-4 text-xs text-muted">{fmtDate(t.created_at)}</td></tr>))}</tbody></table>)}
        </Card>)}
      <TicketDrawer t={sel} onClose={() => setSel(null)} canWrite={canWrite} />
      <CreateTicket open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function TicketDrawer({ t, onClose, canWrite }: { t: Ticket | null; onClose: () => void; canWrite: boolean }) {
  const qc = useQueryClient(), toast = useUI((s) => s.toast)
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('/team'), staleTime: 60_000 })
  const [f, setF] = useState<Partial<Ticket>>({}), [key, setKey] = useState<string | null>(null)
  if (t && key !== t.id) { setKey(t.id); setF({}) }
  const save = useMutation({
    mutationFn: () => api(`/tickets/${t!.id}`, { method: 'PATCH', body: f }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); toast({ title: 'Ticket updated', tone: 'success' }); onClose() },
    onError: (e: Error) => toast({ title: 'Update failed', body: e.message, tone: 'error' }),
  })
  const v = <K extends keyof Ticket>(k: K) => (f[k] ?? t?.[k]) as any
  return (
    <Modal open={!!t} onClose={onClose} title={t ? `${t.code} · ${t.subject.slice(0, 50)}` : ''} wide>
      {t && <div className="space-y-3">
        {t.escalation_reason && <p className="rounded-lg bg-danger/10 p-2.5 text-sm text-danger"><b>Escalation reason:</b> {t.escalation_reason}</p>}
        {t.description && <p className="rounded-lg bg-soft p-3 text-sm">{t.description}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Priority</Label><Select disabled={!canWrite} value={v('priority')} onChange={(e) => setF({ ...f, priority: e.target.value as any })}>{['urgent', 'high', 'medium', 'low'].map((p) => <option key={p}>{p}</option>)}</Select></div>
          <div><Label>Status</Label><Select disabled={!canWrite} value={v('status')} onChange={(e) => setF({ ...f, status: e.target.value as any })}>{['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}</Select></div>
          <div><Label>Assignee</Label><Select disabled={!canWrite} value={v('assignee_id') ?? ''} onChange={(e) => setF({ ...f, assignee_id: (e.target.value || null) as any })}><option value="">Unassigned</option>{team.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</Select></div>
        </div>
        <div><Label>Resolution note</Label><Textarea disabled={!canWrite} rows={3} value={v('resolution_note') ?? ''} onChange={(e) => setF({ ...f, resolution_note: e.target.value })} /></div>
        <div className="flex items-center justify-between">{t.conversation_id ? <Link className="text-sm text-accent" to={`/inbox/${t.conversation_id}`}>Open conversation & history →</Link> : <span />}
          {canWrite && <Button onClick={() => save.mutate()} disabled={!Object.keys(f).length || save.isPending}>Save changes</Button>}</div>
      </div>}
    </Modal>
  )
}

const schema = z.object({ subject: z.string().min(3, 'Subject is required'), description: z.string().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']) })
function CreateTicket({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { priority: 'medium' } })
  const m = useMutation({ mutationFn: (b: z.infer<typeof schema>) => api('/tickets', { body: b }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); reset(); onClose() } })
  return (
    <Modal open={open} onClose={onClose} title="New ticket">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-3">
        <div><Label>Subject</Label><Input {...register('subject')} /><FieldError msg={errors.subject?.message} /></div>
        <div><Label>Description</Label><Textarea rows={3} {...register('description')} /></div>
        <div><Label>Priority</Label><Select {...register('priority')}>{['low', 'medium', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</Select></div>
        {m.error && <FieldError msg={(m.error as Error).message} />}<Button className="w-full" disabled={m.isPending}>Create ticket</Button>
      </form>
    </Modal>
  )
}

function Refunds() {
  const qc = useQueryClient(), role = useAuth((s) => s.role), canDecide = role === 'owner' || role === 'admin' || role === 'manager'
  const list = useQuery({ queryKey: ['refunds'], queryFn: () => api<any[]>('/refunds') })
  const decide = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/refunds/${v.id}`, { method: 'PATCH', body: { status: v.status } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['refunds'] }) })
  return (
    <Card>
      {list.isLoading ? <ListSkeleton rows={3} /> : !list.data?.length ? <Empty title="No refund requests" hint="Requests created by the AI after customer confirmation show up here for review." /> : (
        <ul className="divide-y divide-line">{list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-5"><div className="flex-1"><p className="text-sm font-medium">{money(r.amount)} <span className="font-normal text-muted">· requested by {r.created_by}</span></p><p className="text-xs text-muted">{r.reason}</p></div>
            <Badge tone={r.status === 'approved' ? 'mint' : r.status === 'rejected' ? 'rose' : 'amber'}>{r.status}</Badge>
            {canDecide && r.status === 'requested' && <><Button size="sm" variant="mint" onClick={() => decide.mutate({ id: r.id, status: 'approved' })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: r.id, status: 'rejected' })}>Reject</Button></>}</li>))}</ul>)}
    </Card>
  )
}
