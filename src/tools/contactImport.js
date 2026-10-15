import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const MAX_FAILURES_SHOWN = 10
const IMPORT_BATCH_SIZE = 1000

export function createContactImportTools ({ client, resolveIdOptional }) {
  return [
    {
      name: 'import_contacts',
      config: {
        title: 'Bulk import contacts',
        description: 'Creates (or subscribes) many contacts at once; a failure on one row does not stop the rest. Pass a subscriber list to add every imported contact to it as active - like the app\'s CSV import, this skips double opt-in and sends no verification email, so only import people who already agreed to your emails - confirm that with the user first. Contacts already on the list keep their current status (an unsubscribed contact stays unsubscribed), so import cannot be used to resubscribe anyone. Prefer this over add_list_subscriber for many contacts, since that sends a verification email to each one on a double opt-in list. Omit the list to just create bare contacts.',
        inputSchema: {
          contacts: z.array(z.object({
            email: z.string(),
            name: z.string().optional(),
            tags: z.array(z.string()).optional(),
            customFields: z.record(z.any()).optional()
          })).describe('The rows to import.'),
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The list to subscribe every imported contact to, by name - looked up automatically. Omit both this and subscriberListId to just create contacts without subscribing them to any list.'),
          status: z.enum(['active', 'unverified']).optional().describe('Ignored - contacts imported to a list are always added as "active".')
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

        const rows = args.contacts.map(contact => {
          const body = { email: contact.email, ...(contact.customFields || {}) }
          if (contact.name) {
            body.name = contact.name
          }
          if (contact.tags) {
            body.tags = contact.tags
          }
          return body
        })

        let succeeded = 0
        let alreadyOnList = 0
        const failures = []

        if (listId) {
          for (let index = 0; index < rows.length; index += IMPORT_BATCH_SIZE) {
            const result = await client.post(`/subscriber-lists/${listId}/import`, { contacts: rows.slice(index, index + IMPORT_BATCH_SIZE) })
            succeeded += result.imported
            alreadyOnList += result.alreadyOnList
            failures.push(...result.errors.map(error => ({ email: error.email, reason: error.message })))
          }
        } else {
          for (const body of rows) {
            try {
              await client.post('/contacts', body)
              succeeded++
            } catch (err) {
              failures.push({ email: body.email, reason: err.message })
            }
          }
        }

        const summary = [`Imported ${succeeded}/${args.contacts.length} contact(s)${listId ? ' to the list' : ''}.`]
        if (alreadyOnList) {
          summary.push(`${alreadyOnList} were already on the list and kept their current status.`)
        }
        if (failures.length) {
          const shown = failures.slice(0, MAX_FAILURES_SHOWN).map(f => `${f.email}: ${f.reason}`).join('; ')
          summary.push(`Failed (${failures.length}): ${shown}${failures.length > MAX_FAILURES_SHOWN ? '; ...' : ''}`)
        }
        return textResult(summary.join(' '))
      }
    }
  ]
}
