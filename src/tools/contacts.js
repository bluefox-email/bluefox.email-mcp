import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

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

export function createContactTools ({ client }) {
  return [
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
        description: 'Looks up a contact by email, including which subscriber lists they belong to.',
        inputSchema: {
          email: z.string()
        }
      },
      handler: async (args) => {
        const result = await client.get(`/contacts/${encodeURIComponent(args.email)}`)
        const lists = result._lists?.length ? result._lists.join(', ') : 'none'
        return textResult(`${result.email}${result.name ? ` (${result.name})` : ''} - tags: ${(result.tags || []).join(', ') || 'none'} - subscriber lists: ${lists}`)
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
