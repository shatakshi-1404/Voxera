import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, ExternalLink, Globe2, Mic, Plug, ShieldAlert, Wrench, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Label, Page, PageHeader, Rise, Select, Skeleton, StatusDot, Textarea, Toggle } from '../../components/ui'
import { api, API_ORIGIN } from '../../lib/api'
import { useAuth } from '../../stores/auth'
import { useUI } from '../../stores/ui'

function Section({ icon: Icon, title, sub, children }: { icon: LucideIcon; title: string; sub: string; children: React.ReactNode }) {
  return (
    <Rise><Card className="grid gap-5 p-6 lg:grid-cols-[14rem_1fr]">
      <div><span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-tint text-accent"><Icon size={17} /></span><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p></div>
      <div className="min-w-0 space-y-4">{children}</div>
    </Card></Rise>
  )
}
const Row = ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) => (
  <div className={`flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 ${disabled ? 'opacity-60' : ''}`}><span className="text-sm">{label}</span>
    {disabled ? <Badge tone={checked ? 'indigo' : 'slate'}>{checked ? 'On' : 'Off'}</Badge> : <Toggle label={label} checked={checked} onChange={() => onChange()} />}</div>
)

const TOOLS = [['orders', 'Order & shipment lookup'], ['refunds', 'Refund requests'], ['tickets', 'Ticket creation'], ['knowledge', 'Knowledge search']]
const LANGS = [['en', 'English'], ['hi', 'Hindi'], ['hinglish', 'Hinglish']]

export function AIConfig() {
  const qc = useQueryClient(), toast = useUI((s) => s.toast), role = useAuth((s) => s.role), canEdit = role === 'owner' || role === 'admin'
  const q = useQuery({ queryKey: ['agent'], queryFn: () => api<any>('/agent') })
  const [f, setF] = useState<any>(null)
  useEffect(() => { if (q.data) setF({ ...q.data, voice: q.data.voice ?? {}, escalation_rules: q.data.escalation_rules ?? {} }) }, [q.data])
  const save = useMutation({ mutationFn: () => api('/agent', { method: 'PUT', body: { name: f.name, system_prompt: f.system_prompt, model: f.model, temperature: f.temperature, languages: f.languages, voice: f.voice, escalation_rules: f.escalation_rules, tools_enabled: f.tools_enabled } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent'] }); toast({ title: 'AI configuration saved', tone: 'success' }) }, onError: (e: Error) => toast({ title: 'Save failed', body: e.message, tone: 'error' }) })
  if (!f) return <div className="p-8"><Skeleton className="h-96" /></div>
  const toggle = (k: 'languages' | 'tools_enabled', v: string) => setF({ ...f, [k]: (f[k] ?? []).includes(v) ? f[k].filter((x: string) => x !== v) : [...(f[k] ?? []), v] })
  const dis = !canEdit
  return (
    <Page className="max-w-5xl">
      <PageHeader title="AI Configuration" sub="Personality, languages, tools, voice and escalation rules" actions={<>
        {save.isPending ? <StatusDot tone="amber" pulse label="Saving…" /> : save.isSuccess && !save.isPending ? <StatusDot tone="mint" label="All changes saved" /> : null}
        {canEdit && <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>}</>} />
      {!canEdit && <p className="mb-4 rounded-xl bg-soft px-4 py-3 text-sm text-muted">You can view this configuration, but only owners and admins can change it.</p>}
      <div className="space-y-5">
        <Section icon={Bot} title="Agent identity" sub="Name, instructions and the model that powers replies.">
          <div><Label>Name</Label><Input disabled={dis} value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>System instructions / personality</Label><Textarea disabled={dis} rows={7} value={f.system_prompt ?? ''} onChange={(e) => setF({ ...f, system_prompt: e.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><Label>Model</Label><Select disabled={dis} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}><option>llama-3.3-70b-versatile</option><option>llama-3.1-8b-instant</option></Select></div>
            <div><Label>Temperature · {Number(f.temperature).toFixed(1)}</Label><input disabled={dis} type="range" min={0} max={1} step={0.1} value={f.temperature} onChange={(e) => setF({ ...f, temperature: +e.target.value })} className="mt-2 w-full accent-[rgb(var(--accent))]" aria-label="Temperature" />
              <div className="mt-1 flex justify-between text-[11px] text-faint"><span>Precise</span><span>Creative</span></div></div></div>
        </Section>
        <Section icon={Globe2} title="Languages" sub="Languages the agent may reply in.">
          {LANGS.map(([k, l]) => <Row key={k} label={l} disabled={dis} checked={(f.languages ?? []).includes(k)} onChange={() => toggle('languages', k)} />)}
        </Section>
        <Section icon={Wrench} title="Tool permissions" sub="Every tool is re-validated by the backend (identity, ownership, limits) regardless of what the model proposes.">
          {TOOLS.map(([k, l]) => <Row key={k} label={l} disabled={dis} checked={(f.tools_enabled ?? []).includes(k)} onChange={() => toggle('tools_enabled', k)} />)}
        </Section>
        <Section icon={Mic} title="Voice" sub="Stored with your agent config; wire these into voice_worker.py to switch voices per language.">
          <div className="grid gap-4 sm:grid-cols-2"><div><Label>English voice ID</Label><Input disabled={dis} value={f.voice.en ?? ''} onChange={(e) => setF({ ...f, voice: { ...f.voice, en: e.target.value } })} placeholder="ElevenLabs voice id" /></div>
            <div><Label>Hindi voice ID</Label><Input disabled={dis} value={f.voice.hi ?? ''} onChange={(e) => setF({ ...f, voice: { ...f.voice, hi: e.target.value } })} /></div></div>
        </Section>
        <Section icon={ShieldAlert} title="Escalation" sub="Always escalated: customer asks for a human, angry sentiment, repeated failures, account-security concerns. Limits are informational in v1; the backend enforces its configured defaults.">
          <div className="grid gap-4 sm:grid-cols-2"><div><Label>Max failed identity checks</Label><Input disabled={dis} type="number" min={1} max={5} value={f.escalation_rules.max_failed_verifications ?? 3} onChange={(e) => setF({ ...f, escalation_rules: { ...f.escalation_rules, max_failed_verifications: +e.target.value } })} /></div>
            <div><Label>Auto-refund limit (INR)</Label><Input disabled={dis} type="number" value={f.escalation_rules.refund_auto_limit ?? 5000} onChange={(e) => setF({ ...f, escalation_rules: { ...f.escalation_rules, refund_auto_limit: +e.target.value } })} /></div></div>
        </Section>
      </div>
    </Page>
  )
}

export function Integrations() {
  const h = useQuery({ queryKey: ['health'], queryFn: () => fetch(`${API_ORIGIN}/health`).then((r) => r.json()) })
  const items = [
    { name: 'PostgreSQL + pgvector', ok: h.data?.db === 'ok', text: 'Customer data and knowledge vectors' },
    { name: 'Groq LLM', ok: h.data?.llm, text: 'Intent classification and response phrasing. Add GROQ_API_KEY in backend/.env' },
    { name: 'LiveKit', ok: h.data?.livekit, text: 'Real-time voice transport. Add LIVEKIT_* keys' },
    { name: 'Deepgram (STT)', ok: undefined, text: 'Set DEEPGRAM_API_KEY for the voice worker' },
    { name: 'ElevenLabs (TTS)', ok: undefined, text: 'Set ELEVEN_API_KEY for the voice worker' },
  ]
  return (
    <Page><PageHeader title="Integrations" sub="Live status of services Voxera depends on" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((i) => (
        <Rise key={i.name}><Card className="flex h-full flex-col p-5 transition duration-base hover:shadow-pop">
          <div className="mb-4 flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-tint text-accent"><Plug size={20} /></span>
            {i.ok === undefined ? <Badge>Worker-side</Badge> : <Badge tone={i.ok ? 'mint' : 'rose'}>{i.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}{i.ok ? 'Connected' : 'Not configured'}</Badge>}</div>
          <p className="font-semibold">{i.name}</p><p className="mt-1 text-sm leading-relaxed text-muted">{i.text}</p>
        </Card></Rise>))}</div>
    </Page>
  )
}

export function SettingsPage() {
  const { org, user, role } = useAuth(), { dark, toggleDark } = useUI()
  const link = `${location.origin}/chat/${org?.slug}`
  return (
    <Page className="max-w-4xl"><PageHeader title="Settings" sub="Workspace, sharing and preferences" />
      <div className="space-y-5">
        <Rise><Card className="p-6"><p className="mb-4 text-sm font-semibold">Organization</p>
          <dl className="grid gap-4 sm:grid-cols-3">{[['Workspace', org?.name], ['Signed in as', user?.email], ['Role', role]].map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 truncate text-sm font-medium">{v}</dd></div>)}</dl></Card></Rise>
        <Rise><Card className="p-6"><p className="text-sm font-semibold">Customer chat link</p><p className="mb-3 text-xs text-muted">Share this with customers, or embed it in an iframe.</p>
          <a className="inline-flex max-w-full items-center gap-1.5 break-all rounded-xl bg-soft px-4 py-2.5 text-sm font-medium text-accent hover:underline" target="_blank" rel="noreferrer" href={link}>{link}<ExternalLink size={13} className="shrink-0" /></a></Card></Rise>
        <Rise><Card className="flex items-center justify-between gap-4 p-6"><div><p className="text-sm font-semibold">Appearance</p><p className="text-xs text-muted">Light is the default Voxera look</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted">{dark ? 'Dark' : 'Light'}</span><Toggle label="Dark mode" checked={dark} onChange={() => toggleDark()} /></div></Card></Rise>
        <Rise><Card className="p-6"><p className="mb-3 text-sm font-semibold">Keyboard shortcuts</p><ul className="grid gap-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">{[['g i', 'Inbox'], ['g v', 'Voice Studio'], ['g t', 'Tickets'], ['g c', 'Customers'], ['g p', 'Playground'], ['g k', 'Knowledge'], ['g a', 'Insights'], ['/', 'Focus search'], ['Ctrl+Enter', 'Send message']].map(([k, l]) => <li key={k} className="flex items-center gap-2"><kbd className="min-w-8 rounded-md border border-line bg-soft px-1.5 py-0.5 text-center text-xs text-ink">{k}</kbd>{l}</li>)}</ul></Card></Rise>
      </div>
    </Page>
  )
}
