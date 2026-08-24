import { describe, expect, test } from 'vitest'
import { createContactFieldsAndTagsTools } from './contactFieldsAndTags.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired } = createResolveId(client)
  const [manageContactFieldsAndTags] = createContactFieldsAndTagsTools({ client, resolveIdOrRequired })
  return { client, manageContactFieldsAndTags }
}

describe('manage_contact_fields_and_tags - fields', () => {
  test('list reports no custom fields yet', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageContactFieldsAndTags.handler({ resource: 'field', action: 'list' })
    expect(result.content[0].text).toBe('No custom contact fields are defined yet.')
  })

  test('list summarizes custom fields with their type', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ name: 'plan', type: 'string' }] })

    const result = await manageContactFieldsAndTags.handler({ resource: 'field', action: 'list' })
    expect(result.content[0].text).toBe('1 custom field(s): plan (string).')
  })

  test('create adds a custom field', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.post.mockResolvedValue({ name: 'plan', type: 'string' })

    const result = await manageContactFieldsAndTags.handler({ resource: 'field', action: 'create', fieldName: 'plan', fieldType: 'string' })

    expect(client.post).toHaveBeenCalledWith('/contacts/fields', { name: 'plan', type: 'string' })
    expect(result.content[0].text).toBe('Created custom field "plan" (string).')
  })

  test('delete removes a custom field by name', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.del.mockResolvedValue({ name: 'plan' })

    const result = await manageContactFieldsAndTags.handler({ resource: 'field', action: 'delete', fieldName: 'plan' })

    expect(client.del).toHaveBeenCalledWith('/contacts/fields/plan')
    expect(result.content[0].text).toBe('Deleted custom field "plan".')
  })

  test('update is not supported for fields', async () => {
    const { manageContactFieldsAndTags } = setup()

    await expect(manageContactFieldsAndTags.handler({ resource: 'field', action: 'update', fieldName: 'plan' }))
      .rejects.toThrow('action "update" is not supported for resource "field"')
  })
})

describe('manage_contact_fields_and_tags - tags', () => {
  test('list reports no tags yet', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageContactFieldsAndTags.handler({ resource: 'tag', action: 'list' })
    expect(result.content[0].text).toBe('No contact tags are defined yet.')
  })

  test('list summarizes tags', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.get.mockResolvedValue({ count: 2, items: [{ value: 'vip' }, { value: 'trial' }] })

    const result = await manageContactFieldsAndTags.handler({ resource: 'tag', action: 'list' })
    expect(client.get).toHaveBeenCalledWith('/contacts/tags', { limit: 30 })
    expect(result.content[0].text).toBe('2 tag(s): vip, trial.')
  })

  test('create adds a tag', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.post.mockResolvedValue({ value: 'vip' })

    const result = await manageContactFieldsAndTags.handler({ resource: 'tag', action: 'create', tagValue: 'vip' })

    expect(client.post).toHaveBeenCalledWith('/contacts/tags', { value: 'vip' })
    expect(result.content[0].text).toBe('Created tag "vip".')
  })

  test('update resolves the tag by its current value and renames it', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'tag123' }] })
    client.patch.mockResolvedValue({ value: 'vip-2026' })

    const result = await manageContactFieldsAndTags.handler({ resource: 'tag', action: 'update', currentTagValue: 'vip', tagValue: 'vip-2026' })

    expect(client.get).toHaveBeenCalledWith('/contacts/tags', { filter: { value: 'vip' }, limit: 2 })
    expect(client.patch).toHaveBeenCalledWith('/contacts/tags/tag123', { value: 'vip-2026' })
    expect(result.content[0].text).toBe('Updated tag - it\'s now "vip-2026".')
  })

  test('delete removes a tag by id directly', async () => {
    const { client, manageContactFieldsAndTags } = setup()
    client.del.mockResolvedValue({})

    const result = await manageContactFieldsAndTags.handler({ resource: 'tag', action: 'delete', tagId: 'tag123' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.del).toHaveBeenCalledWith('/contacts/tags/tag123')
    expect(result.content[0].text).toBe('Deleted the tag, and removed it from every contact that had it.')
  })
})
