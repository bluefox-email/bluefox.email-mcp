import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { extractCustomFields } from '../helpers/contactFields.js'

const MAX_FAILURES_SHOWN = 10

function csvEscape (value) {
  const str = value === undefined || value === null ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsv (rows, fields) {
  const lines = [fields.join(',')]
  for (const row of rows) {
    lines.push(fields.map(field => csvEscape(row[field])).join(','))
  }
  return lines.join('\n')
}

export function createContactOpsTools ({ client, resolveIdOrRequired }) {
  async function runPerContact (emails, action) {
    let succeeded = 0
    const failures = []
    for (const email of emails) {
      try {
        await action(email)
        succeeded++
      } catch (err) {
        failures.push({ email, reason: err.message })
      }
    }
    return { succeeded, failures }
  }

  function formatBatchResult (verb, total, succeeded, failures) {
    const summary = [`${verb} ${succeeded}/${total} contact(s).`]
    if (failures.length) {
      const shown = failures.slice(0, MAX_FAILURES_SHOWN).map(f => `${f.email}: ${f.reason}`).join('; ')
      summary.push(`Failed (${failures.length}): ${shown}${failures.length > MAX_FAILURES_SHOWN ? '; ...' : ''}`)
    }
    return textResult(summary.join(' '))
  }

  return [
    {
      name: 'bulk_update_contacts',
      config: {
        title: 'Bulk update contacts',
        description: 'Applies one action to many contacts at once (by email), one at a time so a failure on one does not stop the rest.',
        inputSchema: {
          emails: z.array(z.string()).describe('The contacts to act on.'),
          action: z.enum(['delete', 'add_tags', 'remove_tags', 'add_to_suppression_list', 'subscribe_to_list', 'unsubscribe_from_list']),
          tags: z.array(z.string()).optional().describe('Required for add_tags/remove_tags.'),
          subscriberListId: z.string().optional().describe('Required for subscribe_to_list/unsubscribe_from_list.'),
          subscriberListName: z.string().optional().describe('Required for subscribe_to_list/unsubscribe_from_list, if the id is not already known - looked up automatically.')
        }
      },
      handler: async (args) => {
        let listId
        if (args.action === 'subscribe_to_list' || args.action === 'unsubscribe_from_list') {
          listId = await resolveIdOrRequired({
            id: args.subscriberListId,
            name: args.subscriberListName,
            resourcePath: '/subscriber-lists',
            filterField: 'name',
            label: 'subscriber list'
          })
        }

        let action
        let verb
        if (args.action === 'delete') {
          verb = 'Deleted'
          action = email => client.del(`/contacts/${encodeURIComponent(email)}`)
        } else if (args.action === 'add_tags' || args.action === 'remove_tags') {
          verb = args.action === 'add_tags' ? 'Tagged' : 'Untagged'
          action = async email => {
            const contact = await client.get(`/contacts/${encodeURIComponent(email)}`)
            const current = new Set(contact.tags || [])
            for (const tag of (args.tags || [])) {
              if (args.action === 'add_tags') {
                current.add(tag)
              } else {
                current.delete(tag)
              }
            }
            return client.patch(`/contacts/${encodeURIComponent(email)}`, { tags: [...current] })
          }
        } else if (args.action === 'add_to_suppression_list') {
          verb = 'Suppressed'
          action = email => client.post('/suppression-list', { email })
        } else if (args.action === 'subscribe_to_list') {
          verb = 'Subscribed'
          action = email => client.postAbsolute(`/v1/subscriber-lists/${listId}`, { email })
        } else {
          verb = 'Unsubscribed'
          action = email => client.patchAbsolute(`/v1/subscriber-lists/${listId}/${encodeURIComponent(email)}`, { status: 'unsubscribed' })
        }

        const { succeeded, failures } = await runPerContact(args.emails, action)
        return formatBatchResult(verb, args.emails.length, succeeded, failures)
      }
    },
    {
      name: 'clean_contacts',
      config: {
        title: 'Clean up bounced or complained contacts',
        description: 'Finds contacts already on the project suppression list for a given reason (bounce or complaint) and, if requested, deletes them. Without deleteContacts, just reports who would be affected.',
        inputSchema: {
          reason: z.enum(['bounce', 'complaint']),
          deleteContacts: z.boolean().optional().describe('Defaults to false (report only). Pass true to actually delete the matching contacts.')
        }
      },
      handler: async (args) => {
        const list = await client.get('/suppression-list', { filter: { reason: args.reason }, limit: 'unlimited' })
        if (!list.count) {
          return textResult(`No contacts are suppressed for "${args.reason}".`)
        }
        const emails = list.items.map(item => item.email)

        if (!args.deleteContacts) {
          const shown = emails.slice(0, MAX_FAILURES_SHOWN).join(', ')
          return textResult(`${list.count} contact(s) suppressed for "${args.reason}": ${shown}${emails.length > MAX_FAILURES_SHOWN ? ', ...' : ''}. Pass deleteContacts: true to delete them.`)
        }

        const { succeeded, failures } = await runPerContact(emails, email => client.del(`/contacts/${encodeURIComponent(email)}`).catch(err => {
          // a suppressed email with no matching contact (already deleted, or suppressed before ever being a contact) isn't a real failure
          if (err.name === 'NOT_FOUND') {
            return undefined
          }
          throw err
        }))
        return formatBatchResult('Deleted', emails.length, succeeded, failures)
      }
    },
    {
      name: 'export_contacts',
      config: {
        title: 'Export contacts to a CSV file',
        description: 'Downloads every contact on the project to a local CSV file (email, name, tags, custom fields, subscriber lists, engagement dates, created/updated timestamps) and reports the saved path.',
        inputSchema: {}
      },
      handler: async () => {
        const rows = []
        let skip = 0
        const limit = 100
        let total = Infinity
        while (rows.length < total) {
          const page = await client.get('/contacts', { limit, skip })
          total = page.count
          rows.push(...page.items)
          if (!page.items.length) {
            break
          }
          skip += limit
        }

        if (!rows.length) {
          return textResult('This project has no contacts to export.')
        }

        const customFieldNames = [...new Set(rows.flatMap(row => Object.keys(extractCustomFields(row))))]
        const fields = ['email', 'name', 'tags', '_lists', ...customFieldNames, 'lastOpenDate', 'lastClickDate', 'lastReceiveDate', 'createdAt', 'updatedAt']
        const flatRows = rows.map(row => ({
          email: row.email,
          name: row.name,
          tags: (row.tags || []).join(';'),
          _lists: (row._lists || []).join(';'),
          ...extractCustomFields(row),
          lastOpenDate: row.lastOpenDate,
          lastClickDate: row.lastClickDate,
          lastReceiveDate: row.lastReceiveDate,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }))

        const filePath = path.join(os.tmpdir(), `bluefox-contacts-export-${Date.now()}.csv`)
        await fs.writeFile(filePath, toCsv(flatRows, fields), 'utf8')

        return textResult(`Exported ${rows.length} contact(s) to ${filePath}.`)
      }
    },
    {
      name: 'resend_verification_email',
      config: {
        title: 'Resend a double opt-in verification email',
        description: 'Resends the confirmation email to a contact who is still "unverified" on a list with double opt-in enabled.',
        inputSchema: {
          email: z.string(),
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.')
        }
      },
      handler: async (args) => {
        const listId = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        await client.post(`/subscriber-lists/${listId}/contacts/${encodeURIComponent(args.email)}/resend-verification-email`)
        return textResult(`Resent the verification email to ${args.email}.`)
      }
    }
  ]
}
