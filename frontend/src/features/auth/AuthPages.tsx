import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BookOpen, Check, ExternalLink, Eye, EyeOff, Loader2, Mail, Sparkles, UserPlus } from 'lucide-react'
import { forwardRef, lazy, Suspense, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '../../components/layout/AppShell'
import { OrbFallback } from '../../components/three/OrbFallback'
import { Button, Card, FieldError, Input, Label } from '../../components/ui'
import { api } from '../../lib/api'
import { dur, ease, riseIn, stagger, tx } from '../../lib/motion'
import { useAuth } from '../../stores/auth'

const VoxCore = lazy(() => import('../../components/three/VoxCore'))

function BrandPanel() {
  return (
    <div className="ambient relative hidden flex-1 overflow-hidden bg-bg lg:block">
      <div className="grid-bg absolute inset-0 opacity-80 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Logo size={38} /><span className="font-display text-xl font-bold tracking-tight">Voxera</span></div>
          <span className="eyebrow flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 py-1.5"><span className="relative grid h-2 w-2 place-items-center"><span className="absolute h-full w-full animate-ping rounded-full bg-mint opacity-60" /><span className="h-1.5 w-1.5 rounded-full bg-mint" /></span>AI customer experience platform</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-[7%] mx-auto aspect-square w-[min(32rem,68%)]">
          <Suspense fallback={<OrbFallback state="idle" />}><VoxCore className="h-full w-full" /></Suspense>
        </div>
        <div className="relative mt-auto">
          <h2 className="max-w-xl font-display text-5xl font-bold leading-[1.02] tracking-tight xl:text-6xl">Conversations, <span className="text-gradient">intelligently</span> connected.</h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">One workspace for AI chat, live voice and your support team — every conversation understood and resolved.</p>
          <p className="eyebrow mt-8 flex gap-5"><span>Chat</span><span>Voice</span><span>Tickets</span><span>Insights</span></p>
        </div>
      </div>
    </div>
  )
}

function Frame({ title, sub, children, footer }: { title: string; sub: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <BrandPanel />
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-[34rem] lg:shrink-0 lg:border-l lg:border-line xl:w-[38rem] xl:px-20 glass">
        <motion.div variants={stagger} initial="initial" animate="animate" className="mx-auto w-full max-w-sm">
          <motion.div variants={riseIn} className="mb-8 flex items-center gap-3 lg:hidden"><Logo /><span className="font-display text-lg font-bold">Voxera</span></motion.div>
          <motion.h1 variants={riseIn} className="font-display text-4xl font-bold tracking-tight">{title}</motion.h1>
          <motion.p variants={riseIn} className="mb-8 mt-2 text-sm text-muted">{sub}</motion.p>
          <motion.div variants={riseIn}>{children}</motion.div>
          {footer && <motion.div variants={riseIn} className="mt-6 text-center text-sm text-muted">{footer}</motion.div>}
        </motion.div>
      </div>
    </div>
  )
}

const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { show: boolean; onToggle: () => void }>(({ show, onToggle, ...p }, ref) => {
  return (
    <div className="relative"><Input ref={ref} {...p} type={show ? 'text' : 'password'} className="pr-11" />
      <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint transition hover:text-ink">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
  )
})
const Submit = ({ pending, children, pendingText }: { pending: boolean; children: ReactNode; pendingText: string }) => (
  <Button className="w-full py-3" disabled={pending}>{pending ? <><Loader2 size={16} className="animate-spin" />{pendingText}</> : <>{children}<ArrowRight size={16} /></>}</Button>
)
const ServerError = ({ msg }: { msg?: string }) => msg ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{msg}</div> : null

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password required') })
export function Login() {
  const nav = useNavigate(), setSession = useAuth((s) => s.setSession), [show, setShow] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: 'admin@voxera.dev', password: 'Voxera@123' } })
  const m = useMutation({ mutationFn: (b: z.infer<typeof loginSchema>) => api('/auth/login', { body: b, token: null }), onSuccess: (s) => { setSession(s); nav('/') } })
  return (
    <Frame title="Welcome back" sub="Sign in to your support workspace" footer={<>New to Voxera? <Link className="font-medium text-accent hover:underline" to="/signup">Create workspace</Link></>}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
        <div><Label>Email</Label><Input type="email" aria-label="Email" autoComplete="email" {...register('email')} /><FieldError msg={errors.email?.message} /></div>
        <div><div className="mb-1.5 flex items-center justify-between"><label className="text-xs font-medium text-muted">Password</label><Link className="text-xs font-medium text-accent hover:underline" to="/forgot">Forgot password?</Link></div>
          <PasswordInput show={show} onToggle={() => setShow((s) => !s)} aria-label="Password" autoComplete="current-password" {...register('password')} /><FieldError msg={errors.password?.message} /></div>
        <ServerError msg={m.error ? (m.error as Error).message : undefined} />
        <Submit pending={m.isPending} pendingText="Signing in…">Sign in</Submit>
      </form>
    </Frame>
  )
}

const signupSchema = z.object({ full_name: z.string().min(2), org_name: z.string().min(2, 'Organization name required'), email: z.string().email(), password: z.string().min(8, 'At least 8 characters') })
export function Signup() {
  const nav = useNavigate(), setSession = useAuth((s) => s.setSession), [show, setShow] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) })
  const m = useMutation({ mutationFn: (b: z.infer<typeof signupSchema>) => api('/auth/signup', { body: b, token: null }), onSuccess: (s) => { setSession(s); nav('/onboarding') } })
  return (
    <Frame title="Create your workspace" sub="Set up Voxera for your support team" footer={<>Have an account? <Link className="font-medium text-accent hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Your name</Label><Input aria-label="Your name" autoComplete="name" {...register('full_name')} /><FieldError msg={errors.full_name?.message ? 'Enter your name' : undefined} /></div>
          <div><Label>Organization</Label><Input aria-label="Organization" {...register('org_name')} /><FieldError msg={errors.org_name?.message} /></div>
        </div>
        <div><Label>Work email</Label><Input type="email" aria-label="Work email" autoComplete="email" {...register('email')} /><FieldError msg={errors.email?.message ? 'Enter a valid email' : undefined} /></div>
        <div><Label>Password</Label><PasswordInput show={show} onToggle={() => setShow((s) => !s)} aria-label="Password" autoComplete="new-password" {...register('password')} /><FieldError msg={errors.password?.message} /></div>
        <ServerError msg={m.error ? (m.error as Error).message : undefined} />
        <Submit pending={m.isPending} pendingText="Creating workspace…">Create workspace</Submit>
      </form>
    </Frame>
  )
}

export function Forgot() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit } = useForm<{ email: string }>()
  const m = useMutation({ mutationFn: (b: { email: string }) => api('/auth/forgot-password', { body: b, token: null }), onSuccess: () => setSent(true) })
  return (
    <Frame title="Reset password" sub="We'll send reset instructions" footer={<Link className="inline-flex items-center gap-1 font-medium text-accent hover:underline" to="/login"><ArrowLeft size={14} />Back to sign in</Link>}>
      {sent ? (
        <div className="rounded-2xl border border-mint/25 bg-mint/10 p-4 text-sm"><p className="mb-1 flex items-center gap-2 font-semibold text-mint"><Mail size={16} />Check your inbox</p>
          <p className="text-muted">If that account exists, a reset link has been generated. (In this demo the token is written to the backend log.)</p></div>
      ) : (
        <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4">
          <div><Label>Email</Label><Input type="email" aria-label="Email" required autoComplete="email" {...register('email')} /></div>
          <Submit pending={m.isPending} pendingText="Sending…">Send reset link</Submit>
        </form>
      )}
    </Frame>
  )
}

export function Onboarding() {
  const org = useAuth((s) => s.org)
  const link = `${location.origin}/chat/${org?.slug}`
  const steps = [
    { icon: <BookOpen size={22} />, title: 'Add your policies', text: 'Upload return, shipping and FAQ documents so the AI answers from real policy.', to: '/knowledge', cta: 'Open Knowledge Library' },
    { icon: <UserPlus size={22} />, title: 'Invite your team', text: 'Add agents and managers who will take over escalated conversations.', to: '/team', cta: 'Open Team' },
    { icon: <Sparkles size={22} />, title: 'Tune your AI agent', text: 'Set personality, languages and escalation rules.', to: '/ai-config', cta: 'Open AI Configuration' },
    { icon: <Check size={22} />, title: 'Share your chat link', text: 'This public link lets your customers start a conversation with your AI agent.', to: '', cta: '' },
  ]
  const [i, setI] = useState(0), [dir, setDir] = useState(1), s = steps[i]
  const go = (n: number) => { setDir(n > i ? 1 : -1); setI(n) }
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-10">
      <h1 className="font-display text-4xl font-bold tracking-tight">Welcome to {org?.name} 👋</h1>
      <p className="mb-8 mt-2 text-sm text-muted">A few quick steps to get your AI support live.</p>
      <div className="mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label="Setup progress">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted"><span>Step {i + 1} of {steps.length}</span><span>{s.title}</span></div>
        <div className="flex gap-1.5">{steps.map((_, n) => <div key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2" initial={false} animate={{ width: n <= i ? '100%' : '0%' }} transition={tx(dur.page)} /></div>)}</div>
      </div>
      <Card className="overflow-hidden p-6 md:p-8">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={i} initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: dur.base, ease }}>
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-tint text-accent">{s.icon}</div>
            <h2 className="font-display text-xl font-bold">{s.title}</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted">{s.text}</p>
            {s.to ? <Link to={s.to} className="mt-5 inline-block"><Button variant="secondary">{s.cta}<ArrowRight size={15} /></Button></Link> : (
              <a href={link} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 break-all rounded-xl bg-soft px-4 py-3 text-sm font-medium text-accent hover:underline">{link}<ExternalLink size={14} /></a>
            )}
          </motion.div>
        </AnimatePresence>
      </Card>
      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" onClick={() => go(i - 1)} disabled={i === 0}><ArrowLeft size={15} />Back</Button>
        {i < steps.length - 1 ? <Button onClick={() => go(i + 1)}>Next<ArrowRight size={15} /></Button> : <Link to="/"><Button>Go to dashboard<ArrowRight size={15} /></Button></Link>}
      </div>
    </div>
  )
}
