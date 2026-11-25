import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { createBluefoxClient } from '../helpers/bluefoxClient.js'
import { createResolveId } from '../helpers/resolveId.js'
import { registerHostedTools, hostedInstructions } from '../tools/index.js'
import { createSealer } from './sealer.js'
import { createOAuthProvider } from './oauthProvider.js'

export function createHostedApp ({ baseUrl, publicUrl, appUrl, secret, version }) {
  const provider = createOAuthProvider({ sealer: createSealer(secret), baseUrl, appUrl })
  const mcpUrl = new URL('/mcp', publicUrl)
  const approveCors = cors({ origin: new URL(appUrl).origin })

  const app = express()
  app.set('trust proxy', 1)

  app.use(mcpAuthRouter({
    provider,
    issuerUrl: new URL(publicUrl),
    resourceServerUrl: mcpUrl,
    resourceName: 'bluefox.email',
    clientRegistrationOptions: { clientIdGeneration: false }
  }))

  app.options('/oauth/approve', approveCors)
  app.post('/oauth/approve', approveCors, express.json(), async (req, res) => {
    const result = await provider.approve(req.body)
    res.status(result.status).json(result)
  })

  app.post('/mcp', requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) }), express.json({ limit: '10mb' }), async (req, res) => {
    const projects = req.auth.extra.projects.map(project => {
      const client = createBluefoxClient({ baseUrl, projectId: project.projectId, apiKey: req.auth.extra.token })
      return { ...project, deps: { client, ...createResolveId(client) } }
    })
    const server = new McpServer({ name: 'bluefox.email-mcp', version }, { instructions: hostedInstructions(projects) })
    registerHostedTools(server, projects)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  app.all('/mcp', (req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'Method not allowed' })
  })

  return app
}
