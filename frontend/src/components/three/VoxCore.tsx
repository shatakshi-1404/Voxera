import { useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { OrbFallback } from './OrbFallback'

const CoreScene = lazy(() => import('./CoreScene'))
const webglOk = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }

/** Decorative hero visual. Desktop + WebGL + no reduced-motion → live 3D; otherwise a lightweight CSS orb. Pauses off-screen / hidden tab. */
export default function VoxCore({ className }: { className?: string }) {
  const reduce = useReducedMotion(), ref = useRef<HTMLDivElement>(null)
  const [ok, setOk] = useState(false), [vis, setVis] = useState(true), [tab, setTab] = useState(true)
  useEffect(() => {
    setOk(webglOk() && window.matchMedia('(min-width: 1024px)').matches)
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { threshold: 0.05 }); io.observe(el)
    const v = () => setTab(!document.hidden); document.addEventListener('visibilitychange', v)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', v) }
  }, [])
  return (
    <div ref={ref} className={className} aria-hidden>
      {ok && !reduce ? <Suspense fallback={<OrbFallback state="idle" />}><CoreScene active={vis && tab} /></Suspense> : <OrbFallback state="idle" />}
    </div>
  )
}
