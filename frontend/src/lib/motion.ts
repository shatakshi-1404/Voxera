import type { Transition, Variants } from 'framer-motion'

/** Voxera motion tokens — one easing, three durations. */
export const ease = [0.22, 1, 0.36, 1] as const
export const dur = { micro: 0.15, base: 0.22, page: 0.32 } as const
export const tx = (d: number = dur.base): Transition => ({ duration: d, ease })

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: tx(dur.page) },
}
export const stagger: Variants = { animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }
export const riseIn: Variants = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: tx() } }
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: tx() },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: tx(dur.micro) },
}
export const msgIn: Variants = { initial: { opacity: 0, y: 8, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1, transition: tx(dur.base) } }
export const tapScale = { whileTap: { scale: 0.97 }, transition: tx(dur.micro) }
