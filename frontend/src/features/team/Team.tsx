import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Avatar, Badge, Button, Card, ErrorNote, Input, Label, ListSkeleton, Modal, PageHeader, Select } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../stores/auth'
import type { Member } from '../../types'

const ROLE_INFO: Record<string, string> = { owner: 'Complete platform control', admin: 'Configure agents and integrations', manager: 'Manage teams and escalations', agent: 'Handle conversations', analyst: 'Access reports' }

export default function Team() {
  const qc = useQueryClient(), { role, user } = useAuth(), isAdmin = role === 'owner' || role === 'admin', canToggle = isAdmin || role === 'manager'
  const [open, setOpen] = useState(false), [form, setForm] = useState({ email: '', full_name: '', role: 'agent' }), [temp, setTemp] = useState<string | null>(null)
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<Member[]>('/team') })
  const patch = useMutation({ mutationFn: (v: { id: string; body: object }) => api(`/team/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }) })
  const invite = useMutation({ mutationFn: () => api<any>('/team/invite', { body: form }), onSuccess: (r) => { setTemp(r.temporary_password); qc.invalidateQueries({ queryKey: ['team'] }) } })
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <PageHeader title="Team" sub="Human agents who take over from the AI" actions={isAdmin && <Button onClick={() => { setOpen(true); setTemp(null) }}><UserPlus size={15} />Invite teammate</Button>} />
      <Card className="overflow-hidden">
        {team.isLoading ? <ListSkeleton rows={4} /> : team.error ? <ErrorNote error={team.error} /> : <ul className="divide-y divide-line">{team.data?.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-4 p-5 transition hover:bg-soft/40"><Avatar name={m.full_name} size={40} />
            <div className="min-w-0 flex-1"><p className="font-medium">{m.full_name}{m.user_id === user?.id && <span className="text-muted"> (you)</span>}</p><p className="text-xs text-muted">{m.email}</p></div>
            {isAdmin && m.role !== 'owner' ? <Select className="!w-32" value={m.role} aria-label={`Role for ${m.full_name}`} onChange={(e) => patch.mutate({ id: m.user_id, body: { role: e.target.value } })}>{['admin', 'manager', 'agent', 'analyst'].map((r) => <option key={r}>{r}</option>)}</Select> : <Badge tone="indigo">{m.role}</Badge>}
            <button disabled={!canToggle} onClick={() => patch.mutate({ id: m.user_id, body: { available: !m.available } })} className="flex items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-xs font-medium transition hover:bg-tint disabled:opacity-60" aria-pressed={m.available}>
              <span className={`h-2 w-2 rounded-full ${m.available ? 'bg-mint' : 'bg-faint'}`} />{m.available ? 'Available' : 'Away'}</button></li>))}</ul>}
      </Card>
      <Card className="mt-5 p-5"><p className="mb-3 text-sm font-semibold">Roles &amp; permissions</p><dl className="grid gap-1 text-sm sm:grid-cols-2">{Object.entries(ROLE_INFO).map(([r, t]) => <div key={r}><dt className="inline font-medium capitalize">{r}: </dt><dd className="inline text-muted">{t}</dd></div>)}</dl></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite teammate">
        {temp ? <div className="space-y-3"><p className="text-sm">Account created. Share this temporary password once; they should change it after first login (demo flow, no email is sent).</p>
          <div className="flex items-center gap-2 rounded-lg bg-soft p-3 font-mono text-sm">{temp}<button className="ml-auto" aria-label="Copy" onClick={() => navigator.clipboard.writeText(temp)}><Copy size={14} /></button></div></div> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); invite.mutate() }}>
            <div><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Role</Label><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['admin', 'manager', 'agent', 'analyst'].map((r) => <option key={r}>{r}</option>)}</Select></div>
            {invite.error && <p role="alert" className="text-xs text-danger">{(invite.error as Error).message}</p>}<Button className="w-full" disabled={invite.isPending}>Send invite</Button></form>)}
      </Modal>
    </div>
  )
}
