import { describe, expect, test } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  test('returns baseUrl/projectId/apiKey when all env vars are present', () => {
    const config = loadConfig({
      BLUEFOX_BASE_URL: 'https://api.bluefox.email',
      BLUEFOX_PROJECT_ID: 'project123',
      BLUEFOX_API_KEY: 'key123'
    })
    expect(config).toEqual({
      baseUrl: 'https://api.bluefox.email',
      projectId: 'project123',
      apiKey: 'key123'
    })
  })

  test('strips a trailing slash from the base URL', () => {
    const config = loadConfig({
      BLUEFOX_BASE_URL: 'https://api.bluefox.email/',
      BLUEFOX_PROJECT_ID: 'project123',
      BLUEFOX_API_KEY: 'key123'
    })
    expect(config.baseUrl).toBe('https://api.bluefox.email')
  })

  test('throws listing every missing variable when none are set', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing required environment variable(s): BLUEFOX_BASE_URL, BLUEFOX_PROJECT_ID, BLUEFOX_API_KEY.'
    )
  })

  test('throws listing only the specific variable that is missing', () => {
    expect(() => loadConfig({
      BLUEFOX_BASE_URL: 'https://api.bluefox.email',
      BLUEFOX_PROJECT_ID: 'project123'
    })).toThrow('Missing required environment variable(s): BLUEFOX_API_KEY.')
  })
})
