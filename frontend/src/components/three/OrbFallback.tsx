import { motion, useReducedMotion } from 'framer-motion'
import { ORB_PARAMS, type OrbState } from './orbTypes'

/** CSS/SVG fallback: same palette, state-driven motion, no WebGL needed. */
export function OrbFallback({ state }: { state: OrbState }) {
  const reduce = useReducedMotion(), P = ORB_PARAMS[state]
  return (
    <div className="relative grid h-full w-full place-items-center" aria-hidden>
      <motion.div className="aspect-square w-[62%] rounded-full" style={{ background: `radial-gradient(circle at 32% 28%, #fff9 0%, ${P.color} 38%, #6B2509 100%)`, boxShadow: `0 30px 80px -20px ${P.color}88, inset 0 -18px 40px #2a0e0344` }}
        animate={reduce ? undefined : { scale: [1, 1 + P.amp * 0.5, 1] }} transition={{ duration: 3 / (P.speed + 0.4), repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}
