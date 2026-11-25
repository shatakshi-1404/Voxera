import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '../types'

interface Session { access_token: string; role: Role; user: { id: string; email: string; full_name: string }; organization: { id: string; name: string; slug: string } }
interface AuthState {
  token: string | null; role: Role | null; user: Session['user'] | null; org: Session['organization'] | null
  setSession: (s: Session) => void; logout: () => void
}
export const useAuth = create<AuthState>()(persist((set) => ({
  token: null, role: null, user: null, org: null,
  setSession: (s) => set({ token: s.access_token, role: s.role, user: s.user, org: s.organization }),
  logout: () => set({ token: null, role: null, user: null, org: null }),
}), { name: 'voxera-auth' }))
