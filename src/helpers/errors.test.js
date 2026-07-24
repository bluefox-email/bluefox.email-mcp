import { describe, expect, test } from 'vitest'
import { BluefoxApiError, ResolveError, toToolResult, textResult } from './errors.js'

describe('BluefoxApiError', () => {
  test('uses the API error name/message when given', () => {
    const err = new BluefoxApiError(404, { name: 'NOT_FOUND', message: 'Campaign not found.' })
    expect(err.status).toBe(404)
    expect(err.name).toBe('NOT_FOUND')
    expect(err.message).toBe('Campaign not found.')
  })

  test('falls back to a generic message/name when no error body is given', () => {
    const err = new BluefoxApiError(500, undefined)
    expect(err.name).toBe('UNKNOWN_ERROR')
    expect(err.message).toBe('Request failed with status 500')
  })
})

describe('toToolResult', () => {
  test('rewrites AUTHORIZATION_ERROR into an actionable message', () => {
    const err = new BluefoxApiError(403, { name: 'AUTHORIZATION_ERROR', message: 'Permission denied.' })
    const result = toToolResult(err)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('BLUEFOX_PROJECT_ID and BLUEFOX_API_KEY')
  })

  test('relays every other BluefoxApiError message as-is', () => {
    const err = new BluefoxApiError(409, { name: 'CONFLICT_ERROR', message: 'This email is already in the suppression list.' })
    const result = toToolResult(err)
    expect(result.content[0].text).toBe('This email is already in the suppression list.')
  })

  test('relays a ResolveError message as-is', () => {
    const err = new ResolveError('No subscriber list named "Newsletter" found.')
    const result = toToolResult(err)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('No subscriber list named "Newsletter" found.')
  })

  test('wraps an unexpected error with a generic prefix', () => {
    const result = toToolResult(new TypeError('fetch failed'))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Something went wrong talking to bluefox.email: fetch failed')
  })
})

describe('textResult', () => {
  test('wraps plain text with no isError flag', () => {
    const result = textResult('Created campaign "Summer Sale".')
    expect(result).toEqual({ content: [{ type: 'text', text: 'Created campaign "Summer Sale".' }] })
  })
})
