import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { createBluefoxClient } from '../helpers/bluefoxClient.js'

const REQUEST_TTL = 60 * 60
const CODE_TTL = 5 * 60
const VERIFY_TTL = 60 * 60
const OBJECT_ID = /^[a-f0-9]{24}$/i

function now () {
  return Math.floor(Date.now() / 1000)
}

export function createOAuthProvider ({ sealer, baseUrl, appUrl }) {
  function openTyped (value, type) {
    const data = sealer.open(value)
    if (!data || data.type !== type || (data.exp && data.exp < now())) {
      return undefined
    }
    return data
  }

  function openCode (client, code) {
    const data = openTyped(code, 'code')
    if (!data || data.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code')
    }
    return data
  }

  const clientsStore = {
    getClient (clientId) {
      const data = openTyped(clientId, 'client')
      if (!data) {
        return undefined
      }
      const { type, ...client } = data
      return { ...client, client_id: clientId }
    },
    registerClient (client) {
      return { ...client, client_id: sealer.seal({ ...client, type: 'client' }) }
    }
  }

  async function authorize (client, params, res) {
    const request = sealer.seal({
      type: 'request',
      clientId: client.client_id,
      clientName: client.client_name || 'AI tool',
      redirectUri: params.redirectUri,
      state: params.state,
      codeChallenge: params.codeChallenge,
      exp: now() + REQUEST_TTL
    })
    const url = new URL('/oauth/authorize', appUrl)
    url.searchParams.set('client', client.client_name || 'AI tool')
    url.searchParams.set('request', request)
    res.redirect(url.href)
  }

  async function challengeForAuthorizationCode (client, code) {
    return openCode(client, code).codeChallenge
  }

  async function exchangeAuthorizationCode (client, code, codeVerifier, redirectUri) {
    const data = openCode(client, code)
    if (redirectUri && redirectUri !== data.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match')
    }
    return {
      access_token: sealer.seal({ type: 'access', projectId: data.projectId, apiKey: data.apiKey }),
      token_type: 'bearer'
    }
  }

  async function exchangeRefreshToken () {
    throw new InvalidGrantError('Refresh tokens are not supported')
  }

  async function verifyAccessToken (token) {
    const data = openTyped(token, 'access')
    if (!data) {
      throw new InvalidTokenError('Invalid access token')
    }
    try {
      await createBluefoxClient({ baseUrl, projectId: data.projectId, apiKey: data.apiKey }).get('')
    } catch (err) {
      if ([401, 403, 404].includes(err.status)) {
        throw new InvalidTokenError('This connection was removed. Connect bluefox.email again.')
      }
      throw err
    }
    return {
      token,
      clientId: 'bluefox.email',
      scopes: [],
      expiresAt: now() + VERIFY_TTL,
      extra: { projectId: data.projectId, apiKey: data.apiKey }
    }
  }

  async function approve ({ request, accountId, projectId, accessToken, denied }) {
    const data = openTyped(request, 'request')
    if (!data) {
      return { status: 400, error: 'This sign-in link has expired. Start connecting again from your AI tool.' }
    }
    const redirect = new URL(data.redirectUri)
    if (data.state) {
      redirect.searchParams.set('state', data.state)
    }
    if (denied) {
      redirect.searchParams.set('error', 'access_denied')
      return { status: 200, redirectUrl: redirect.href }
    }
    if (!OBJECT_ID.test(accountId) || !OBJECT_ID.test(projectId)) {
      return { status: 400, error: 'Choose a project to connect.' }
    }

    const res = await fetch(`${baseUrl}/v1/accounts/${accountId}/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `MCP - ${data.clientName}` })
    })
    const json = await res.json()
    if (!res.ok) {
      return { status: res.status, error: json.error.message }
    }

    const apiKeys = json.result.apiKeys
    redirect.searchParams.set('code', sealer.seal({
      type: 'code',
      clientId: data.clientId,
      redirectUri: data.redirectUri,
      codeChallenge: data.codeChallenge,
      projectId,
      apiKey: apiKeys[apiKeys.length - 1].apiKey,
      exp: now() + CODE_TTL
    }))
    return { status: 200, redirectUrl: redirect.href }
  }

  return {
    clientsStore,
    authorize,
    challengeForAuthorizationCode,
    exchangeAuthorizationCode,
    exchangeRefreshToken,
    verifyAccessToken,
    approve
  }
}
