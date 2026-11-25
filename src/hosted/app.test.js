import crypto from 'node:crypto'
import { describe, expect, test, vi, beforeAll, afterAll } from 'vitest'
import { createHostedApp } from './app.js'

const API = 'https://api.bluefox.email'
const ACCOUNT_ID = '65bea83c0000000000000001'
const PROJECT_ID = '65bea83c0000000000000002'
const realFetch = globalThis.fetch

let base
let server

function mcpToken (connectionId) {
  return `header.${Buffer.from(JSON.stringify({ type: 'mcp', connectionId, projectIds: [PROJECT_ID] })).toString('base64url')}.signature`
}

function apiResponse (status, json) {
  return { ok: status < 400, status, json: async () => json }
}

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const href = String(url)
    if (!href.startsWith(API)) {
      return realFetch(url, options)
    }
    if (href.endsWith('/mcp-connections')) {
      return apiResponse(200, { result: { token: mcpToken('connection1') } })
    }
    if (options.headers.Authorization === `Bearer ${mcpToken('removed')}`) {
      return apiResponse(403, { error: { name: 'AUTHORIZATION_ERROR', message: 'Permission denied.' } })
    }
    return apiResponse(200, { result: { _id: PROJECT_ID, name: 'Shop' } })
  })

  const app = createHostedApp({ baseUrl: API, publicUrl: 'http://localhost', appUrl: 'https://app.bluefox.email/', secret: 'secret', version: '0.0.1' })
  await new Promise(resolve => {
    server = app.listen(0, resolve)
  })
  base = `http://localhost:${server.address().port}`
})

afterAll(() => {
  server.close()
  vi.restoreAllMocks()
})

function mcpRequest (token, body) {
  return realFetch(`${base}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body)
  })
}

async function connect () {
  const register = await realFetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/callback'], token_endpoint_auth_method: 'none' })
  })
  const { client_id: clientId } = await register.json()

  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const authorizeUrl = new URL(`${base}/authorize`)
  authorizeUrl.search = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://claude.ai/callback', response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'st1' })
  const authorize = await realFetch(authorizeUrl, { redirect: 'manual' })
  const consentUrl = new URL(authorize.headers.get('location'))

  const approve = await realFetch(`${base}/oauth/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://app.bluefox.email' },
    body: JSON.stringify({ request: consentUrl.searchParams.get('request'), accountId: ACCOUNT_ID, projectIds: [PROJECT_ID], accessToken: 'user-token' })
  })
  const { redirectUrl } = await approve.json()
  const code = new URL(redirectUrl).searchParams.get('code')

  const token = await realFetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: 'https://claude.ai/callback' })
  })
  return { authorize, consentUrl, approve, token: await token.json() }
}

describe('hosted MCP app', () => {
  test('serves the OAuth metadata', async () => {
    const res = await realFetch(`${base}/.well-known/oauth-authorization-server`)
    const json = await res.json()
    expect(json.registration_endpoint).toBe('http://localhost/register')
    expect(json.code_challenge_methods_supported).toEqual(['S256'])
  })

  test('answers /mcp without a token with 401 pointing at the resource metadata', async () => {
    const res = await realFetch(`${base}/mcp`, { method: 'POST' })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"')
  })

  test('answers other methods on /mcp with 405', async () => {
    const res = await realFetch(`${base}/mcp`)
    expect(res.status).toBe(405)
  })

  test('allows the app origin to call /oauth/approve', async () => {
    const res = await realFetch(`${base}/oauth/approve`, { method: 'OPTIONS', headers: { Origin: 'https://app.bluefox.email', 'Access-Control-Request-Method': 'POST' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.bluefox.email')
  })

  test('connects through the full OAuth flow and then serves MCP requests', async () => {
    const { authorize, consentUrl, approve, token } = await connect()

    expect(authorize.status).toBe(302)
    expect(consentUrl.origin + consentUrl.pathname).toBe('https://app.bluefox.email/oauth/authorize')
    expect(approve.status).toBe(200)
    expect(token.token_type).toBe('bearer')

    const init = await mcpRequest(token.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
    expect(init.status).toBe(200)
    const { result: initResult } = await init.json()
    expect(initResult.serverInfo.name).toBe('bluefox.email-mcp')
    expect(initResult.instructions).toContain(`Connected bluefox.email projects: "Shop" (${PROJECT_ID}).`)

    const list = await mcpRequest(token.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const { result } = await list.json()
    const gallery = result.tools.find(tool => tool.name === 'manage_gallery')
    expect(gallery.inputSchema.properties.imagePath).toBeUndefined()
    expect(gallery.inputSchema.properties.project.description).toBe(`The only connected project is "Shop" (${PROJECT_ID}).`)
    expect(gallery.inputSchema.required || []).not.toContain('project')
  })

  test('answers 401 once the connection is removed', async () => {
    const res = await mcpRequest(mcpToken('removed'), { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

    expect(res.status).toBe(401)
  })
})
