import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createSubscriberListTools ({ client, resolveIdOptional, resolveIdOrRequired }) {
  return [
    {
      name: 'create_subscriber_list',
      config: {
        title: 'Create subscriber list',
        description: 'Creates a new subscriber list (audience) that contacts, campaigns, and triggered emails can reference.',
        inputSchema: {
          name: z.string().describe('List name.'),
          description: z.string().describe('A short description of what this list is for.'),
          private: z.boolean().optional().describe('Private lists are not selectable as a "test email" recipient list target from a public signup form. Defaults to false.'),
          doubleOptInActive: z.boolean().optional().describe('Require confirmation before a new subscriber is fully active. The referenced transactional email\'s body MUST contain {{verifyLink}} - the API rejects enabling this otherwise, since that\'s the only way a contact can confirm.'),
          doubleOptInTransactionalEmailId: z.string().optional().describe('The transactional email that sends the confirmation message, by id. Required if doubleOptInActive is true. Its body must include {{verifyLink}}.'),
          doubleOptInTransactionalEmailName: z.string().optional().describe('The transactional email that sends the confirmation message, by name - looked up automatically. Required if doubleOptInActive is true and the id is not already known. Its body must include {{verifyLink}}.'),
          doubleOptInRedirectLink: z.string().optional().describe('Where to send the contact after they confirm.'),
          confirmationTitle: z.string().optional(),
          confirmationMessage: z.string().optional()
        }
      },
      handler: async (args) => {
        const body = {
          name: args.name,
          description: args.description
        }
        if (args.private !== undefined) {
          body.private = args.private
        }

        if (args.doubleOptInActive || args.doubleOptInTransactionalEmailId || args.doubleOptInTransactionalEmailName) {
          const emailId = await resolveIdOptional({
            id: args.doubleOptInTransactionalEmailId,
            name: args.doubleOptInTransactionalEmailName,
            resourcePath: '/transactional-emails',
            filterField: 'name',
            label: 'transactional email'
          })
          body.doubleOptIn = {
            active: args.doubleOptInActive,
            emailId,
            redirectLink: args.doubleOptInRedirectLink,
            confirmationTitle: args.confirmationTitle,
            confirmationMessage: args.confirmationMessage
          }
        }

        const result = await client.post('/subscriber-lists', body)
        return textResult(`Created subscriber list "${result.name}" (id ${result._id}).`)
      }
    },
    {
      name: 'update_subscriber_list',
      config: {
        title: 'Update subscriber list',
        description: 'Updates an existing subscriber list\'s name, description, privacy, or double opt-in settings.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The list to update, by name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional(),
          description: z.string().optional(),
          private: z.boolean().optional(),
          doubleOptInActive: z.boolean().optional().describe('The referenced transactional email\'s body MUST contain {{verifyLink}} - the API rejects enabling this otherwise.'),
          doubleOptInTransactionalEmailId: z.string().optional().describe('Its body must include {{verifyLink}}.'),
          doubleOptInTransactionalEmailName: z.string().optional().describe('Looked up automatically. Its body must include {{verifyLink}}.'),
          doubleOptInRedirectLink: z.string().optional(),
          confirmationTitle: z.string().optional(),
          confirmationMessage: z.string().optional()
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

        const body = {}
        if (args.newName) {
          body.name = args.newName
        }
        if (args.description) {
          body.description = args.description
        }
        if (args.private !== undefined) {
          body.private = args.private
        }

        const wantsDoubleOptInChange = args.doubleOptInActive !== undefined ||
          args.doubleOptInTransactionalEmailId ||
          args.doubleOptInTransactionalEmailName ||
          args.doubleOptInRedirectLink ||
          args.confirmationTitle ||
          args.confirmationMessage
        if (wantsDoubleOptInChange) {
          // doubleOptIn is a nested object the API replaces wholesale when given, not deep-merged - fetch the
          // current one first so fields the caller didn't mention aren't silently wiped out.
          const current = await client.get(`/subscriber-lists/${id}`)
          const emailId = await resolveIdOptional({
            id: args.doubleOptInTransactionalEmailId,
            name: args.doubleOptInTransactionalEmailName,
            resourcePath: '/transactional-emails',
            filterField: 'name',
            label: 'transactional email'
          })
          body.doubleOptIn = {
            ...current.doubleOptIn,
            active: args.doubleOptInActive !== undefined ? args.doubleOptInActive : current.doubleOptIn?.active,
            emailId: emailId || current.doubleOptIn?.emailId,
            redirectLink: args.doubleOptInRedirectLink || current.doubleOptIn?.redirectLink,
            confirmationTitle: args.confirmationTitle || current.doubleOptIn?.confirmationTitle,
            confirmationMessage: args.confirmationMessage || current.doubleOptIn?.confirmationMessage
          }
        }

        const result = await client.patch(`/subscriber-lists/${id}`, body)
        return textResult(`Updated subscriber list "${result.name}".`)
      }
    },
    {
      name: 'get_subscriber_list',
      config: {
        title: 'Get subscriber list',
        description: 'Looks up a subscriber list by name (with its current stats), or lists every subscriber list on the project if no name is given.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Omit both this and subscriberListId to list every subscriber list instead.')
        }
      },
      handler: async (args) => {
        if (!args.subscriberListId && !args.subscriberListName) {
          const list = await client.get('/subscriber-lists', { limit: 30 })
          if (list.count === 0) {
            return textResult('This project has no subscriber lists yet.')
          }
          const names = list.items.map(item => item.name).join(', ')
          return textResult(`${list.count} subscriber list(s): ${names}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const [detail, stats] = await Promise.all([
          client.get(`/subscriber-lists/${id}`),
          client.get(`/subscriber-lists/${id}/stats`)
        ])
        return textResult(
          `"${detail.name}" - ${detail.description || 'no description'}. ` +
          `${stats.active} active, ${stats.paused} paused, ${stats.unsubscribed} unsubscribed, ${stats.unverified} unverified.`
        )
      }
    },
    {
      name: 'delete_subscriber_list',
      config: {
        title: 'Delete subscriber list',
        description: 'Deletes a subscriber list and its subscribers. Fails if a triggered email, campaign, or automation still depends on it.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.')
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
        await client.del(`/subscriber-lists/${id}`)
        return textResult('Deleted the subscriber list.')
      }
    }
  ]
}
