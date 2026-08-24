import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const RESOURCE_PATH = {
  campaign: '/campaigns',
  transactional: '/transactional-emails',
  triggered: '/triggered-emails'
}

const LABEL = {
  campaign: 'campaign',
  transactional: 'transactional email',
  triggered: 'triggered email'
}

export function createTestEmailTools ({ client, resolveIdOrRequired, resolveIdOptional }) {
  return [
    {
      name: 'send_test_email',
      config: {
        title: 'Send test email',
        description: 'Sends a one-off test send of a campaign, transactional email, or triggered email, to a specific address or to a private subscriber list, without affecting real send stats. Provide either "to" or a subscriber list (not both) - sending to a subscriber list only works if that list is private.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('The campaign/transactional/triggered email to test, by name - looked up automatically. Provide this if you do not already have the id.'),
          to: z.string().optional().describe('Recipient email address for the test send.'),
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('A private subscriber list to send the test to instead of a single address - looked up automatically.'),
          data: z.record(z.any()).optional().describe('Template variables to render into the email body.')
        }
      },
      handler: async (args) => {
        if (!args.to && !args.subscriberListId && !args.subscriberListName) {
          throw new Error('Please specify a recipient by email (to) or by subscriber list.')
        }

        const id = await resolveIdOrRequired({
          id: args.emailId,
          name: args.emailName,
          resourcePath: RESOURCE_PATH[args.type],
          filterField: 'name',
          label: LABEL[args.type]
        })
        const subscriberListId = await resolveIdOptional({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })

        const body = { type: args.type }
        if (args.to) {
          body.email = args.to
        }
        if (subscriberListId) {
          body.subscriberListId = subscriberListId
        }
        if (args.data) {
          body.data = args.data
        }

        await client.post(`/test-email/${id}`, body)
        const target = args.to || 'the subscriber list'
        return textResult(`Sent a test ${LABEL[args.type]} to ${target}.`)
      }
    }
  ]
}
