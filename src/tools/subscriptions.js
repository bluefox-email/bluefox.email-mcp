import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const customFieldsSchema = z.record(z.any()).optional().describe('Custom contact field values, keyed by field name (e.g. {"plan": "pro"}) - a name that is not already a registered custom field on this project is silently dropped, not an error.')

function formatSubscriber (item) {
  const status = item.status === 'paused' && item.pausedUntil
    ? `paused until ${new Date(item.pausedUntil).toISOString().slice(0, 10)}`
    : item.status
  return `${item.email} (${status})`
}

// These are the only tools that reach the flat /v1/subscriber-lists/{id}[...] endpoints (via the client's
// *Absolute methods) instead of the /v1/projectId/{projectId}/... ones every other tool uses - list membership
// (who's on a list, and their per-list status) and subscribing/updating a contact within a specific list live
// under that different, list-id-scoped path shape in the public API, not under subscriber-lists.js's CRUD-on-the-
// list-itself routes or contacts.js's project-wide contact routes.
export function createSubscriptionTools ({ client, resolveIdOrRequired }) {
  return [
    {
      name: 'list_list_subscribers',
      config: {
        title: 'List the subscribers on a subscriber list',
        description: 'Lists the contacts subscribed to a subscriber list, including each one\'s per-list status (active, unsubscribed, paused, or unverified). This is different from get_contact, which only shows which list names a contact belongs to, not their status on each.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The list to inspect, by name - looked up automatically. Provide this if you do not already have the id.'),
          limit: z.number().optional().describe('Max subscribers to return. Defaults to 10.'),
          skip: z.number().optional().describe('Number of subscribers to skip, for pagination.')
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const result = await client.getAbsolute(`/v1/subscriber-lists/${id}`, { limit: args.limit, skip: args.skip })
        if (result.count === 0) {
          return textResult('This list has no subscribers yet.')
        }
        const summary = result.items.map(formatSubscriber).join(', ')
        return textResult(`${result.count} subscriber(s): ${summary}${result.count > result.items.length ? ' (more not shown)' : ''}.`)
      }
    },
    {
      name: 'get_list_subscriber',
      config: {
        title: 'Get a contact\'s status on a subscriber list',
        description: 'Looks up a single contact\'s subscription status (active, unsubscribed, paused, or unverified) on a specific subscriber list, by email.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.'),
          email: z.string()
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const result = await client.getAbsolute(`/v1/subscriber-lists/${id}/${encodeURIComponent(args.email)}`)
        return textResult(formatSubscriber(result))
      }
    },
    {
      name: 'add_list_subscriber',
      config: {
        title: 'Add (subscribe) a contact to a subscriber list',
        description: 'Subscribes a contact to a subscriber list, creating the contact first if it does not already exist. If the list has double opt-in enabled, the contact stays "unverified" until they confirm by email - pass status: "active" to skip double opt-in and activate immediately instead.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.'),
          email: z.string(),
          name: z.string().optional(),
          tags: z.array(z.string()).optional().describe('Tags are created automatically if they do not already exist.'),
          status: z.enum(['active', 'unverified']).optional().describe('Defaults to triggering double opt-in (if the list has it enabled) or "active" (if it doesn\'t). Pass "active" explicitly to skip double opt-in.'),
          customFields: customFieldsSchema
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const body = { email: args.email, ...(args.customFields || {}) }
        if (args.name) {
          body.name = args.name
        }
        if (args.tags) {
          body.tags = args.tags
        }
        if (args.status) {
          body.status = args.status
        }
        const result = await client.postAbsolute(`/v1/subscriber-lists/${id}`, body)
        return textResult(`Subscribed ${result.email} to the list (status: ${result.status}).`)
      }
    },
    {
      name: 'update_list_subscriber',
      config: {
        title: 'Update a contact\'s subscription status on a list',
        description: 'Updates a contact\'s status on a specific subscriber list - e.g. unsubscribe, resubscribe, or pause them on that one list, without affecting their other list subscriptions. Can also update their email/name/tags/custom fields as seen from that list.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.'),
          email: z.string().describe('The contact\'s current email, to find them by.'),
          newEmail: z.string().optional().describe('Set this to change the contact\'s email address.'),
          name: z.string().optional(),
          tags: z.array(z.string()).optional().describe('Replaces the contact\'s full tag list.'),
          status: z.enum(['active', 'paused', 'unsubscribed']).optional(),
          pausedUntil: z.string().optional().describe('Required (a future ISO date) when status is "paused".'),
          customFields: customFieldsSchema
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const body = { ...(args.customFields || {}) }
        if (args.newEmail) {
          body.email = args.newEmail
        }
        if (args.name) {
          body.name = args.name
        }
        if (args.tags) {
          body.tags = args.tags
        }
        if (args.status) {
          body.status = args.status
        }
        if (args.pausedUntil) {
          body.pausedUntil = args.pausedUntil
        }
        const result = await client.patchAbsolute(`/v1/subscriber-lists/${id}/${encodeURIComponent(args.email)}`, body)
        return textResult(`Updated ${result.email} on the list (status: ${result.status}).`)
      }
    }
  ]
}
