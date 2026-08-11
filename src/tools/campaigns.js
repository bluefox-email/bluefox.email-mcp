import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createCampaignTools ({ client, resolveIdOrRequired, resolveIdOptional }) {
  return [
    {
      name: 'create_campaign',
      config: {
        title: 'Create campaign',
        description: 'Creates a campaign email, optionally scheduling it to send. Provide either a subscriberListId or a subscriberListName (not both required, but at least one).',
        inputSchema: {
          name: z.string().describe('Internal campaign name - not shown to recipients.'),
          subject: z.string().describe('Email subject line.'),
          body: z.string().describe('Email body as a Handlebars template string - supports merge tags like {{contact.name}} and {{unsubscribeLink}}, and feed loops. This tool cannot author bluefox.email\'s visual (Chamaileon) editor format or start from a saved template - content is always sent as plain html/text.'),
          bodyType: z.enum(['html', 'text']).optional().describe('Defaults to "text" if omitted.'),
          subscriberListId: z.string().optional().describe('The subscriber list to send to, by id.'),
          subscriberListName: z.string().optional().describe('The subscriber list to send to, by name - looked up automatically. Provide this if you do not already have the id.'),
          segmentId: z.string().optional().describe('Optional - narrows the subscriber list down further, by id.'),
          segmentName: z.string().optional().describe('Optional - narrows the subscriber list down further, by segment name.'),
          scheduledFor: z.string().optional().describe('ISO 8601 date-time to schedule sending. Resolve relative phrases like "tomorrow at 8am" to an absolute ISO datetime yourself before calling this tool, using the current date/time. Omit to save as a draft instead of scheduling.'),
          timeZone: z.string().optional().describe('IANA time zone (e.g. "America/New_York") used to interpret scheduledFor. Defaults to UTC.'),
          previewText: z.string().optional().describe('Inbox preview text - ask the user for this if not given, it meaningfully affects open rates.'),
          replyTo: z.string().optional().describe('Reply-to email address recipients\' replies go to. Defaults to the sender identity\'s own email if omitted.'),
          excludeUnengaged: z.boolean().optional().describe('Skip contacts flagged as unengaged when sending.')
        }
      },
      handler: async (args) => {
        const subscriberListId = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const segmentId = await resolveIdOptional({
          id: args.segmentId,
          name: args.segmentName,
          resourcePath: '/segments',
          filterField: 'name',
          label: 'segment'
        })

        const body = {
          name: args.name,
          subject: args.subject,
          timeZone: args.timeZone || 'UTC',
          subscriberListId,
          type: args.bodyType || 'text',
          document: args.body
        }
        if (segmentId) {
          body.segmentId = segmentId
        }
        if (args.previewText) {
          body.previewText = args.previewText
        }
        if (args.replyTo) {
          body.replyTo = args.replyTo
        }
        if (args.excludeUnengaged !== undefined) {
          body.excludeUnengaged = args.excludeUnengaged
        }
        if (args.scheduledFor) {
          body.status = 'scheduled'
          body.scheduledTo = args.scheduledFor
        }

        const result = await client.post('/campaigns', body)
        const scheduleNote = args.scheduledFor ? ` and scheduled for ${args.scheduledFor}` : ' as a draft'
        return textResult(`Created campaign "${result.name}" (id ${result._id})${scheduleNote}.`)
      }
    }
  ]
}
