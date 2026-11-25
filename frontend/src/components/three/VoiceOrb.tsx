import { motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { cn } from '../ui'
import { OrbFallback } from './OrbFallback'
import { ORB_PARAMS, type OrbState } from './orbTypes'

const OrbScene = lazy(() => import('./OrbScene')) // three.js is only downloaded when an orb is shown

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

/**
 * The Voxera orb. `levelRef` (0..1) should only ever carry a real measured audio level —
 * when it is absent the orb animates from its state alone and does not pretend to hear anything.
 */
export default function VoiceOrb({ state, levelRef, className, ambient }: { state: OrbState; levelRef?: MutableRefObject<number>; className?: string; ambient?: boolean }) {
  const reduce = useReducedMotion(), wrap = useRef<HTMLDivElement>(null)
  const [gl, setGl] = useState<boolean | null>(null), [visible, setVisible] = useState(true), [tabVisible, setTabVisible] = useState(true)
  useEffect(() => { setGl(webglOk()) }, [])
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 }); io.observe(el)
    const vis = () => setTabVisible(!document.hidden); document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return (
    <div ref={wrap} className={cn('relative', className)} role="img" aria-label={`Voice orb: ${ORB_PARAMS[state].label}`}>
      <div className="absolute inset-[8%] rounded-full opacity-70 blur-3xl" style={{ background: `radial-gradient(circle, ${ORB_PARAMS[state].color}55, transparent 70%)` }} />
      {gl && !reduce ? (
        <Suspense fallback={<OrbFallback state={state} />}><div className="absolute inset-0"><OrbScene state={ambient ? 'idle' : state} levelRef={levelRef} active={visible && tabVisible} /></div></Suspense>
      ) : <OrbFallback state={state} />}
    </div>
  )
}
