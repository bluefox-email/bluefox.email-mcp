import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createTransactionalEmailTools ({ client, resolveIdOrRequired, resolveIdOptional }) {
  return [
    {
      name: 'create_transactional_email',
      config: {
        title: 'Create transactional email',
        description: 'Creates a transactional email template (e.g. order confirmations, password resets) - a single, reusable email sent one recipient at a time via send_transactional_email.',
        inputSchema: {
          name: z.string().describe('Internal name.'),
          subject: z.string(),
          body: z.string().describe('Email body as a Handlebars template string. Supports {{contact.email}}/{{contact.<customField>}} merge tags, plus any key later passed as `data` when sending (available at the top level, e.g. sending data:{orderId:123} makes {{orderId}} available - not {{data.orderId}}). unsubscribeLink/pauseSubscriptionLink are NOT available on transactional emails. If this email will be used as a double opt-in confirmation email (see create_subscriber_list/create_signup_form), the body MUST include {{verifyLink}} somewhere - that\'s the only way a contact can confirm their subscription. This tool cannot author bluefox.email\'s visual (Chamaileon) editor format or start from a saved template - content is always sent as plain html/text.'),
          bodyType: z.enum(['html', 'text']).optional().describe('Defaults to "text" if omitted.'),
          previewText: z.string().optional().describe('Inbox preview text - ask the user for this if not given, it meaningfully affects open rates.'),
          senderIdentityId: z.string().optional(),
          senderIdentityEmail: z.string().optional().describe('The sender identity to send from, by its email address - looked up automatically.'),
          replyTo: z.string().optional().describe('Reply-to email address recipients\' replies go to. Defaults to the sender identity\'s own email if omitted.')
        }
      },
      handler: async (args) => {
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

        const result = await client.post('/transactional-emails', body)
        return textResult(`Created transactional email "${result.name}" (id ${result._id}).`)
      }
    },
    {
      name: 'send_transactional_email',
      config: {
        title: 'Send transactional email',
        description: 'Sends an existing transactional email to a single recipient right now.',
        inputSchema: {
          transactionalEmailId: z.string().optional(),
          transactionalEmailName: z.string().optional().describe('The transactional email to send, by name - looked up automatically. Provide this if you do not already have the id.'),
          to: z.string().describe('Recipient email address.'),
          data: z.record(z.any()).optional().describe('Template variables to render into the email body (e.g. {"orderId": "12345"}).'),
          attachments: z.array(z.object({
            filename: z.string(),
            content: z.string().describe('Base64-encoded file content.')
          })).optional()
        }
      },
      handler: async (args) => {
        const transactionalEmailId = await resolveIdOrRequired({
          id: args.transactionalEmailId,
          name: args.transactionalEmailName,
          resourcePath: '/transactional-emails',
          filterField: 'name',
          label: 'transactional email'
        })

        const body = { email: args.to, transactionalId: transactionalEmailId }
        if (args.data) {
          body.data = args.data
        }
        if (args.attachments) {
          body.attachments = args.attachments
        }

        await client.post('/send-transactional', body)
        return textResult(`Sent the transactional email to ${args.to}.`)
      }
    }
  ]
}
