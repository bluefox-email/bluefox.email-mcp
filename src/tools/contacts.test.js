import { describe, expect, test } from 'vitest'
import { createContactTools } from './contacts.js'
import { createFakeClient } from '../helpers/fakeClient.js'
import { createResolveId } from '../helpers/resolveId.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOptional } = createResolveId(client)
  const tools = createContactTools({ client, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('create_contact', () => {
  test('creates a minimal contact', async () => {
    const { client, create_contact: createContact } = setup()
    client.post.mockResolvedValue({ email: 'a@example.com' })

    const result = await createContact.handler({ email: 'a@example.com' })

    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'a@example.com' })
    expect(result.content[0].text).toBe('Created contact a@example.com.')
  })

  test('creates a contact with name, tags, and custom fields, auto-registering the name field when missing', async () => {
    const { client, create_contact: createContact } = setup()
    client.get.mockResolvedValue({ items: [{ name: 'plan', type: 'string' }] })
    client.post.mockResolvedValue({ email: 'a@example.com' })

    await createContact.handler({
      email: 'a@example.com',
      name: 'Ada',
      tags: ['vip'],
      customFields: { plan: 'pro' }
    })

    expect(client.get).toHaveBeenCalledWith('/contacts/fields')
    expect(client.post).toHaveBeenCalledWith('/contacts/fields', { name: 'name', type: 'string' })
    expect(client.post).toHaveBeenCalledWith('/contacts', {
      email: 'a@example.com',
      plan: 'pro',
      name: 'Ada',
      tags: ['vip']
    })
  })

  test('does not re-register the name field when it already exists', async () => {
    const { client, create_contact: createContact } = setup()
    client.get.mockResolvedValue({ items: [{ name: 'name', type: 'string' }] })
    client.post.mockResolvedValue({ email: 'a@example.com' })

    await createContact.handler({ email: 'a@example.com', name: 'Ada' })

    expect(client.post).not.toHaveBeenCalledWith('/contacts/fields', expect.anything())
    expect(client.post).toHaveBeenCalledWith('/contacts', { email: 'a@example.com', name: 'Ada' })
  })
})

describe('get_contact', () => {
  test('formats a contact with lists and tags, reporting never for unset engagement dates', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({ email: 'a@example.com', name: 'Ada', tags: ['vip'], _lists: ['Newsletter'] })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(client.get).toHaveBeenCalledWith('/contacts/a%40example.com')
    expect(result.content[0].text).toBe('a@example.com (Ada) - tags: vip - subscriber lists: Newsletter - last opened: never, last clicked: never, last received: never')
  })

  test('includes custom field values, excluding built-in fields', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({
      _id: 'contact123',
      email: 'a@example.com',
      name: 'Ada',
      tags: [],
      _lists: [],
      plan: 'pro',
      age: 32,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(result.content[0].text).toBe('a@example.com (Ada) - tags: none - subscriber lists: none - custom fields: plan: pro, age: 32 - last opened: never, last clicked: never, last received: never')
  })

  test('reports actual engagement dates when present', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({
      email: 'a@example.com',
      lastOpenDate: '2026-01-05T00:00:00.000Z',
      lastClickDate: '2026-01-06T00:00:00.000Z',
      lastReceiveDate: '2026-01-07T00:00:00.000Z'
    })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(result.content[0].text).toContain('last opened: 2026-01-05T00:00:00.000Z, last clicked: 2026-01-06T00:00:00.000Z, last received: 2026-01-07T00:00:00.000Z')
  })

  test('formats a contact with no name, tags, or lists', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({ email: 'a@example.com' })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(result.content[0].text).toBe('a@example.com - tags: none - subscriber lists: none - last opened: never, last clicked: never, last received: never')
  })
})

describe('update_contact', () => {
  test('updates email, name, tags, and custom fields', async () => {
    const { client, update_contact: updateContact } = setup()
    client.get.mockResolvedValue({ items: [] })
    client.patch.mockResolvedValue({ email: 'b@example.com' })

    const result = await updateContact.handler({
      email: 'a@example.com',
      newEmail: 'b@example.com',
      name: 'Ada',
      tags: ['vip'],
      customFields: { plan: 'pro' }
    })

    expect(client.post).toHaveBeenCalledWith('/contacts/fields', { name: 'name', type: 'string' })
    expect(client.patch).toHaveBeenCalledWith('/contacts/a%40example.com', {
      plan: 'pro',
      email: 'b@example.com',
      name: 'Ada',
      tags: ['vip']
    })
    expect(result.content[0].text).toBe('Updated contact b@example.com.')
  })

  test('updates with no optional fields given', async () => {
    const { client, update_contact: updateContact } = setup()
    client.patch.mockResolvedValue({ email: 'a@example.com' })

    await updateContact.handler({ email: 'a@example.com' })

    expect(client.patch).toHaveBeenCalledWith('/contacts/a%40example.com', {})
  })
})

describe('delete_contact', () => {
  test('deletes a contact by email', async () => {
    const { client, delete_contact: deleteContact } = setup()
    client.del.mockResolvedValue({})

    const result = await deleteContact.handler({ email: 'a@example.com' })

    expect(client.del).toHaveBeenCalledWith('/contacts/a%40example.com')
    expect(result.content[0].text).toBe('Deleted contact a@example.com.')
  })
})

describe('list_contacts', () => {
  test('lists everyone with no filters, using the default page size', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com', tags: [] }] })

    const result = await listContacts.handler({})

    expect(client.get).toHaveBeenCalledWith('/contacts', { filter: { segmentId: undefined, segment: undefined }, limit: 50, skip: 0 })
    expect(result.content[0].text).toBe('1 contact(s) match. Showing 1-1:\na@example.com - tags: none')
  })

  test('filters by a segment name, resolving it to an id first', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get
      .mockResolvedValueOnce({ items: [{ _id: 'seg1' }] })
      .mockResolvedValueOnce({ count: 1, items: [{ email: 'a@example.com', name: 'Ada', tags: ['vip'], plan: 'pro' }] })

    const result = await listContacts.handler({ segmentName: 'Pro users' })

    expect(client.get).toHaveBeenNthCalledWith(1, '/segments', { filter: { name: 'Pro users' }, limit: 2 })
    expect(client.get).toHaveBeenNthCalledWith(2, '/contacts', { filter: { segmentId: 'seg1', segment: undefined }, limit: 50, skip: 0 })
    expect(result.content[0].text).toBe('1 contact(s) match. Showing 1-1:\na@example.com (Ada) - tags: vip - plan: pro')
  })

  test('fails clearly for an unknown segment name', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ items: [] })

    await expect(listContacts.handler({ segmentName: 'Nope' })).rejects.toThrow('No segment named "Nope" found.')
    expect(client.get).toHaveBeenCalledTimes(1)
  })

  test('filters by tags and field values as AND-ed conditions, alongside a segment id', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    await listContacts.handler({ segmentId: 'seg1', tags: ['vip', 'beta'], fields: { plan: 'pro', seats: 5 } })

    const conditions = [
      { operator: 'has-tag', value: 'vip' },
      { operator: 'has-tag', value: 'beta' },
      { property: 'plan', operator: 'equals', value: 'pro' },
      { property: 'seats', operator: 'equals', value: 5 }
    ]
    expect(client.get).toHaveBeenCalledWith('/contacts', { filter: { segmentId: 'seg1', segment: JSON.stringify({ groups: [{ conditions }] }) }, limit: 50, skip: 0 })
  })

  test('reports no matches', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await listContacts.handler({ tags: ['vip'] })

    expect(result.content[0].text).toBe('No contacts match.')
  })

  test('points to the next page when more contacts match', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ email: 'c@example.com' }, { email: 'd@example.com' }] })

    const result = await listContacts.handler({ tags: ['vip'], limit: 2, skip: 2 })

    expect(client.get).toHaveBeenCalledWith('/contacts', expect.objectContaining({ limit: 2, skip: 2 }))
    expect(result.content[0].text).toBe('5 contact(s) match. Showing 3-4:\nc@example.com - tags: none\nd@example.com - tags: none\nPass skip: 4 for the next page.')
  })

  test('says so when skip is past the end', async () => {
    const { client, list_contacts: listContacts } = setup()
    client.get.mockResolvedValue({ count: 3, items: [] })

    const result = await listContacts.handler({ skip: 10 })

    expect(result.content[0].text).toBe('3 contact(s) match, but skip 10 is past the end.')
  })
})
