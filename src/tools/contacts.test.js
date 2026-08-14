import { describe, expect, test } from 'vitest'
import { createContactTools } from './contacts.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const tools = createContactTools({ client })
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
  test('formats a contact with lists and tags', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({ email: 'a@example.com', name: 'Ada', tags: ['vip'], _lists: ['Newsletter'] })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(client.get).toHaveBeenCalledWith('/contacts/a%40example.com')
    expect(result.content[0].text).toBe('a@example.com (Ada) - tags: vip - subscriber lists: Newsletter')
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

    expect(result.content[0].text).toBe('a@example.com (Ada) - tags: none - subscriber lists: none - custom fields: plan: pro, age: 32')
  })

  test('formats a contact with no name, tags, or lists', async () => {
    const { client, get_contact: getContact } = setup()
    client.get.mockResolvedValue({ email: 'a@example.com' })

    const result = await getContact.handler({ email: 'a@example.com' })

    expect(result.content[0].text).toBe('a@example.com - tags: none - subscriber lists: none')
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
