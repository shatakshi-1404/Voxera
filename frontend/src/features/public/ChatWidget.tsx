import { useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowUp, ShieldCheck, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '../../components/layout/AppShell'
import { Button, Input, Typing, cn } from '../../components/ui'
import { msgIn, riseIn } from '../../lib/motion'
import { api } from '../../lib/api'
import { useSocket } from '../../lib/ws'
import type { Msg } from '../../types'

/** Customer-facing chat page: /chat/:orgSlug (no staff login; scoped single-conversation token). */
export default function ChatWidget() {
  const { slug } = useParams()
  const [email, setEmail] = useState(''), [sess, setSess] = useState<{ id: string; token: string } | null>(null)
  const [msgs, setMsgs] = useState<Pick<Msg, 'id' | 'role' | 'content'>[]>([]), [text, setText] = useState(''), [resolved, setResolved] = useState(false), [rated, setRated] = useState(false)
  const [human, setHuman] = useState(false), [typing, setTyping] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  const start = useMutation({
    mutationFn: () => api<any>(`/public/${slug}/conversations`, { body: { email: email || null }, token: null }),
    onSuccess: (r) => { setSess({ id: r.conversation_id, token: r.token }); setMsgs([{ id: 'hello', role: 'ai', content: "Hi! I'm Voxera. How can I help you today?" }]) },
  })
  // human agent replies / staff takeover arrive over the websocket
  useSocket(sess ? `/public/conversations/${sess.id}/stream?token=${sess.token}` : null, (e) => {
    const m = e.payload?.message
    if (e.type === 'message.sent' && m?.role === 'agent') setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]))
    if (e.type === 'conversation.takeover' || e.type === 'escalation.requested') setHuman(true)
    if (e.type === 'conversation.released') setHuman(false)
    if (e.type === 'conversation.resolved') setResolved(true)
    if (e.type === 'agent.typing') { setTyping(true); setTimeout(() => setTyping(false), 3000) }
  })
  const send = useMutation({
    mutationFn: (t: string) => api<any>(`/public/conversations/${sess!.id}/messages`, { body: { content: t }, token: sess!.token }),
    onSuccess: (r) => {
      setTyping(false)
      setMsgs((x) => [...x, ...(r.reply && !x.some((y) => y.id === r.reply.id) ? [r.reply] : [])])
      if (r.resolved) setResolved(true); if (r.handled_by === 'human') setHuman(true)
    },
    onError: (e: Error) => setMsgs((x) => [...x, { id: crypto.randomUUID(), role: 'system', content: e.message }]),
  })
  const submit = () => {
    const t = text.trim(); if (!t || !sess) return
    setMsgs((x) => [...x, { id: crypto.randomUUID(), role: 'customer', content: t }]); setText(''); setResolved(false); setTyping(true); send.mutate(t)
  }
  const rate = (n: number) => { api(`/public/conversations/${sess!.id}/feedback`, { body: { rating: n }, token: sess!.token }); setRated(true) }

  return (
    <div className="grid h-[100dvh] place-items-center ambient bg-bg sm:p-6">
      <div className="flex h-full w-full max-w-[28rem] flex-col overflow-hidden bg-surface/90 sm:h-[min(44rem,100%)] sm:rounded-[28px] sm:border sm:border-line sm:shadow-pop glass">
        <header className="relative flex items-center gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="relative"><Logo size={40} /><span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-mint" /></div>
          <div className="min-w-0"><p className="font-display font-bold leading-tight">Support</p><p className="truncate text-xs text-muted">{human ? 'A human agent is helping you' : 'Voxera AI · replies instantly'}</p></div>
        </header>
        {!sess ? (
          <form className="m-auto w-full max-w-sm space-y-4 p-7" onSubmit={(e) => { e.preventDefault(); start.mutate() }}>
            <motion.div variants={riseIn} initial="initial" animate="animate" className="space-y-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-tint"><Logo size={34} /></div>
              <h1 className="font-display text-3xl font-bold tracking-tight">How can we help?</h1>
              <p className="text-sm leading-relaxed text-muted">Enter the email on your account so we can look up your orders. You'll be asked to verify before we share anything.</p>
              <Input type="email" placeholder="you@example.com (optional)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
              {start.error && <p role="alert" className="text-xs text-danger">{(start.error as Error).message}</p>}
              <Button className="w-full py-3" disabled={start.isPending}>{start.isPending ? 'Starting…' : 'Start chat'}</Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-faint"><ShieldCheck size={12} />Your details are only used for this conversation</p>
            </motion.div>
          </form>
        ) : <>
          <div className="flex-1 space-y-3 overflow-y-auto bg-bg p-4" aria-live="polite">
            {msgs.map((m) => m.role === 'system' ? <p key={m.id} className="text-center text-xs text-danger">{m.content}</p> : (
              <motion.div key={m.id} variants={msgIn} initial="initial" animate="animate" className={cn('flex', m.role === 'customer' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[84%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'customer' ? 'rounded-br-md bg-accent text-on-accent shadow-glow' : 'rounded-bl-md border border-line bg-surface shadow-card')}>{m.content}</div></motion.div>))}
            {typing && <motion.div variants={msgIn} initial="initial" animate="animate" className="flex"><Typing /></motion.div>}
            {resolved && !rated && <motion.div variants={msgIn} initial="initial" animate="animate" className="rounded-2xl border border-line bg-surface p-4 text-center shadow-card"><p className="mb-2 text-sm font-medium">How was your experience?</p><div className="flex justify-center gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => rate(n)} aria-label={`${n} stars`} className="text-warn transition hover:scale-110"><Star size={26} /></button>)}</div></motion.div>}
            {rated && <p className="text-center text-xs text-muted">Thanks for your feedback!</p>}
            <div ref={bottom} />
          </div>
          <form className="flex items-center gap-2 border-t border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message…" aria-label="Message" autoFocus className="rounded-full px-4" />
            <Button disabled={!text.trim()} aria-label="Send" className="h-10 w-10 shrink-0 !rounded-full !p-0"><ArrowUp size={18} /></Button>
          </form>
        </>}
        <p className="border-t border-line/60 bg-surface py-2 text-center text-[11px] text-faint">Powered by <b className="font-semibold text-muted">Voxera</b></p>
      </div>
    </div>
  )
}
