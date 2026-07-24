import { describe, expect, test, vi, beforeAll, afterAll } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createBluefoxClient } from '../helpers/bluefoxClient.js'
import { createResolveId } from '../helpers/resolveId.js'
import { registerTools } from './index.js'

// Spins up the real McpServer (every tool registered exactly as index.js would) and a real Client connected over
// the SDK's in-memory transport pair - this is the one test that would catch a broken Zod schema registration,
// which handler-level unit tests can't see. Only the network layer (fetch) is mocked.
describe('MCP server smoke test', () => {
  let client

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ status: 201, result: { _id: 'campaign123', name: 'Summer Sale' } })
    })

    const bluefoxClient = createBluefoxClient({ baseUrl: 'https://api.bluefox.email', projectId: 'proj1', apiKey: 'key1' })
    const resolveHelpers = createResolveId(bluefoxClient)

    const server = new McpServer({ name: 'bluefox.email-mcp-test', version: '0.0.1' })
    registerTools(server, { client: bluefoxClient, ...resolveHelpers })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.1' })

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ])
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  test('lists every registered tool with a valid schema', async () => {
    const { tools } = await client.listTools()
    const names = tools.map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining([
      'create_campaign',
      'create_subscriber_list',
      'create_transactional_email',
      'send_transactional_email'
    ]))
  })

  test('calling create_campaign end-to-end returns a plain-language success message, not raw JSON', async () => {
    const result = await client.callTool({
      name: 'create_campaign',
      arguments: {
        name: 'Summer Sale',
        subject: 'Big discounts',
        body: 'Hello {{contact.name}}',
        subscriberListId: 'list123'
      }
    })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].type).toBe('text')
    expect(result.content[0].text).toBe('Created campaign "Summer Sale" (id campaign123) as a draft.')
  })

  test('a validation-style tool call still round-trips through the real MCP protocol', async () => {
    const result = await client.callTool({
      name: 'create_subscriber_list',
      arguments: { name: 'Newsletter', description: 'Weekly updates' }
    })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toContain('Created subscriber list "Summer Sale"')
  })

  test('a handler error is caught centrally and returned as an isError tool result, not thrown to the client', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ status: 404, error: { name: 'NOT_FOUND', message: 'Contact not found.' } })
    })

    const result = await client.callTool({
      name: 'delete_contact',
      arguments: { email: 'ghost@example.com' }
    })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Contact not found.')
  })
})
