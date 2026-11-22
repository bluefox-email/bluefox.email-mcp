import { describe, expect, test } from 'vitest'
import { createSealer } from './sealer.js'

describe('createSealer', () => {
  test('opens what it sealed', () => {
    const { seal, open } = createSealer('secret')
    expect(open(seal({ projectId: 'p1', apiKey: 'k1' }))).toEqual({ projectId: 'p1', apiKey: 'k1' })
  })

  test('returns undefined for a value sealed with another secret', () => {
    const value = createSealer('other').seal({ projectId: 'p1' })
    expect(createSealer('secret').open(value)).toBeUndefined()
  })

  test('returns undefined for a tampered or garbage value', () => {
    const { seal, open } = createSealer('secret')
    const value = seal({ projectId: 'p1' })
    const tampered = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA')
    expect(open(tampered)).toBeUndefined()
    expect(open('not-a-token')).toBeUndefined()
  })
})
