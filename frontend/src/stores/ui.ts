import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Toast { id: number; title: string; body?: string; tone?: 'info' | 'success' | 'warn' | 'error' }
interface UIState {
  dark: boolean; toggleDark: () => void; toasts: Toast[]; toast: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void
  unread: number; bump: () => void; clearUnread: () => void
}
let n = 0
export const useUI = create<UIState>()(persist((set, get) => ({
  dark: true,
  toggleDark: () => set({ dark: !get().dark }),
  toasts: [],
  toast: (t) => {
    const id = ++n
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  unread: 0, bump: () => set({ unread: get().unread + 1 }), clearUnread: () => set({ unread: 0 }),
}), { name: 'voxera-ui-v2', partialize: (s) => ({ dark: s.dark }) }))
