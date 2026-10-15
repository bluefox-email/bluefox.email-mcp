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

  test('imports every contact to a list given by id in one bulk call', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({ imported: 2, alreadyOnList: 0, errors: [] })

    const result = await importContacts.handler({ contacts: [{ email: 'a@example.com', name: 'Ada' }, { email: 'b@example.com' }], subscriberListId: 'list123' })

    expect(client.post).toHaveBeenCalledTimes(1)
    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list123/import', { contacts: [{ email: 'a@example.com', name: 'Ada' }, { email: 'b@example.com' }] })
    expect(result.content[0].text).toBe('Imported 2/2 contact(s) to the list.')
  })

  test('reports contacts already on the list and per-row errors from the import', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockResolvedValue({ imported: 1, alreadyOnList: 1, errors: [{ email: 'bad', message: 'Invalid email format' }] })

    const result = await importContacts.handler({ contacts: [{ email: 'a@example.com' }, { email: 'b@example.com' }, { email: 'bad' }], subscriberListId: 'list123' })

    expect(result.content[0].text).toBe('Imported 1/3 contact(s) to the list. 1 were already on the list and kept their current status. Failed (1): bad: Invalid email format')
  })

  test('splits large imports into batches of 1000', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.post.mockImplementation((path, body) => Promise.resolve({ imported: body.contacts.length, alreadyOnList: 0, errors: [] }))

    const contacts = Array.from({ length: 1500 }, (_, i) => ({ email: `c${i}@example.com` }))
    const result = await importContacts.handler({ contacts, subscriberListId: 'list123' })

    expect(client.post).toHaveBeenCalledTimes(2)
    expect(client.post.mock.calls[1][1].contacts.length).toBe(500)
    expect(result.content[0].text).toBe('Imported 1500/1500 contact(s) to the list.')
  })

  test('resolves a list given by name and ignores status', async () => {
    const { client, import_contacts: importContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ _id: 'list456' }] })
    client.post.mockResolvedValue({ imported: 1, alreadyOnList: 0, errors: [] })

    await importContacts.handler({ contacts: [{ email: 'a@example.com' }], subscriberListName: 'Newsletter', status: 'unverified' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list456/import', { contacts: [{ email: 'a@example.com' }] })
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
