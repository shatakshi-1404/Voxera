export type OrbState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'disconnected' | 'error'
/** speed/amp drive the surface motion; `audio` = this state may be modulated by a REAL audio level (never faked). */
export const ORB_PARAMS: Record<OrbState, { speed: number; amp: number; color: string; audio: boolean; label: string }> = {
  idle: { speed: 0.3, amp: 0.07, color: '#FF7A45', audio: false, label: 'Idle' },
  connecting: { speed: 1.3, amp: 0.11, color: '#FF9F6B', audio: false, label: 'Connecting' },
  listening: { speed: 0.75, amp: 0.1, color: '#FF7A45', audio: true, label: 'Listening' },
  processing: { speed: 2.1, amp: 0.16, color: '#FFC857', audio: false, label: 'Processing' },
  speaking: { speed: 1.1, amp: 0.13, color: '#5EEAD4', audio: true, label: 'Speaking' },
  disconnected: { speed: 0.08, amp: 0.02, color: '#6F675E', audio: false, label: 'Disconnected' },
  error: { speed: 0.5, amp: 0.05, color: '#FF5C7A', audio: false, label: 'Error' },
}
