import { describe, expect, test, vi, afterEach } from 'vitest'
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { createSealer } from './sealer.js'
import { createOAuthProvider } from './oauthProvider.js'

const ACCOUNT_ID = '65bea83c0000000000000001'
const PROJECT_ID = '65bea83c0000000000000002'
const OTHER_PROJECT_ID = '65bea83c0000000000000003'

function mcpToken (payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

const TOKEN = mcpToken({ type: 'mcp', projects: [{ _id: PROJECT_ID, name: 'Shop' }, { _id: OTHER_PROJECT_ID, name: 'Blog' }] })

function setup () {
  const sealer = createSealer('secret')
  const provider = createOAuthProvider({ sealer, baseUrl: 'https://api.bluefox.email', appUrl: 'https://app.bluefox.email/' })
  const client = provider.clientsStore.registerClient({ client_name: 'Claude', redirect_uris: ['https://claude.ai/callback'] })
  return { sealer, provider, client }
}

function mockFetch (status, json) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => json })
}

async function startAuthorize (provider, client, params = {}) {
  const res = { redirect: vi.fn() }
  await provider.authorize(client, { redirectUri: 'https://claude.ai/callback', state: 'st1', codeChallenge: 'challenge1', ...params }, res)
  return new URL(res.redirect.mock.calls[0][0])
}

async function approveAndGetCode (provider, client) {
  const url = await startAuthorize(provider, client)
  mockFetch(200, { result: { token: TOKEN } })
  const result = await provider.approve({ request: url.searchParams.get('request'), accountId: ACCOUNT_ID, projectIds: [PROJECT_ID], accessToken: 'user-token' })
  return new URL(result.redirectUrl).searchParams.get('code')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('clientsStore', () => {
  test('registers a client into a sealed client_id and reads it back', () => {
    const { provider, client } = setup()
    expect(provider.clientsStore.getClient(client.client_id)).toEqual({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/callback'],
      client_id: client.client_id
    })
  })

  test('returns undefined for an unknown client_id', () => {
    const { provider, sealer } = setup()
    expect(provider.clientsStore.getClient('garbage')).toBeUndefined()
    expect(provider.clientsStore.getClient(sealer.seal({ type: 'access' }))).toBeUndefined()
  })
})

describe('authorize', () => {
  test('redirects to the app consent page with the client name and a sealed request', async () => {
    const { provider, client, sealer } = setup()
    const url = await startAuthorize(provider, client)

    expect(url.origin + url.pathname).toBe('https://app.bluefox.email/oauth/authorize')
    expect(url.searchParams.get('client')).toBe('Claude')
    expect(sealer.open(url.searchParams.get('request'))).toMatchObject({
      type: 'request',
      clientId: client.client_id,
      clientName: 'Claude',
      redirectUri: 'https://claude.ai/callback',
      state: 'st1',
      codeChallenge: 'challenge1'
    })
  })

  test('falls back to a generic name when the client has none', async () => {
    const { provider } = setup()
    const client = provider.clientsStore.registerClient({ redirect_uris: ['https://claude.ai/callback'] })
    const url = await startAuthorize(provider, client)
    expect(url.searchParams.get('client')).toBe('AI tool')
  })
})

describe('approve', () => {
  test('creates an MCP connection and redirects back with a code and the state', async () => {
    const { provider, client, sealer } = setup()
    const url = await startAuthorize(provider, client)
    const fetchSpy = mockFetch(200, { result: { token: TOKEN } })

    const result = await provider.approve({ request: url.searchParams.get('request'), accountId: ACCOUNT_ID, projectIds: [PROJECT_ID, OTHER_PROJECT_ID], accessToken: 'user-token' })

    expect(fetchSpy).toHaveBeenCalledWith(`https://api.bluefox.email/v1/accounts/${ACCOUNT_ID}/mcp-connections`, {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Claude', projectIds: [PROJECT_ID, OTHER_PROJECT_ID] })
    })
    const redirect = new URL(result.redirectUrl)
    expect(result.status).toBe(200)
    expect(redirect.origin + redirect.pathname).toBe('https://claude.ai/callback')
    expect(redirect.searchParams.get('state')).toBe('st1')
    expect(sealer.open(redirect.searchParams.get('code'))).toMatchObject({ type: 'code', token: TOKEN })
  })

  test('leaves state out when the client sent none', async () => {
    const { provider, client } = setup()
    const url = await startAuthorize(provider, client, { state: undefined })
    const result = await provider.approve({ request: url.searchParams.get('request'), denied: true })
    expect(new URL(result.redirectUrl).searchParams.has('state')).toBe(false)
  })

  test('redirects back with access_denied when the user denies', async () => {
    const { provider, client } = setup()
    const url = await startAuthorize(provider, client)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await provider.approve({ request: url.searchParams.get('request'), denied: true })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.redirectUrl).toBe('https://claude.ai/callback?state=st1&error=access_denied')
  })

  test('rejects an expired or invalid request', async () => {
    const { provider, sealer } = setup()
    const expired = sealer.seal({ type: 'request', redirectUri: 'https://claude.ai/callback', exp: 1 })

    expect(await provider.approve({ request: expired })).toEqual({ status: 400, error: 'This sign-in link has expired. Start connecting again from your AI tool.' })
    expect((await provider.approve({ request: 'garbage' })).status).toBe(400)
  })

  test('rejects an account id that is not an object id', async () => {
    const { provider, client } = setup()
    const url = await startAuthorize(provider, client)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await provider.approve({ request: url.searchParams.get('request'), accountId: '../admin', projectIds: [PROJECT_ID] })

    expect(result).toEqual({ status: 400, error: 'Log in again to connect.' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('passes the API error through when the connection cannot be created', async () => {
    const { provider, client } = setup()
    const url = await startAuthorize(provider, client)
    mockFetch(403, { error: { message: 'Permission denied.' } })

    const result = await provider.approve({ request: url.searchParams.get('request'), accountId: ACCOUNT_ID, projectIds: [PROJECT_ID], accessToken: 'bad' })

    expect(result).toEqual({ status: 403, error: 'Permission denied.' })
  })
})

describe('codes and tokens', () => {
  test('returns the code challenge and exchanges the code for the mcp token', async () => {
    const { provider, client } = setup()
    const code = await approveAndGetCode(provider, client)

    expect(await provider.challengeForAuthorizationCode(client, code)).toBe('challenge1')
    const tokens = await provider.exchangeAuthorizationCode(client, code, undefined, 'https://claude.ai/callback')
    expect(tokens).toEqual({ access_token: TOKEN, token_type: 'bearer' })
    expect((await provider.exchangeAuthorizationCode(client, code)).token_type).toBe('bearer')
  })

  test('rejects a code for another client, a wrong redirect_uri, or garbage', async () => {
    const { provider, client } = setup()
    const code = await approveAndGetCode(provider, client)
    const other = provider.clientsStore.registerClient({ client_name: 'Other', redirect_uris: ['https://other.example/cb'] })

    await expect(provider.challengeForAuthorizationCode(other, code)).rejects.toThrow(InvalidGrantError)
    await expect(provider.exchangeAuthorizationCode(client, code, undefined, 'https://evil.example/cb')).rejects.toThrow('redirect_uri does not match')
    await expect(provider.exchangeAuthorizationCode(client, 'garbage')).rejects.toThrow('Invalid authorization code')
  })

  test('does not support refresh tokens', async () => {
    const { provider, client } = setup()
    await expect(provider.exchangeRefreshToken(client, 'r')).rejects.toThrow('Refresh tokens are not supported')
  })

  test('reads the projects from the token without calling the API', async () => {
    const { provider } = setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const info = await provider.verifyAccessToken(TOKEN)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(info).toMatchObject({ token: TOKEN, scopes: [], extra: { token: TOKEN, projects: [{ projectId: PROJECT_ID, name: 'Shop' }, { projectId: OTHER_PROJECT_ID, name: 'Blog' }] } })
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000)
  })

  test('rejects garbage, a non-mcp token and an old token without projects', async () => {
    const { provider, sealer } = setup()

    await expect(provider.verifyAccessToken('garbage')).rejects.toThrow(InvalidTokenError)
    await expect(provider.verifyAccessToken(mcpToken({ type: 'user' }))).rejects.toThrow(InvalidTokenError)
    await expect(provider.verifyAccessToken(mcpToken({ type: 'mcp', projectIds: [PROJECT_ID] }))).rejects.toThrow(InvalidTokenError)
    await expect(provider.verifyAccessToken(sealer.seal({ type: 'access', projects: [] }))).rejects.toThrow(InvalidTokenError)
  })
})
