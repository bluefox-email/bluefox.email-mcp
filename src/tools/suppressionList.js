import { z } from 'zod'
import { textResult, ResolveError } from '../helpers/errors.js'

export function createSuppressionListTools ({ client }) {
  return [
    {
      name: 'manage_suppression_list',
      config: {
        title: 'Manage the project suppression list',
        description: 'This project\'s own manually-managed suppression list - adding an email here blocks all future sends to it from this project (campaigns, transactional/triggered sends, and new subscriptions). This is separate from the account-wide bounce/complaint suppression list, which is auto-managed and has no public API.',
        inputSchema: {
          action: z.enum(['list', 'add', 'remove']),
          email: z.string().optional().describe('add - required. remove - used to look the entry up if entryId is not already known.'),
          reason: z.string().optional().describe('add only - free-text note, e.g. "customer complaint". Optional.'),
          entryId: z.string().optional().describe('remove, if already known.')
        }
      },
      handler: async (args) => {
        if (args.action === 'list') {
          const list = await client.get('/suppression-list', { limit: 30 })
          if (list.count === 0) {
            return textResult('The suppression list is empty.')
          }
          const summary = list.items.map(entry => entry.reason ? `${entry.email} (${entry.reason})` : entry.email).join(', ')
          return textResult(`${list.count} entr(y/ies): ${summary}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        if (args.action === 'add') {
          const result = await client.post('/suppression-list', { email: args.email, reason: args.reason })
          return textResult(`Added ${result.email} to the suppression list.`)
        }

        let entryId = args.entryId
        if (!entryId) {
          if (!args.email) {
            throw new ResolveError('Either an entryId or an email is required to remove a suppression list entry.')
          }
          const list = await client.get('/suppression-list', { filter: { email: args.email }, limit: 2 })
          if (!list.items.length) {
            throw new ResolveError(`"${args.email}" is not on the suppression list.`)
          }
          entryId = list.items[0]._id
        }

        await client.del(`/suppression-list/${entryId}`)
        return textResult('Removed the entry from the suppression list.')
      }
    }
  ]
}
