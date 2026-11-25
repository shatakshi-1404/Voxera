import { useEffect, useRef } from 'react'
import type { WSEvent } from '../types'

type Fn = (e: WSEvent) => void
const subs = new Set<Fn>()
export const publish = (e: WSEvent) => subs.forEach((f) => f(e))
/** Subscribe to org-wide realtime events (one socket lives in AppShell). */
export function useBus(fn: Fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const f: Fn = (e) => ref.current(e)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
}
