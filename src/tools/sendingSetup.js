import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createSendingSetupTools ({ client }) {
  return [
    {
      name: 'manage_sending_setup',
      config: {
        title: 'Manage sending domains and sender identities',
        description: 'Lists, adds, checks DNS verification for, or removes the domains and sender identities emails are sent from. A sender identity\'s email address domain must already be added and DKIM-verified before it can be created. Only available on production (not sandbox) projects.',
        inputSchema: {
          resource: z.enum(['domain', 'sender_identity']),
          action: z.enum(['list', 'create', 'delete', 'check_dns']).describe('check_dns is domain-only - re-checks DNS records and can auto-create a default sender identity once DKIM passes.'),
          domainId: z.string().optional().describe('Required for domain delete/check_dns.'),
          senderIdentityId: z.string().optional().describe('Required for sender_identity delete.'),
          domain: z.string().optional().describe('domain create only, e.g. "example.com".'),
          region: z.string().optional().describe('Required for domain/sender_identity create - an AWS region this project is set up to send from.'),
          email: z.string().optional().describe('sender_identity create only - the from-address to send as. Its domain must already be a verified domain in the given region.'),
          name: z.string().optional().describe('sender_identity create only - a display name for the sender.')
        }
      },
      handler: async (args) => {
        const resourcePath = args.resource === 'domain' ? '/domains' : '/sender-identities'

        if (args.action === 'list') {
          const list = await client.get(resourcePath)
          if (list.count === 0) {
            return textResult(args.resource === 'domain' ? 'No domains have been added yet.' : 'No sender identities have been added yet.')
          }
          if (args.resource === 'domain') {
            const summary = list.items.map(d => `${d.domain} (${d.region}) - DKIM ${d.observed?.dkim?.allOk ? 'verified' : 'not verified'}`).join('; ')
            return textResult(`${list.count} domain(s): ${summary}.`)
          }
          const summary = list.items.map(s => `${s.email}${s.name ? ` (${s.name})` : ''}`).join(', ')
          return textResult(`${list.count} sender identit(y/ies): ${summary}.`)
        }

        if (args.action === 'create') {
          if (args.resource === 'domain') {
            const result = await client.post('/domains', { domain: args.domain, region: args.region })
            return textResult(`Added domain "${result.domain}" (id ${result._id}) - add the DNS records it returned, then use check_dns to verify.`)
          }
          const result = await client.post('/sender-identities', { email: args.email, name: args.name, region: args.region })
          return textResult(`Added sender identity "${result.email}" (id ${result._id}).`)
        }

        if (args.action === 'check_dns') {
          const result = await client.post(`/domains/${args.domainId}/check`)
          return textResult(`Domain "${result.domain}" DKIM is ${result.observed?.dkim?.allOk ? 'now verified' : 'still not verified'}.`)
        }

        const id = args.resource === 'domain' ? args.domainId : args.senderIdentityId
        await client.del(`${resourcePath}/${id}`)
        return textResult(args.resource === 'domain' ? 'Deleted the domain.' : 'Deleted the sender identity.')
      }
    }
  ]
}
