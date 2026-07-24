import { z } from 'zod'
import { textResult, ResolveError } from '../helpers/errors.js'

export function createContactFieldsAndTagsTools ({ client, resolveIdOrRequired }) {
  return [
    {
      name: 'manage_contact_fields_and_tags',
      config: {
        title: 'Manage custom contact fields and tags',
        description: 'Manages the project-level definitions of custom contact fields (name/type) and tags - not any one contact\'s values. A custom field\'s value is later set/read as a flat top-level key on a contact matching its name; a name that isn\'t registered here is silently dropped when saving a contact. Fields can only be added or removed, not renamed (removing loses existing contacts\' values under that name). Removing a tag definition also untags every contact that had it.',
        inputSchema: {
          resource: z.enum(['field', 'tag']),
          action: z.enum(['list', 'create', 'update', 'delete']).describe('update is tag-only.'),
          fieldName: z.string().optional().describe('field create/delete - reserved names (email, tags, status, etc.) are rejected, and the name is auto-normalized (lowercased/camelCased, special characters stripped).'),
          fieldType: z.enum(['string', 'number', 'boolean', 'date']).optional().describe('field create only.'),
          tagId: z.string().optional().describe('tag update/delete, if already known.'),
          currentTagValue: z.string().optional().describe('tag update/delete - the tag\'s existing value, looked up automatically. Provide this if you do not already have the id.'),
          tagValue: z.string().optional().describe('tag create - the value to create; tag update - the new value to set. Stored lowercased; must be unique (case-insensitive).')
        }
      },
      handler: async (args) => {
        if (args.resource === 'field') {
          return handleField(client, args)
        }
        return handleTag(client, resolveIdOrRequired, args)
      }
    }
  ]
}

async function handleField (client, args) {
  if (args.action === 'list') {
    const list = await client.get('/contacts/fields')
    if (list.count === 0) {
      return textResult('No custom contact fields are defined yet.')
    }
    const summary = list.items.map(f => `${f.name} (${f.type})`).join(', ')
    return textResult(`${list.count} custom field(s): ${summary}.`)
  }
  if (args.action === 'create') {
    const result = await client.post('/contacts/fields', { name: args.fieldName, type: args.fieldType })
    return textResult(`Created custom field "${result.name}" (${result.type}).`)
  }
  if (args.action === 'delete') {
    await client.del(`/contacts/fields/${args.fieldName}`)
    return textResult(`Deleted custom field "${args.fieldName}".`)
  }
  throw new ResolveError('action "update" is not supported for resource "field" - delete and recreate it instead.')
}

async function handleTag (client, resolveIdOrRequired, args) {
  if (args.action === 'list') {
    const list = await client.get('/contacts/tags', { limit: 30 })
    if (list.count === 0) {
      return textResult('No contact tags are defined yet.')
    }
    const summary = list.items.map(tag => tag.value).join(', ')
    return textResult(`${list.count} tag(s): ${summary}.`)
  }
  if (args.action === 'create') {
    const result = await client.post('/contacts/tags', { value: args.tagValue })
    return textResult(`Created tag "${result.value}".`)
  }

  const tagId = await resolveIdOrRequired({
    id: args.tagId,
    name: args.currentTagValue,
    resourcePath: '/contacts/tags',
    filterField: 'value',
    label: 'tag'
  })
  if (args.action === 'update') {
    const result = await client.patch(`/contacts/tags/${tagId}`, { value: args.tagValue })
    return textResult(`Updated tag - it's now "${result.value}".`)
  }
  await client.del(`/contacts/tags/${tagId}`)
  return textResult('Deleted the tag, and removed it from every contact that had it.')
}
