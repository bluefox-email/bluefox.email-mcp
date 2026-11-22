import { describe, expect, test, vi, beforeAll, afterAll } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createBluefoxClient } from '../helpers/bluefoxClient.js'
import { createResolveId } from '../helpers/resolveId.js'
import { registerTools, registerHostedTools } from './index.js'

// Spins up the real McpServer (every tool registered exactly as index.js would) and a real Client connected over
// the SDK's in-memory transport pair - this is the one test that would catch a broken Zod schema registration,
// which handler-level unit tests can't see. Only the network layer (fetch) is mocked.
describe('MCP server smoke test', () => {
  let client

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ status: 201, result: { _id: 'campaign123', name: 'Summer Sale', subject: 'Big discounts', contentType: 'chamaileon', status: 'draft', subscriberListId: 'list123' } })
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
    expect(result.content[0].text).toContain('Created campaign:')
    expect(result.content[0].text).toContain('"Summer Sale" (id campaign123)')
    expect(result.content[0].text).toContain('Subject: "Big discounts"')
    expect(result.content[0].text).toContain('Status: draft')
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

describe('MCP server in hosted mode', () => {
  let client

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).includes('/contacts/missing')
      ? { ok: false, status: 404, json: async () => ({ error: { name: 'NOT_FOUND', message: 'Contact not found.' } }) }
      : {
          ok: true,
          status: 201,
          json: async () => ({ status: 201, result: { _id: 'campaign123', name: 'Summer Sale', subject: 'Big discounts', contentType: 'html', status: 'draft', subscriberListId: 'list123' } })
        })

    const projects = ['proj1', 'proj2'].map((projectId, index) => {
      const bluefoxClient = createBluefoxClient({ baseUrl: 'https://api.bluefox.email', projectId, apiKey: `key${index + 1}` })
      return { projectId, name: index ? 'Blog' : 'Shop', deps: { client: bluefoxClient, ...createResolveId(bluefoxClient) } }
    })
    const server = new McpServer({ name: 'bluefox.email-mcp-test', version: '0.0.1' })
    registerHostedTools(server, projects)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test-client', version: '0.0.1' })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  test('hides the params that read or write files on the server', async () => {
    const { tools } = await client.listTools()
    const gallery = tools.find(tool => tool.name === 'manage_gallery')
    const campaign = tools.find(tool => tool.name === 'create_campaign')

    expect(gallery.inputSchema.properties.imagePath).toBeUndefined()
    expect(gallery.inputSchema.properties.imageUrl).toBeUndefined()
    expect(gallery.inputSchema.properties.imageBase64).toBeDefined()
    expect(campaign.inputSchema.properties.chamaileonJsonPath).toBeUndefined()
    expect(campaign.inputSchema.properties.chamaileonJson).toBeDefined()
  })

  test('drops a hidden param passed anyway instead of reading the file', async () => {
    const result = await client.callTool({
      name: 'create_campaign',
      arguments: {
        name: 'Summer Sale',
        subject: 'Big discounts',
        body: 'Hello',
        subscriberListId: 'list123',
        chamaileonJsonPath: '/etc/passwd'
      }
    })

    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toContain('Created campaign:')
  })

  test('lists the connected projects on every tool and uses the first one by default', async () => {
    const { tools } = await client.listTools()
    expect(tools[0].inputSchema.properties.project.description).toContain('"Shop" (proj1), "Blog" (proj2). Defaults to "Shop".')

    await client.callTool({ name: 'create_campaign', arguments: { name: 'Summer Sale', subject: 'Big discounts', body: 'Hello', subscriberListId: 'list123' } })
    expect(globalThis.fetch.mock.calls.at(-1)[0]).toContain('/v1/projectId/proj1/')
  })

  test('runs the tool against the project picked by name or id', async () => {
    const args = { name: 'Summer Sale', subject: 'Big discounts', body: 'Hello', subscriberListId: 'list123' }

    await client.callTool({ name: 'create_campaign', arguments: { ...args, project: 'blog' } })
    expect(globalThis.fetch.mock.calls.at(-1)[0]).toContain('/v1/projectId/proj2/')
    expect(globalThis.fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer key2')

    await client.callTool({ name: 'create_campaign', arguments: { ...args, project: 'proj1' } })
    expect(globalThis.fetch.mock.calls.at(-1)[0]).toContain('/v1/projectId/proj1/')
  })

  test('answers an unknown project and API failures as tool errors', async () => {
    const unknown = await client.callTool({ name: 'get_contact', arguments: { email: 'a@b.com', project: 'Nope' } })
    expect(unknown.isError).toBe(true)
    expect(unknown.content[0].text).toBe('No connected project "Nope". Connected projects: "Shop" (proj1), "Blog" (proj2).')

    const failed = await client.callTool({ name: 'get_contact', arguments: { email: 'missing' } })
    expect(failed.isError).toBe(true)
  })
})
