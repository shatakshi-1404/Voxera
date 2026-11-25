import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Room, RoomEvent, Track } from 'livekit-client'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Globe2, Headphones, Mic, MicOff, Phone, PhoneOff, User, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { lazy, Suspense } from 'react'
import { OrbFallback } from '../../components/three/OrbFallback'
import type { OrbState } from '../../components/three/orbTypes'
import { ORB_PARAMS } from '../../components/three/orbTypes'
import { Badge, Button, Card, Empty, ErrorNote, Label, Modal, Page, PageHeader, Rise, Select, SectionHeader, cn } from '../../components/ui'
import { msgIn } from '../../lib/motion'
import { api } from '../../lib/api'
import { useBus } from '../../lib/bus'
import { fmtDur, fmtDate } from '../../lib/utils'
import { useUI } from '../../stores/ui'
import type { Customer } from '../../types'

const VoiceOrb = lazy(() => import('../../components/three/VoiceOrb'))
type Phase = 'idle' | 'listening' | 'transcribing' | 'understanding' | 'generating' | 'speaking'
const STEPS: [Phase, string][] = [['listening', 'Listening'], ['transcribing', 'Transcribing'], ['understanding', 'Understanding'], ['generating', 'Generating response'], ['speaking', 'Speaking']]
interface Line { speaker: 'customer' | 'ai'; text: string; latency_ms?: number }

export default function VoiceStudio() {
  const qc = useQueryClient(), toast = useUI((s) => s.toast)
  const customers = useQuery({ queryKey: ['customers', ''], queryFn: () => api<Customer[]>('/customers') })
  const history = useQuery({ queryKey: ['voice-sessions'], queryFn: () => api<any[]>('/voice/sessions') })
  const [custId, setCustId] = useState(''), [lang, setLang] = useState('en')
  const [active, setActive] = useState<{ sid: string; cid: string } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle'), [muted, setMuted] = useState(false), [secs, setSecs] = useState(0)
  const [lines, setLines] = useState<Line[]>([]), [interrupted, setInterrupted] = useState(false), [human, setHuman] = useState(false)
  const [micError, setMicError] = useState<string | null>(null), [viewing, setViewing] = useState<string | null>(null)
  const room = useRef<Room | null>(null), canvas = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle'), activeRef = useRef(active)
  const audio = useRef<{ ctx?: AudioContext; local?: AnalyserNode; remote?: AnalyserNode }>({})
  const raf = useRef(0), levelRef = useRef(0), tBox = useRef<HTMLDivElement>(null)
  activeRef.current = active
  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p) }

  // live transcript + pipeline state from backend events
  useBus((e) => {
    if (!activeRef.current || e.conversation_id !== activeRef.current.cid) return
    if (e.type === 'voice.transcript.updated') {
      setLines((l) => [...l, { speaker: e.payload.speaker, text: e.payload.text, latency_ms: e.payload.latency_ms }])
      if (e.payload.speaker === 'customer') { setP('understanding'); setTimeout(() => phaseRef.current === 'understanding' && setP('generating'), 350) }
      else setP('speaking')
    }
    if (e.type === 'conversation.takeover') setHuman(true)
  })

  useEffect(() => { if (!active) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [active])

  const attach = (stream: MediaStream, which: 'local' | 'remote') => {
    const a = audio.current
    a.ctx ??= new AudioContext()
    const an = a.ctx.createAnalyser(); an.fftSize = 128
    a.ctx.createMediaStreamSource(stream).connect(an)
    a[which] = an
  }

  const draw = useCallback(() => {
    const cv = canvas.current
    if (cv) {
      const g = cv.getContext('2d')!, W = cv.width, H = cv.height
      g.clearRect(0, 0, W, H)
      const bars = 48, pick = (an?: AnalyserNode) => { if (!an) return null; const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d); return d }
      const l = pick(audio.current.local), r = pick(audio.current.remote)
      const lv = l ? l.reduce((a, b) => a + b, 0) : 0, rv = r ? r.reduce((a, b) => a + b, 0) : 0
      const src = rv > lv ? r : l, color = rv > lv ? '#5EEAD4' : '#FF7A45'
      // real measured level for the orb (0 when there is no analyser yet — the orb never fakes audio)
      const lvSrc = phaseRef.current === 'speaking' ? r : l
      levelRef.current = lvSrc ? Math.min(1, (lvSrc.reduce((a, b) => a + b, 0) / lvSrc.length / 255) * 2.2) : 0
      for (let i = 0; i < bars; i++) {
        const v = src ? src[Math.floor((i / bars) * src.length)] / 255 : 0, h = Math.max(4, v * H * 0.9)
        g.fillStyle = color; g.globalAlpha = src ? 0.9 : 0.2
        g.beginPath(); g.roundRect((i * W) / bars + 2, (H - h) / 2, W / bars - 4, h, 4); g.fill()
      }
    }
    raf.current = requestAnimationFrame(draw)
  }, [])
  // only run the render loop while a call is live (saves CPU/GPU when idle)
  useEffect(() => {
    if (!active) { canvas.current?.getContext('2d')?.clearRect(0, 0, 900, 160); levelRef.current = 0; return }
    raf.current = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf.current)
  }, [draw, active])
  useEffect(() => { tBox.current?.scrollTo({ top: tBox.current.scrollHeight, behavior: 'smooth' }) }, [lines.length])

  const start = useMutation({
    mutationFn: () => api<any>('/voice/sessions', { body: { customer_id: custId || null, language: lang } }),
    onSuccess: async (res) => {
      setLines([]); setSecs(0); setHuman(false); setMicError(null)
      const r = new Room({ audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      room.current = r
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return
        const el = track.attach(); el.style.display = 'none'; document.body.appendChild(el)
        attach(new MediaStream([track.mediaStreamTrack]), 'remote')
      })
      r.on(RoomEvent.ActiveSpeakersChanged, (sp) => {
        const me = sp.some((s) => s.isLocal), ai = sp.some((s) => !s.isLocal)
        if (me) { if (phaseRef.current === 'speaking') { setInterrupted(true); setTimeout(() => setInterrupted(false), 1800) } setP('listening') }
        else if (ai) setP('speaking')
        else if (phaseRef.current === 'listening') setP('transcribing')
        else if (phaseRef.current === 'speaking') setP('listening')
      })
      r.on(RoomEvent.Disconnected, () => setP('idle'))
      try {
        await r.connect(res.livekit_url, res.token)
        await r.localParticipant.setMicrophoneEnabled(true)
        const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (pub?.track) attach(new MediaStream([pub.track.mediaStreamTrack]), 'local')
        setActive({ sid: res.voice_session.id, cid: res.conversation_id }); setP('listening')
      } catch (e: any) {
        const denied = e?.name === 'NotAllowedError' || /permission/i.test(e?.message ?? '')
        setMicError(denied ? 'Microphone permission was blocked. Allow it in your browser address bar and try again.' : `Could not connect: ${e?.message}`)
        r.disconnect(); await api(`/voice/sessions/${res.voice_session.id}/end`, { method: 'POST' }).catch(() => {})
      }
    },
    onError: (e: Error) => setMicError(e.message),
  })

  const end = useMutation({
    mutationFn: () => api(`/voice/sessions/${active!.sid}/end`, { method: 'POST' }),
    onSuccess: () => { toast({ title: 'Call ended', body: 'Summary saved to call history', tone: 'success' }); qc.invalidateQueries({ queryKey: ['voice-sessions'] }) },
    onSettled: () => { room.current?.disconnect(); setActive(null); setP('idle'); setMuted(false) },
  })
  const transfer = useMutation({ mutationFn: () => api(`/conversations/${active!.cid}/takeover`, { method: 'POST', body: {} }), onSuccess: () => { setHuman(true); toast({ title: 'Human agent in control', body: 'The AI will stay silent for the rest of this call.' }) } })
  const toggleMute = () => { room.current?.localParticipant.setMicrophoneEnabled(muted); setMuted(!muted) }
  useEffect(() => () => { room.current?.disconnect(); audio.current.ctx?.close() }, [])

  const orbState: OrbState = start.isPending ? 'connecting' : micError && !active ? 'error' : !active ? 'idle'
    : phase === 'idle' ? 'disconnected' : phase === 'listening' ? 'listening' : phase === 'speaking' ? 'speaking' : 'processing'
  const caller = customers.data?.find((c) => c.id === custId)?.name ?? 'Unknown caller'
  const stepIdx = STEPS.findIndex(([k]) => k === phase)

  return (
    <Page wide>
      <PageHeader title="Voice Studio" sub="Live voice calls with a synchronized transcript, AI state and tool activity" />
      <div className="grid gap-5 lg:grid-cols-5">
        <Rise className="lg:col-span-3"><Card className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="relative p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {active ? <Badge tone="mint"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />Live · {fmtDur(secs)}</Badge> : <Badge>{start.isPending ? 'Connecting…' : 'Ready'}</Badge>}
              <Badge tone={orbState === 'error' ? 'rose' : orbState === 'disconnected' ? 'amber' : 'indigo'}>{ORB_PARAMS[orbState].label}</Badge>
              {human && <Badge tone="amber">Human in control</Badge>}
              <AnimatePresence>{interrupted && <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><Badge tone="rose"><Zap size={10} />Barge-in: AI stopped</Badge></motion.span>}</AnimatePresence>
            </div>

            <div className="mx-auto my-2 aspect-square w-[min(19rem,72vw)] sm:w-[22rem]">
              <Suspense fallback={<OrbFallback state={orbState} />}><VoiceOrb state={orbState} levelRef={levelRef} className="h-full w-full" /></Suspense>
            </div>
            <canvas ref={canvas} width={900} height={160} className="mx-auto h-14 w-full max-w-lg" aria-label="Live audio waveform" />
            <p className="mb-4 mt-1 text-center text-[11px] text-faint">{active ? 'Waveform and orb react to the measured microphone / AI audio level' : 'Start a call to begin'}</p>

            <ol className="mb-6 flex flex-wrap justify-center gap-1.5" aria-label="Conversation state">
              {STEPS.map(([k, label], i) => (
                <li key={k}><span aria-current={phase === k ? 'step' : undefined} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition duration-base', phase === k ? 'bg-accent text-on-accent shadow-glow' : active && i < stepIdx ? 'bg-tint text-accent' : 'bg-soft text-muted')}>{label}</span></li>
              ))}
            </ol>
            {micError && <div role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">{micError}</div>}
            {!active ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                <div><Label>Caller (simulated customer)</Label><Select value={custId} onChange={(e) => setCustId(e.target.value)}><option value="">Unknown caller</option>{customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
                <div><Label>Language</Label><Select value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish</option></Select></div>
                <Button className="py-2.5" onClick={() => start.mutate()} disabled={start.isPending}><Phone size={16} />{start.isPending ? 'Connecting…' : 'Start call'}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="secondary" onClick={toggleMute}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? 'Unmute' : 'Mute'}</Button>
                <Button variant="secondary" onClick={() => transfer.mutate()} disabled={human}><Headphones size={16} />Transfer to human</Button>
                <Button variant="danger" onClick={() => end.mutate()}><PhoneOff size={16} />End call</Button>
              </div>
            )}
            <p className="mt-5 text-center text-xs text-faint">Needs the voice worker running (<code>python voice_worker.py dev</code>) plus LiveKit, Deepgram and ElevenLabs keys. The AI will say it may ask for the last 4 digits of the registered phone.</p>
          </div>
        </Card></Rise>

        <div className="flex flex-col gap-5 lg:col-span-2">
          <Rise><Card className="grid grid-cols-3 divide-x divide-line">
            {[[<User size={14} key="u" />, 'Caller', active ? caller : custId ? caller : '—'], [<Globe2 size={14} key="g" />, 'Language', lang.toUpperCase()], [<Clock size={14} key="c" />, 'Duration', active ? fmtDur(secs) : '—']].map(([ic, k, v], i) => (
              <div key={i} className="min-w-0 p-4"><p className="flex items-center gap-1.5 text-[11px] text-muted">{ic}{k}</p><p className="mt-1 truncate text-sm font-semibold">{v}</p></div>))}
          </Card></Rise>
          <Rise className="min-h-0 flex-1"><Card className="flex h-[30rem] flex-col lg:h-full lg:max-h-[34rem]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><p className="text-sm font-semibold">Live transcript</p>{active && <Badge tone="mint"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />Live</Badge>}</div>
            <div ref={tBox} className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
              {!lines.length ? <Empty icon={<Mic size={20} />} title="No speech yet" hint="Transcript appears here as you and the AI talk." /> : lines.map((l, i) => (
                <motion.div key={i} variants={msgIn} initial="initial" animate="animate" className={cn('flex flex-col', l.speaker === 'customer' ? 'items-start' : 'items-end')}>
                  <div className={cn('max-w-[88%] rounded-2xl px-3.5 py-2 text-sm', l.speaker === 'customer' ? 'rounded-bl-md bg-soft' : 'rounded-br-md bg-tint text-ink')}>{l.text}</div>
                  <span className="mt-1 text-[11px] text-faint">{l.speaker === 'customer' ? 'Customer' : 'Voxera AI'}{l.latency_ms ? ` · ${l.latency_ms} ms` : ''}</span>
                </motion.div>))}
            </div>
          </Card></Rise>
        </div>
      </div>

      <div className="mt-8"><SectionHeader title="Call history" sub="Past voice sessions" /></div>
      <Rise><Card className="overflow-hidden">
        {history.error ? <ErrorNote error={history.error} /> : !history.data?.length ? <Empty icon={<Phone size={20} />} title="No calls yet" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-line bg-soft/50"><th className="th">Started</th><th className="th">Duration</th><th className="th">Avg latency</th><th className="th hidden md:table-cell">Summary</th><th className="th" /></tr></thead>
            <tbody>{history.data.map((s) => (
              <tr key={s.id} className="border-b border-line/70 transition hover:bg-soft/50 last:border-0"><td className="px-4 py-3">{fmtDate(s.started_at)} {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4">{s.duration_sec != null ? fmtDur(s.duration_sec) : <Badge tone="mint">Live</Badge>}</td><td className="px-4">{s.avg_latency_ms ? `${Math.round(s.avg_latency_ms)} ms` : '—'}</td>
                <td className="hidden max-w-sm truncate px-4 text-muted md:table-cell">{s.summary ?? '—'}</td><td className="px-4 text-right"><Button size="sm" variant="ghost" onClick={() => setViewing(s.id)}>Transcript</Button></td></tr>))}</tbody></table></div>
        )}
      </Card></Rise>
      <TranscriptModal id={viewing} onClose={() => setViewing(null)} />
    </Page>
  )
}

function TranscriptModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['transcript', id], queryFn: () => api<any>(`/voice/sessions/${id}/transcript`), enabled: !!id })
  return (
    <Modal open={!!id} onClose={onClose} title="Call transcript" wide>
      {q.data?.session.summary && <p className="mb-3 rounded-xl bg-soft p-3 text-sm">{q.data.session.summary}</p>}
      <div className="space-y-2">{q.data?.segments.map((s: any) => <p key={s.id} className="text-sm"><b className={s.speaker === 'ai' ? 'text-accent' : ''}>{s.speaker === 'ai' ? 'AI' : 'Customer'}:</b> {s.text}</p>)}</div>
      {q.data && !q.data.segments.length && <p className="text-sm text-muted">No speech was captured.</p>}
    </Modal>
  )
}
