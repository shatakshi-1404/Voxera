import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Skeleton } from './components/ui'
import { RequireAuth } from './components/layout/AppShell'
import { Forgot, Login, Onboarding, Signup } from './features/auth/AuthPages'
const Insights = lazy(() => import('./features/analytics/Insights'))
const Customer360 = lazy(() => import('./features/customers/Customer360'))
const Customers = lazy(() => import('./features/customers/Customers').then((m) => ({ default: m.Customers })))
const Segments = lazy(() => import('./features/customers/Customers').then((m) => ({ default: m.Segments })))
const Overview = lazy(() => import('./features/dashboard/Overview'))
const Inbox = lazy(() => import('./features/inbox/Inbox'))
const Knowledge = lazy(() => import('./features/knowledge/Knowledge'))
const Playground = lazy(() => import('./features/playground/Playground'))
const ChatWidget = lazy(() => import('./features/public/ChatWidget'))
const AIConfig = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.AIConfig })))
const Integrations = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.Integrations })))
const SettingsPage = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.SettingsPage })))
const Team = lazy(() => import('./features/team/Team'))
const Tickets = lazy(() => import('./features/tickets/Tickets'))
const VoiceStudio = lazy(() => import('./features/voice/VoiceStudio'))

export default function App() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-64" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/chat/:slug" element={<ChatWidget />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Overview />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="inbox/:id" element={<Inbox />} />
        <Route path="voice" element={<VoiceStudio />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<Customer360 />} />
        <Route path="segments" element={<Segments />} />
        <Route path="playground" element={<Playground />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="ai-config" element={<AIConfig />} />
        <Route path="insights" element={<Insights />} />
        <Route path="team" element={<Team />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
