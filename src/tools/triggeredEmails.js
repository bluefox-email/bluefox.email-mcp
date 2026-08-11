import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createTriggeredEmailTools ({ client, resolveIdOrRequired, resolveIdOptional }) {
  return [
    {
      name: 'create_triggered_email',
      config: {
        title: 'Create triggered email',
        description: 'Creates a triggered email tied to a subscriber list - e.g. a welcome email sent to everyone on a list, or a subset of it, via send_triggered_email.',
        inputSchema: {
          name: z.string().describe('Internal name.'),
          subject: z.string(),
          body: z.string().describe('Email body as a Handlebars template string - supports merge tags like {{contact.name}} and {{unsubscribeLink}}, and feed loops. This tool cannot author bluefox.email\'s visual (Chamaileon) editor format or start from a saved template - content is always sent as plain html/text.'),
          bodyType: z.enum(['html', 'text']).optional().describe('Defaults to "text" if omitted.'),
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The subscriber list this triggered email is for, by name - looked up automatically. Provide this if you do not already have the id.'),
          previewText: z.string().optional().describe('Inbox preview text - ask the user for this if not given, it meaningfully affects open rates.'),
          senderIdentityId: z.string().optional(),
          senderIdentityEmail: z.string().optional().describe('Looked up automatically.'),
          replyTo: z.string().optional().describe('Reply-to email address recipients\' replies go to. Defaults to the sender identity\'s own email if omitted.'),
          excludeUnengaged: z.boolean().optional()
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
        const senderIdentity = await resolveIdOptional({
          id: args.senderIdentityId,
          name: args.senderIdentityEmail,
          resourcePath: '/sender-identities',
          filterField: 'email',
          label: 'sender identity'
        })

        const body = {
          name: args.name,
          subject: args.subject,
          subscriberListId,
          type: args.bodyType || 'text',
          document: args.body
        }
        if (args.previewText) {
          body.previewText = args.previewText
        }
        if (senderIdentity) {
          body.senderIdentity = senderIdentity
        }
        if (args.replyTo) {
          body.replyTo = args.replyTo
        }
        if (args.excludeUnengaged !== undefined) {
          body.excludeUnengaged = args.excludeUnengaged
        }

        const result = await client.post('/triggered-emails', body)
        return textResult(`Created triggered email "${result.name}" (id ${result._id}).`)
      }
    },
    {
      name: 'send_triggered_email',
      config: {
        title: 'Send triggered email',
        description: 'Sends an existing triggered email now, to every active subscriber on its list by default, or to a specific set of recipients.',
        inputSchema: {
          triggeredEmailId: z.string().optional(),
          triggeredEmailName: z.string().optional().describe('The triggered email to send, by name - looked up automatically. Provide this if you do not already have the id.'),
          recipients: z.array(z.string()).optional().describe('Specific email addresses to send to instead of the whole subscriber list. Omit to send to every active subscriber on the triggered email\'s own list.'),
          data: z.record(z.any()).optional().describe('Template variables to render into the email body.'),
          attachments: z.array(z.object({
            filename: z.string(),
            content: z.string().describe('Base64-encoded file content.')
          })).optional()
        }
      },
      handler: async (args) => {
        const triggeredEmailId = await resolveIdOrRequired({
          id: args.triggeredEmailId,
          name: args.triggeredEmailName,
          resourcePath: '/triggered-emails',
          filterField: 'name',
          label: 'triggered email'
        })

        const body = { triggeredId: triggeredEmailId }
        if (args.recipients) {
          body.emails = args.recipients
        }
        if (args.data) {
          body.data = args.data
        }
        if (args.attachments) {
          body.attachments = args.attachments
        }

        await client.post('/send-triggered', body)
        const target = args.recipients ? `${args.recipients.length} recipient(s)` : 'its subscriber list'
        return textResult(`Sent the triggered email to ${target}.`)
      }
    }
  ]
}
