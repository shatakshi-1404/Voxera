import { useEffect, useRef } from 'react'
import { API_ORIGIN } from './api'
import type { WSEvent } from '../types'

function wsBase() {
  if (API_ORIGIN) return API_ORIGIN.replace(/^http/, 'ws') + '/api/v1' // https -> wss
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1`
}

/** Reconnecting WebSocket. `path` e.g. `/stream?token=...` (null disables). */
export function useSocket(path: string | null, onEvent: (e: WSEvent) => void) {
  const ref = useRef(onEvent)
  ref.current = onEvent
  useEffect(() => {
    if (!path) return
    let ws: WebSocket | null = null, closed = false, retry = 0, timer: number | undefined, ping: number | undefined
    const connect = () => {
      ws = new WebSocket(`${wsBase()}${path}`)
      ws.onopen = () => { retry = 0; ping = window.setInterval(() => ws?.readyState === 1 && ws.send('{"type":"ping"}'), 25000) }
      ws.onmessage = (m) => { try { ref.current(JSON.parse(m.data)) } catch { /* ignore */ } }
      ws.onclose = () => { clearInterval(ping); if (!closed) timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000)) }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); clearInterval(ping); ws?.close() }
  }, [path])
}
