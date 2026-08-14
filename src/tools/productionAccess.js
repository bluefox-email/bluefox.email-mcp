import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

function formatSendingRates (sendingRates) {
  if (!sendingRates?.length) {
    return 'none configured'
  }
  return sendingRates.map(r => `${r.region}: ${r.ratePerSecond}/s`).join(', ')
}

function formatLimitIncreases (limitIncreases) {
  if (!limitIncreases?.length) {
    return 'none requested yet'
  }
  return limitIncreases.map(i =>
    `${i.createdAt ? new Date(i.createdAt).toISOString() : 'unknown date'}: requested ${i.requestedLimit} (${i.status}` +
    `${i.status !== 'pending' && i.approvedLimit != null ? `, approved limit ${i.approvedLimit}` : ''}) - ${i.reason}`
  ).join('\n')
}

export function createProductionAccessTools ({ client }) {
  return [
    {
      name: 'apply_for_production_access',
      config: {
        title: 'Apply for production access',
        description: 'Submits a production access request for this project. This is the standard way for a project to move past sandbox limits while still sending through bluefox.email\'s shared infrastructure - no AWS account of its own required. (set_byo_aws_config is the separate, less common path for a project that wants to send through its own AWS account instead.) Requires at least one domain with SPF, MX, and DKIM all verified first (add one with the sending-setup tools, then check_dns until it passes) - resubmitting after a decline only requires DKIM to still be verified.',
        inputSchema: {
          volume: z.number().describe('Expected monthly sending volume.'),
          whyBluefox: z.string().describe('Why this project is using bluefox.email.'),
          typeOfEmails: z.string().describe('What kind of emails will be sent.'),
          contactsSource: z.string().describe('Where the contact list comes from.'),
          productDescription: z.string(),
          website: z.string()
        }
      },
      handler: async (args) => {
        const result = await client.post('/production-access', args)
        return textResult(`Production access request submitted (status: ${result.status}).`)
      }
    },
    {
      name: 'get_production_access_status',
      config: {
        title: 'Get production access status',
        description: 'Reports this project\'s production access request status, domain verification status, current sending limits and per-region rates, and the full history of limit increase requests.',
        inputSchema: {}
      },
      handler: async () => {
        const result = await client.get('/production-access')
        const parts = [
          `request: ${result.requestStatus}`,
          `domain: ${result.domainStatus}${result.verifiedDomain ? ` (${result.verifiedDomain})` : ''}`,
          `monthly limit: ${result.monthlyLimit}`,
          `sending rates: ${formatSendingRates(result.sendingRates)}`
        ]
        return textResult(`${parts.join(', ')}.\nLimit increase history:\n${formatLimitIncreases(result.limitIncreases)}`)
      }
    },
    {
      name: 'request_limit_increase',
      config: {
        title: 'Request a sending limit increase',
        description: 'Requests an increase to this project\'s monthly sending limit. Only available for projects already approved for production access.',
        inputSchema: {
          monthlyLimit: z.number().describe('The new monthly limit being requested. Must be higher than the current limit (0 is a special case allowed regardless of the current limit).'),
          reason: z.string().describe('Why the increase is needed - at least 10 characters.')
        }
      },
      handler: async (args) => {
        const result = await client.post('/production-access/limit-increase', args)
        const pending = result.limitIncreases[result.limitIncreases.length - 1]
        return textResult(`Requested a limit increase to ${pending.requestedLimit} (status: ${pending.status}).`)
      }
    }
  ]
}
