import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useUI } from './stores/ui'

const applyTheme = (d: boolean) => document.documentElement.classList.toggle('dark', d)
applyTheme(useUI.getState().dark)
useUI.subscribe((st) => applyTheme(st.dark))
import './index.css'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } })

class Boundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  state: { err?: Error } = {}
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div><h1 className="text-lg font-semibold">Something went wrong</h1><p className="mt-1 text-sm text-muted">{this.state.err.message}</p>
          <button className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent" onClick={() => location.reload()}>Reload</button></div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Boundary><QueryClientProvider client={qc}><MotionConfig reducedMotion="user"><BrowserRouter><App /></BrowserRouter></MotionConfig></QueryClientProvider></Boundary>,
)
