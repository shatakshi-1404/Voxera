import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, ConvBadge } from '../components/ui'
import { fmtDur, fmtSla, pct, qs } from '../lib/utils'

describe('utils', () => {
  it('formats durations and SLA', () => {
    expect(fmtDur(75)).toBe('1:15')
    expect(fmtSla(3700)).toBe('1h 1m')
    expect(fmtSla(-120)).toBe('-0h 2m')
  })
  it('pct and qs', () => {
    expect(pct(0.783)).toBe('78%'); expect(pct(null)).toBe('—')
    expect(qs({ a: '1', b: '' })).toBe('?a=1')
  })
})
describe('badges', () => {
  it('renders conversation ownership states', () => {
    render(<><ConvBadge c={{ status: 'open', handler: 'ai' }} /><ConvBadge c={{ status: 'escalated', handler: 'human' }} /><Badge>x</Badge></>)
    expect(screen.getByText('AI handling')).toBeTruthy(); expect(screen.getByText('Escalated')).toBeTruthy()
  })
})
