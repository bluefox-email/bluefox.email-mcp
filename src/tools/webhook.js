import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

function formatWebhook (webhook) {
  const events = ['bounce', 'complaint', 'click', 'open', 'sent', 'failed', 'subscription'].filter(event => webhook[event])
  return `Webhook: ${webhook.url} - events: ${events.join(', ') || 'none'}.`
}

export function createWebhookTools ({ client }) {
  return [
    {
      name: 'manage_webhook',
      config: {
        title: 'Get, set, or remove the project webhook',
        description: 'A project has at most one webhook. Setting it always replaces the whole configuration (there is no partial update) - include every event flag you want enabled, not just the ones changing. secretKey must exactly match one of this project\'s existing API keys (ask the user for it from Project Settings > API Keys, since this tool cannot list them).',
        inputSchema: {
          action: z.enum(['get', 'set', 'delete']),
          url: z.string().optional().describe('set only - the endpoint bluefox.email will POST events to.'),
          secretKey: z.string().optional().describe('set only - must match one of the project\'s API keys.'),
          bounce: z.boolean().optional().describe('set only.'),
          complaint: z.boolean().optional().describe('set only.'),
          click: z.boolean().optional().describe('set only.'),
          open: z.boolean().optional().describe('set only.'),
          sent: z.boolean().optional().describe('set only.'),
          failed: z.boolean().optional().describe('set only.'),
          subscription: z.boolean().optional().describe('set only.')
        }
      },
      handler: async (args) => {
        if (args.action === 'get') {
          const webhook = await client.get('/webhook')
          if (!webhook) {
            return textResult('This project has no webhook configured.')
          }
          return textResult(formatWebhook(webhook))
        }

        if (args.action === 'set') {
          const result = await client.patch('/webhook', {
            url: args.url,
            secretKey: args.secretKey,
            bounce: args.bounce,
            complaint: args.complaint,
            click: args.click,
            open: args.open,
            sent: args.sent,
            failed: args.failed,
            subscription: args.subscription
          })
          return textResult(`Set ${formatWebhook(result)}`)
        }

        await client.del('/webhook')
        return textResult('Removed the webhook.')
      }
    }
  ]
}
