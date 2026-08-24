import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const MAX_FAILURES_SHOWN = 10

export function createContactImportTools ({ client, resolveIdOptional }) {
  return [
    {
      name: 'import_contacts',
      config: {
        title: 'Bulk import contacts',
        description: 'Creates (or subscribes) many contacts at once, one at a time so a failure on one row does not stop the rest. Pass a subscriber list to subscribe every imported contact to it; omit it to just create bare contacts.',
        inputSchema: {
          contacts: z.array(z.object({
            email: z.string(),
            name: z.string().optional(),
            tags: z.array(z.string()).optional(),
            customFields: z.record(z.any()).optional()
          })).describe('The rows to import.'),
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The list to subscribe every imported contact to, by name - looked up automatically. Omit both this and subscriberListId to just create contacts without subscribing them to any list.'),
          status: z.enum(['active', 'unverified']).optional().describe('Only used when subscribing to a list. Defaults to triggering double opt-in (if the list has it enabled) or "active" otherwise. Pass "active" explicitly to skip double opt-in for every row.')
        }
      },
      handler: async (args) => {
        const listId = await resolveIdOptional({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })

        let succeeded = 0
        const failures = []

        for (const contact of args.contacts) {
          const body = { email: contact.email, ...(contact.customFields || {}) }
          if (contact.name) {
            body.name = contact.name
          }
          if (contact.tags) {
            body.tags = contact.tags
          }
          if (listId && args.status) {
            body.status = args.status
          }

          try {
            if (listId) {
              await client.post(`/subscriber-lists/${listId}/subscribers`, body)
            } else {
              await client.post('/contacts', body)
            }
            succeeded++
          } catch (err) {
            failures.push({ email: contact.email, reason: err.message })
          }
        }

        const summary = [`Imported ${succeeded}/${args.contacts.length} contact(s)${listId ? ' to the list' : ''}.`]
        if (failures.length) {
          const shown = failures.slice(0, MAX_FAILURES_SHOWN).map(f => `${f.email}: ${f.reason}`).join('; ')
          summary.push(`Failed (${failures.length}): ${shown}${failures.length > MAX_FAILURES_SHOWN ? '; ...' : ''}`)
        }
        return textResult(summary.join(' '))
      }
    }
  ]
}
