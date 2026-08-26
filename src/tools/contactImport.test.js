import { describe, expect, test } from 'vitest'
import { createContactImportTools } from './contactImport.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOptional } = createResolveId(client)
  const tools = createContactImportTools({ client, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('import_contacts', () => {
  test('creates bare contacts when no list is given', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({})

    const result = await importContacts.handler({ contacts: [{ email: 'a@example.com' }, { email: 'b@example.com' }] })

    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'a@example.com' })
    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'b@example.com' })
    expect(result.content[0].text).toBe('Imported 2/2 contact(s).')
  })

  test('includes name, tags, and custom fields in the body', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({})

    await importContacts.handler({
      contacts: [{ email: 'a@example.com', name: 'Ada', tags: ['vip'], customFields: { plan: 'pro' } }]
    })

    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'a@example.com', plan: 'pro', name: 'Ada', tags: ['vip'] })
  })

  test('subscribes each contact to a list given by id', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({})

    const result = await importContacts.handler({ contacts: [{ email: 'a@example.com' }], subscriberListId: 'list123' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers', { email: 'a@example.com' })
    expect(result.content[0].text).toBe('Imported 1/1 contact(s) to the list.')
  })

  test('resolves a list given by name and passes status through', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ _id: 'list456' }] })
    client.post.mockResolvedValue({})

    await importContacts.handler({ contacts: [{ email: 'a@example.com' }], subscriberListName: 'Newsletter', status: 'active' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list456/subscribers', { email: 'a@example.com', status: 'active' })
  })

  test('does not send status when no list is given', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({})

    await importContacts.handler({ contacts: [{ email: 'a@example.com' }], status: 'active' })

    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'a@example.com' })
  })

  test('reports per-row failures without stopping the rest of the batch', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Email already exists.'))
      .mockResolvedValueOnce({})

    const result = await importContacts.handler({
      contacts: [{ email: 'a@example.com' }, { email: 'b@example.com' }, { email: 'c@example.com' }]
    })

    expect(result.content[0].text).toBe('Imported 2/3 contact(s). Failed (1): b@example.com: Email already exists.')
  })

  test('truncates the failure list beyond the shown maximum', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockRejectedValue(new Error('boom'))

    const contacts = Array.from({ length: 12 }, (_, i) => ({ email: `c${i}@example.com` }))
    const result = await importContacts.handler({ contacts })

    expect(result.content[0].text).toContain('Imported 0/12 contact(s).')
    expect(result.content[0].text).toContain('Failed (12):')
    expect(result.content[0].text).toContain('; ...')
  })
})
