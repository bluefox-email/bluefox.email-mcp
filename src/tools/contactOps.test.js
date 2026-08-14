import { describe, expect, test, vi, beforeEach } from 'vitest'
import { createContactOpsTools } from './contactOps.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'
import fs from 'fs/promises'

vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn().mockResolvedValue(undefined) }
}))

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired } = createResolveId(client)
  const tools = createContactOpsTools({ client, resolveIdOrRequired })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

beforeEach(() => {
  fs.writeFile.mockClear()
})

describe('bulk_update_contacts', () => {
  test('deletes contacts', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.del.mockResolvedValue({})

    const result = await bulkUpdate.handler({ emails: ['a@example.com', 'b@example.com'], action: 'delete' })

    expect(client.del).toHaveBeenCalledWith('/contacts/a%40example.com')
    expect(client.del).toHaveBeenCalledWith('/contacts/b%40example.com')
    expect(result.content[0].text).toBe('Deleted 2/2 contact(s).')
  })

  test('adds tags, merging with the contact\'s existing tags', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.get.mockResolvedValue({ tags: ['existing'] })
    client.patch.mockResolvedValue({})

    await bulkUpdate.handler({ emails: ['a@example.com'], action: 'add_tags', tags: ['vip'] })

    expect(client.patch).toHaveBeenCalledWith('/contacts/a%40example.com', { tags: ['existing', 'vip'] })
  })

  test('adds tags when the contact has none yet and no tags were passed', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.get.mockResolvedValue({})
    client.patch.mockResolvedValue({})

    await bulkUpdate.handler({ emails: ['a@example.com'], action: 'add_tags' })

    expect(client.patch).toHaveBeenCalledWith('/contacts/a%40example.com', { tags: [] })
  })

  test('removes tags', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.get.mockResolvedValue({ tags: ['existing', 'vip'] })
    client.patch.mockResolvedValue({})

    await bulkUpdate.handler({ emails: ['a@example.com'], action: 'remove_tags', tags: ['vip'] })

    expect(client.patch).toHaveBeenCalledWith('/contacts/a%40example.com', { tags: ['existing'] })
  })

  test('adds to the suppression list', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.post.mockResolvedValue({})

    const result = await bulkUpdate.handler({ emails: ['a@example.com'], action: 'add_to_suppression_list' })

    expect(client.post).toHaveBeenCalledWith('/suppression-list', { email: 'a@example.com' })
    expect(result.content[0].text).toBe('Suppressed 1/1 contact(s).')
  })

  test('subscribes to a list resolved by id', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.postAbsolute.mockResolvedValue({})

    const result = await bulkUpdate.handler({ emails: ['a@example.com'], action: 'subscribe_to_list', subscriberListId: 'list1' })

    expect(client.postAbsolute).toHaveBeenCalledWith('/v1/subscriber-lists/list1', { email: 'a@example.com' })
    expect(result.content[0].text).toBe('Subscribed 1/1 contact(s).')
  })

  test('unsubscribes from a list resolved by name', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ _id: 'list1' }] })
    client.patchAbsolute.mockResolvedValue({})

    const result = await bulkUpdate.handler({ emails: ['a@example.com'], action: 'unsubscribe_from_list', subscriberListName: 'Newsletter' })

    expect(client.patchAbsolute).toHaveBeenCalledWith('/v1/subscriber-lists/list1/a%40example.com', { status: 'unsubscribed' })
    expect(result.content[0].text).toBe('Unsubscribed 1/1 contact(s).')
  })

  test('reports per-row failures and truncates beyond the shown maximum', async () => {
    const { client, bulk_update_contacts: bulkUpdate } = setup()
    client.del.mockRejectedValue(new Error('boom'))

    const emails = Array.from({ length: 12 }, (_, i) => `c${i}@example.com`)
    const result = await bulkUpdate.handler({ emails, action: 'delete' })

    expect(result.content[0].text).toContain('Deleted 0/12 contact(s).')
    expect(result.content[0].text).toContain('Failed (12):')
    expect(result.content[0].text).toContain('; ...')
  })
})

describe('clean_contacts', () => {
  test('reports nothing suppressed', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await cleanContacts.handler({ reason: 'bounce' })

    expect(client.get).toHaveBeenCalledWith('/suppression-list', { filter: { reason: 'bounce' }, limit: 'unlimited' })
    expect(result.content[0].text).toBe('No contacts are suppressed for "bounce".')
  })

  test('reports matching contacts without deleting by default', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    client.get.mockResolvedValue({ count: 2, items: [{ email: 'a@example.com' }, { email: 'b@example.com' }] })

    const result = await cleanContacts.handler({ reason: 'complaint' })

    expect(client.del).not.toHaveBeenCalled()
    expect(result.content[0].text).toBe('2 contact(s) suppressed for "complaint": a@example.com, b@example.com. Pass deleteContacts: true to delete them.')
  })

  test('truncates the report beyond the shown maximum', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    const items = Array.from({ length: 12 }, (_, i) => ({ email: `c${i}@example.com` }))
    client.get.mockResolvedValue({ count: 12, items })

    const result = await cleanContacts.handler({ reason: 'bounce' })

    expect(result.content[0].text).toContain(', ...')
  })

  test('deletes matching contacts when deleteContacts is true', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    client.get.mockResolvedValue({ count: 2, items: [{ email: 'a@example.com' }, { email: 'b@example.com' }] })
    client.del.mockResolvedValue({})

    const result = await cleanContacts.handler({ reason: 'bounce', deleteContacts: true })

    expect(client.del).toHaveBeenCalledWith('/contacts/a%40example.com')
    expect(client.del).toHaveBeenCalledWith('/contacts/b%40example.com')
    expect(result.content[0].text).toBe('Deleted 2/2 contact(s).')
  })

  test('treats an already-missing contact as success, not a failure', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com' }] })
    const notFound = new Error('Contact not found.')
    notFound.name = 'NOT_FOUND'
    client.del.mockRejectedValue(notFound)

    const result = await cleanContacts.handler({ reason: 'bounce', deleteContacts: true })

    expect(result.content[0].text).toBe('Deleted 1/1 contact(s).')
  })

  test('surfaces a real deletion failure', async () => {
    const { client, clean_contacts: cleanContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com' }] })
    const serverError = new Error('Something went wrong.')
    serverError.name = 'INTERNAL_SERVER_ERROR'
    client.del.mockRejectedValue(serverError)

    const result = await cleanContacts.handler({ reason: 'bounce', deleteContacts: true })

    expect(result.content[0].text).toBe('Deleted 0/1 contact(s). Failed (1): a@example.com: Something went wrong.')
  })
})

describe('export_contacts', () => {
  test('reports when there are no contacts', async () => {
    const { client, export_contacts: exportContacts } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await exportContacts.handler({})

    expect(result.content[0].text).toBe('This project has no contacts to export.')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  test('pages through all contacts and writes a CSV file', async () => {
    const { client, export_contacts: exportContacts } = setup()
    const page1Items = Array.from({ length: 100 }, (_, i) => ({ email: `c${i}@example.com`, name: 'N', tags: ['vip'], _lists: ['Newsletter'], plan: 'pro' }))
    const page2Items = [{ email: 'last@example.com', tags: [], _lists: [] }]
    client.get
      .mockResolvedValueOnce({ count: 101, items: page1Items })
      .mockResolvedValueOnce({ count: 101, items: page2Items })

    const result = await exportContacts.handler({})

    expect(client.get).toHaveBeenCalledWith('/contacts', { limit: 100, skip: 0 })
    expect(client.get).toHaveBeenCalledWith('/contacts', { limit: 100, skip: 100 })
    expect(fs.writeFile).toHaveBeenCalledTimes(1)
    const [filePath, csv] = fs.writeFile.mock.calls[0]
    expect(filePath).toMatch(/bluefox-contacts-export-.*\.csv$/)
    expect(csv).toContain('email,name,tags,_lists,plan')
    expect(csv).toContain('last@example.com')
    expect(result.content[0].text).toContain('Exported 101 contact(s) to')
  })

  test('handles a row with no tags, lists, or custom fields', async () => {
    const { client, export_contacts: exportContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com' }] })

    await exportContacts.handler({})

    const [, csv] = fs.writeFile.mock.calls[0]
    expect(csv).toBe('email,name,tags,_lists,lastOpenDate,lastClickDate,lastReceiveDate,createdAt,updatedAt\na@example.com,,,,,,,,')
  })

  test('includes engagement dates and timestamps when present', async () => {
    const { client, export_contacts: exportContacts } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{
        email: 'a@example.com',
        lastOpenDate: '2026-01-05T00:00:00.000Z',
        lastClickDate: '2026-01-06T00:00:00.000Z',
        lastReceiveDate: '2026-01-07T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z'
      }]
    })

    await exportContacts.handler({})

    const [, csv] = fs.writeFile.mock.calls[0]
    expect(csv).toContain('2026-01-05T00:00:00.000Z,2026-01-06T00:00:00.000Z,2026-01-07T00:00:00.000Z,2026-01-01T00:00:00.000Z,2026-01-02T00:00:00.000Z')
  })

  test('escapes values containing commas or quotes', async () => {
    const { client, export_contacts: exportContacts } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com', name: 'Smith, "Ada"', tags: [], _lists: [] }] })

    await exportContacts.handler({})

    const [, csv] = fs.writeFile.mock.calls[0]
    expect(csv).toContain('"Smith, ""Ada"""')
  })
})

describe('resend_verification_email', () => {
  test('resends by list id', async () => {
    const { client, resend_verification_email: resend } = setup()
    client.post.mockResolvedValue({})

    const result = await resend.handler({ email: 'a@example.com', subscriberListId: 'list1' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list1/contacts/a%40example.com/resend-verification-email')
    expect(result.content[0].text).toBe('Resent the verification email to a@example.com.')
  })

  test('resolves the list by name first', async () => {
    const { client, resend_verification_email: resend } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ _id: 'list2' }] })
    client.post.mockResolvedValue({})

    await resend.handler({ email: 'a@example.com', subscriberListName: 'Newsletter' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list2/contacts/a%40example.com/resend-verification-email')
  })
})
