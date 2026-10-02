import { describe, expect, test } from 'vitest'
import { buildStatsQuery, formatTimeline } from './statsTimeline.js'

const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T23:59:59.999Z', timeZone: 'UTC' }

describe('buildStatsQuery', () => {
  test('passes only the range and timeline params through', () => {
    expect(buildStatsQuery({ type: 'campaign', emailId: 'c1', from: '2026-10-01', interval: 'hourly', metric: 'opens', timeZone: 'Europe/Budapest' }))
      .toEqual({ from: '2026-10-01', to: undefined, interval: 'hourly', metric: 'opens', timeZone: 'Europe/Budapest' })
  })
})

describe('formatTimeline', () => {
  test('lists count metrics with their rate, skipping empty periods', () => {
    const text = formatTimeline({
      ...range,
      interval: 'hourly',
      metric: 'opens',
      buckets: [
        { period: '2026-10-01 09:00', count: 0, rate: 0 },
        { period: '2026-10-01 10:00', count: 12, rate: 4.5 }
      ]
    })

    expect(text).toBe('hourly "opens" from 2026-10-01 to 2026-10-01 (UTC):\n2026-10-01 10:00: 12 (4.5% of sent)\nPeriods not listed had 0.')
  })

  test('shows percentage metrics as a percentage', () => {
    const text = formatTimeline({ ...range, interval: 'daily', metric: 'clicksPerUniqueOpens', buckets: [{ period: '2026-10-01', rate: 50 }] })

    expect(text).toContain('2026-10-01: 50%')
  })

  test('shows subscription metrics, and count metrics without a computable rate, as a plain count', () => {
    const unsubscribes = formatTimeline({ ...range, interval: 'daily', metric: 'unsubscribe', buckets: [{ period: '2026-10-01', count: 3 }] })
    const noSends = formatTimeline({ ...range, interval: 'daily', metric: 'opens', buckets: [{ period: '2026-10-01', count: 2, rate: null }] })

    expect(unsubscribes).toContain('2026-10-01: 3\n')
    expect(noSends).toContain('2026-10-01: 2\n')
  })

  test('says so when nothing happened in the range', () => {
    const text = formatTimeline({ ...range, interval: 'daily', metric: 'sent', buckets: [{ period: '2026-10-01', count: 0, rate: null }] })

    expect(text).toBe('daily "sent" from 2026-10-01 to 2026-10-01 (UTC): nothing in this range.')
  })
})
