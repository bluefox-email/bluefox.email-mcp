import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { extractCustomFields } from '../helpers/contactFields.js'
import { formatCondition } from './segments.js'

const customFieldsSchema = z.record(z.any()).optional().describe('Custom contact field values, keyed by field name (e.g. {"plan": "pro"}) - a name that is not already a registered custom field on this project is silently dropped, not an error.')

// Contacts have no built-in "name" attribute - it only persists once a custom field literally called "name"
// is registered (see manage_contact_fields_and_tags). Auto-register it on first use so this just works, instead
// of silently no-op'ing like any other unregistered custom field would.
async function ensureNameField (client) {
  const fields = await client.get('/contacts/fields')
  if (!fields.items.some(field => field.name === 'name')) {
    await client.post('/contacts/fields', { name: 'name', type: 'string' })
  }
}

function formatContactLine (contact) {
  const customFields = extractCustomFields(contact)
  const customFieldsText = Object.keys(customFields).length
    ? ` - ${Object.entries(customFields).map(([key, value]) => `${key}: ${value}`).join(', ')}`
    : ''
  return `${contact.email}${contact.name ? ` (${contact.name})` : ''} - tags: ${(contact.tags || []).join(', ') || 'none'}${customFieldsText}`
}

// Echoed at the top of every list_contacts result, with a saved segment's actual rule spelled out - a segment's
// name alone doesn't say what it matches, so a "500 matches" answer can silently be for a different rule than
// the one the user had in mind.
function describeFilters ({ args, subscriberListId, segment }) {
  const parts = []
  if (subscriberListId) {
    const list = args.subscriberListName ? `"${args.subscriberListName}"` : `id ${subscriberListId}`
    parts.push(`subscriber list ${list}${args.subscriberStatus ? ` (status: ${args.subscriberStatus})` : ' (any status)'}`)
  }
  if (segment) {
    const groups = segment.groups.map(group => group.conditions.map(formatCondition).join(' AND ') || 'everyone')
    parts.push(`segment "${segment.name}" [${groups.length ? groups.join(' OR ') : 'no groups - matches nobody'}]`)
  }
  if (args.tags?.length) {
    parts.push(`tags: ${args.tags.join(', ')}`)
  }
  const fields = Object.entries(args.fields || {})
  if (fields.length) {
    parts.push(`fields: ${fields.map(([name, value]) => `${name} = ${JSON.stringify(value)}`).join(', ')}`)
  }
  return `Filters: ${parts.length ? parts.join('; ') : 'none (all contacts)'}.`
}

export function createContactTools ({ client, resolveIdOptional }) {
  return [
    {
      name: 'list_contacts',
      config: {
        title: 'List and filter contacts',
        description: 'Lists contacts on the project, optionally narrowed to a subscriber list (by name or id, optionally by subscription status), a saved segment (by name or id), contacts carrying given tags, and/or contacts whose custom fields equal given values - all filters are AND-ed. With no filters, lists everyone. Paginated: use skip for the next page. Use this instead of export_contacts to answer "who is in X".',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Only contacts on this subscriber list - looked up automatically.'),
          subscriberStatus: z.enum(['active', 'unsubscribed', 'paused', 'unverified']).optional().describe('With a subscriber list only: their status on that list. Defaults to any status.'),
          segmentId: z.string().optional(),
          segmentName: z.string().optional().describe('A segment already created on the project - looked up automatically.'),
          tags: z.array(z.string()).optional().describe('Only contacts that have every one of these tags.'),
          fields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe('Only contacts whose custom field equals the value, keyed by field name (e.g. {"plan": "pro"}). The field must be registered on the project.'),
          limit: z.number().int().min(1).max(100).optional().describe('Defaults to 50.'),
          skip: z.number().int().min(0).optional().describe('How many matching contacts to skip, for paging. Defaults to 0.')
        }
      },
      handler: async (args) => {
        const subscriberListId = await resolveIdOptional({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        if (args.subscriberStatus && !subscriberListId) {
          return textResult('subscriberStatus needs a subscriber list (subscriberListId or subscriberListName).')
        }
        const segmentId = await resolveIdOptional({
          id: args.segmentId,
          name: args.segmentName,
          resourcePath: '/segments',
          filterField: 'name',
          label: 'segment'
        })
        const conditions = [
          ...(args.tags || []).map(tag => ({ operator: 'has-tag', value: tag })),
          ...Object.entries(args.fields || {}).map(([property, value]) => ({ property, operator: 'equals', value }))
        ]
        const filter = {
          subscriberListId,
          subscriberStatus: args.subscriberStatus,
          segmentId,
          segment: conditions.length ? JSON.stringify({ groups: [{ conditions }] }) : undefined
        }
        const limit = args.limit || 50
        const skip = args.skip || 0

        const segment = segmentId ? await client.get(`/segments/${segmentId}`) : undefined
        const filtersLine = describeFilters({ args, subscriberListId, segment })

        const result = await client.get('/contacts', { filter, limit, skip })
        if (!result.count) {
          return textResult(`${filtersLine}\nNo contacts match.`)
        }
        if (!result.items.length) {
          return textResult(`${filtersLine}\n${result.count} contact(s) match, but skip ${skip} is past the end.`)
        }

        const lines = [filtersLine, `${result.count} contact(s) match. Showing ${skip + 1}-${skip + result.items.length}:`, ...result.items.map(formatContactLine)]
        if (skip + result.items.length < result.count) {
          lines.push(`Pass skip: ${skip + result.items.length} for the next page.`)
        }
        return textResult(lines.join('\n'))
      }
    },
    {
      name: 'create_contact',
      config: {
        title: 'Create contact',
        description: 'Creates a new contact, independent of any subscriber list.',
        inputSchema: {
          email: z.string(),
          name: z.string().optional().describe('Stored as a custom field called "name", auto-registered the first time it\'s used.'),
          tags: z.array(z.string()).optional().describe('Tags are created automatically if they do not already exist.'),
          customFields: customFieldsSchema
        }
      },
      handler: async (args) => {
        const body = { email: args.email, ...(args.customFields || {}) }
        if (args.name) {
          await ensureNameField(client)
          body.name = args.name
        }
        if (args.tags) {
          body.tags = args.tags
        }

        const result = await client.post('/contacts', body)
        return textResult(`Created contact ${result.email}.`)
      }
    },
    {
      name: 'get_contact',
      config: {
        title: 'Get contact',
        description: 'Looks up a contact by email, including which subscriber lists they belong to and their custom field values.',
        inputSchema: {
          email: z.string()
        }
      },
      handler: async (args) => {
        const result = await client.get(`/contacts/${encodeURIComponent(args.email)}`)
        const lists = result._lists?.length ? result._lists.join(', ') : 'none'
        const customFields = extractCustomFields(result)
        const customFieldsText = Object.keys(customFields).length
          ? ` - custom fields: ${Object.entries(customFields).map(([key, value]) => `${key}: ${value}`).join(', ')}`
          : ''
        const engagement = `last opened: ${result.lastOpenDate || 'never'}, last clicked: ${result.lastClickDate || 'never'}, last received: ${result.lastReceiveDate || 'never'}`
        return textResult(`${result.email}${result.name ? ` (${result.name})` : ''} - tags: ${(result.tags || []).join(', ') || 'none'} - subscriber lists: ${lists}${customFieldsText} - ${engagement}`)
      }
    },
    {
      name: 'update_contact',
      config: {
        title: 'Update contact',
        description: 'Updates an existing contact\'s email, name, tags, or custom fields.',
        inputSchema: {
          email: z.string().describe('The contact\'s current email, to find them by.'),
          newEmail: z.string().optional().describe('Set this to change the contact\'s email address.'),
          name: z.string().optional().describe('Stored as a custom field called "name", auto-registered the first time it\'s used.'),
          tags: z.array(z.string()).optional().describe('Replaces the contact\'s full tag list.'),
          customFields: customFieldsSchema
        }
      },
      handler: async (args) => {
        const body = { ...(args.customFields || {}) }
        if (args.newEmail) {
          body.email = args.newEmail
        }
        if (args.name) {
          await ensureNameField(client)
          body.name = args.name
        }
        if (args.tags) {
          body.tags = args.tags
        }

        const result = await client.patch(`/contacts/${encodeURIComponent(args.email)}`, body)
        return textResult(`Updated contact ${result.email}.`)
      }
    },
    {
      name: 'delete_contact',
      config: {
        title: 'Delete contact',
        description: 'Deletes a contact and removes them from every subscriber list they were on.',
        inputSchema: {
          email: z.string()
        }
      },
      handler: async (args) => {
        await client.del(`/contacts/${encodeURIComponent(args.email)}`)
        return textResult(`Deleted contact ${args.email}.`)
      }
    }
  ]
}
