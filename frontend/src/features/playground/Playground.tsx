import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical, Mic, Play, Send, Sparkles, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { msgIn } from '../../lib/motion'
import { Badge, Button, Card, Empty, Input, Label, PageHeader, Select, Textarea, Typing } from '../../components/ui'
import { api } from '../../lib/api'
import { useUI } from '../../stores/ui'
import type { Customer, Msg } from '../../types'

interface Scenario { id: string; name: string; messages: string[] }
// What each scenario should do (tool names emitted by the agent). Used for the evaluation table.
const EXPECT: Record<string, { tools: string[]; label: string }> = {
  delayed_order: { tools: ['get_order_details', 'create_support_ticket'], label: 'Looks up order, creates ticket' },
  refund: { tools: ['create_refund_request'], label: 'Creates refund request' },
  failed_payment: { tools: ['get_order_details'], label: 'Checks order & payment' },
  return: { tools: ['knowledge_search'], label: 'Answers from policy (cited)' },
  cancel: { tools: ['cancel_order'], label: 'Cancels order' },
  angry: { tools: ['escalate'], label: 'Escalates to human' },
  unknown: { tools: [], label: 'Does not invent an answer' },
  hinglish: { tools: ['get_order_details'], label: 'Understands Hinglish, finds order' },
}
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

export default function Playground() {
  const toast = useUI((s) => s.toast)
  const agent = useQuery({ queryKey: ['agent'], queryFn: () => api<any>('/agent') })
  const customers = useQuery({ queryKey: ['customers', ''], queryFn: () => api<Customer[]>('/customers') })
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api<Scenario[]>('/playground/scenarios') })
  const [prompt, setPrompt] = useState(''), [model, setModel] = useState(MODELS[0]), [temp, setTemp] = useState(0.3), [custId, setCustId] = useState('')
  const [convId, setConvId] = useState<string | null>(null), [msgs, setMsgs] = useState<Msg[]>([]), [text, setText] = useState('')
  const [results, setResults] = useState<any[]>([]), [running, setRunning] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { if (agent.data) { setPrompt(agent.data.system_prompt ?? ''); setModel(agent.data.model ?? MODELS[0]); setTemp(agent.data.temperature ?? 0.3) } }, [agent.data])
  useEffect(() => { if (!custId && customers.data?.length) setCustId(customers.data.find((c) => c.name.startsWith('Ananya'))?.id ?? customers.data[0].id) }, [customers.data, custId])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const call = (message: string, conversation_id: string | null) =>
    api<any>('/playground/chat', { body: { message, conversation_id, customer_id: conversation_id ? null : custId || null, system_prompt: prompt, model, temperature: temp } })
  const send = useMutation({
    mutationFn: (m: string) => call(m, convId),
    onSuccess: (r) => { setConvId(r.conversation_id); setMsgs(r.messages); setText('') },
    onError: (e: Error) => toast({ title: 'Playground error', body: e.message, tone: 'error' }),
  })

  async function runScenario(s: Scenario): Promise<any> {
    const last4 = (await api<Customer>(`/customers/${custId}`)).phone?.slice(-4) ?? '0000'
    let cid: string | null = null, tools = new Set<string>(), maxLat = 0, last: any = null, all: Msg[] = []
    for (const raw of s.messages) {
      const r = await call(raw.replace('{last4}', last4), cid)
      cid = r.conversation_id; last = r; all = r.messages
    }
    all.filter((m) => m.role === 'ai').forEach((m) => { m.meta?.tools?.forEach((t) => tools.add(t.tool)); maxLat = Math.max(maxLat, m.meta?.latency_ms ?? 0) })
    const exp = EXPECT[s.id], got = [...tools]
    const pass = exp ? (exp.tools.length ? exp.tools.every((t) => tools.has(t)) : got.length === 0) : true
    return { id: s.id, name: s.name, pass, expect: exp?.label, got, maxLat, reply: last?.reply?.content, messages: all, cid }
  }
  const runOne = async (s: Scenario) => {
    setRunning(s.id)
    try { const r = await runScenario(s); setConvId(r.cid); setMsgs(r.messages); setResults((x) => [r, ...x.filter((y) => y.id !== r.id)]) }
    catch (e: any) { toast({ title: 'Scenario failed', body: e.message, tone: 'error' }) }
    setRunning(null)
  }
  const runAll = async () => { for (const s of scenarios.data ?? []) await runOne(s) }
  const reset = () => { setConvId(null); setMsgs([]) }
  const passed = results.filter((r) => r.pass).length

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <PageHeader title="AI Playground" sub="Test the real agent with config overrides. Test conversations are excluded from analytics."
        actions={<Link to="/voice"><Button variant="secondary" size="sm"><Mic size={14} />Voice simulation</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr_20rem]">
        <Card className="space-y-4 p-5">
          <div><Label>Test customer</Label><Select value={custId} onChange={(e) => { setCustId(e.target.value); reset() }}>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><Label>Model</Label><Select value={model} onChange={(e) => setModel(e.target.value)}>{MODELS.map((m) => <option key={m}>{m}</option>)}</Select></div>
          <div><Label>Temperature · {temp.toFixed(1)}</Label><input type="range" min={0} max={1} step={0.1} value={temp} onChange={(e) => setTemp(+e.target.value)} className="w-full accent-[rgb(var(--accent))]" aria-label="Temperature" /></div>
          <div><Label>System instructions (override, not saved)</Label><Textarea rows={9} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
          <p className="text-xs text-muted">Tools: orders, refunds, tickets, knowledge. Save permanent changes in AI Configuration.</p>
        </Card>
        <Card className="flex h-[36rem] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-3"><p className="text-sm font-medium">Chat simulation</p><Button size="sm" variant="ghost" onClick={reset}>New conversation</Button></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!msgs.length ? <Empty icon={<FlaskConical />} title="Start a test conversation" hint="Type below or run a predefined scenario." /> : msgs.filter((m) => m.role !== 'note').map((m) => (
              <motion.div key={m.id} variants={msgIn} initial="initial" animate="animate" className={m.role === 'customer' ? 'flex flex-col items-start' : 'flex flex-col items-end'}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.role === 'customer' ? 'rounded-bl-md bg-soft' : 'rounded-br-md bg-tint'}`}>{m.content}</div>
                {m.role === 'ai' && <div className="mt-1 flex flex-wrap gap-1 text-[11px]"><Badge tone="indigo"><Sparkles size={10} />{m.meta?.intent ?? 'ai'}</Badge>{m.meta?.tools?.map((t, i) => <Badge key={i} tone="mint">{t.tool}</Badge>)}{m.meta?.citations?.map((c, i) => <Badge key={i}>📄 {c.title} · {c.score}</Badge>)}<span className="text-muted">{m.meta?.latency_ms} ms</span></div>}
              </motion.div>))}
            {send.isPending && <Typing />}<div ref={bottom} />
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); text.trim() && send.mutate(text.trim()) }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message as the customer…" aria-label="Test message" /><Button disabled={send.isPending || !custId}><Send size={16} /></Button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Scenarios</p><Button size="sm" variant="secondary" onClick={runAll} disabled={!!running || !custId}><Play size={12} />Run all</Button></div>
            <ul className="space-y-1.5">{scenarios.data?.map((s) => (
              <li key={s.id}><button onClick={() => runOne(s)} disabled={!!running || !custId} className="flex w-full items-center justify-between rounded-xl border border-line px-3.5 py-2.5 text-left text-sm transition duration-fast hover:border-accent/40 hover:bg-tint/60 disabled:opacity-60">{s.name}<span className="text-xs text-accent">{running === s.id ? 'Running…' : 'Run'}</span></button></li>))}</ul>
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Evaluation results {results.length > 0 && <span className="text-muted">· {passed}/{results.length} passed</span>}</p>
            {!results.length ? <p className="text-xs text-muted">Run scenarios to see pass/fail against expected tool behaviour.</p> : <ul className="space-y-2">{results.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-2.5 text-xs"><div className="flex items-center gap-1.5">{r.pass ? <CheckCircle2 size={14} className="text-mint" /> : <XCircle size={14} className="text-danger" />}<b>{r.name}</b><span className="ml-auto text-muted">{r.maxLat} ms</span></div>
                <p className="ml-5 text-muted">Expected: {r.expect}. Tools used: {r.got.join(', ') || 'none'}</p></li>))}</ul>}
          </Card>
        </div>
      </div>
    </div>
  )
}
