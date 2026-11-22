import { describe, expect, test } from 'vitest'
import { loadHostedConfig } from './config.js'

const env = {
  BLUEFOX_BASE_URL: 'https://api.bluefox.email/',
  PUBLIC_URL: 'https://mcp.bluefox.email',
  APP_URL: 'https://app.bluefox.email/',
  MCP_OAUTH_SECRET: 'secret'
}

describe('loadHostedConfig', () => {
  test('reads every setting and defaults the port', () => {
    expect(loadHostedConfig(env)).toEqual({
      port: 3333,
      baseUrl: 'https://api.bluefox.email',
      publicUrl: 'https://mcp.bluefox.email',
      appUrl: 'https://app.bluefox.email/',
      secret: 'secret'
    })
  })

  test('uses PORT when set', () => {
    expect(loadHostedConfig({ ...env, PORT: '4000' }).port).toBe(4000)
  })

  test('lists every missing variable', () => {
    expect(() => loadHostedConfig({})).toThrow('Missing required environment variable(s): BLUEFOX_BASE_URL, PUBLIC_URL, APP_URL, MCP_OAUTH_SECRET.')
  })
})
