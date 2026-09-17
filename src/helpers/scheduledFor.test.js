import { describe, expect, test } from 'vitest'
import { ResolveError } from './errors.js'
import { normalizeScheduledFor } from './scheduledFor.js'

describe('normalizeScheduledFor', () => {
  test('normalises an offset date-time to ISO 8601 UTC', () => {
    expect(normalizeScheduledFor('2026-09-10T08:00:00-05:00')).toBe('2026-09-10T13:00:00.000Z')
  })

  test('passes a value that is already ISO 8601 UTC through unchanged', () => {
    expect(normalizeScheduledFor('2026-08-01T08:00:00.000Z')).toBe('2026-08-01T08:00:00.000Z')
  })

  test('throws a ResolveError for an unparseable date-time', () => {
    expect(() => normalizeScheduledFor('tomorrow at 8am')).toThrow(ResolveError)
    expect(() => normalizeScheduledFor('tomorrow at 8am')).toThrow('is not a valid date-time')
  })
})
