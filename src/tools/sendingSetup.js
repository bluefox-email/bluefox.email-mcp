import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

function formatDnsRecord (record) {
  return `${record.type} ${record.name} -> ${record.value}${record.priority ? ` (priority ${record.priority})` : ''}`
}

// requiredDns comes back from the API on domain create/check_dns responses (DKIM CNAMEs, MX, SPF, DMARC) - the
// caller needs the actual record values to put them in their DNS provider, not just a pointer back to "the
// records it returned".
function formatRequiredDns (requiredDns) {
  if (!requiredDns) {
    return ''
  }
  const records = [...(requiredDns.dkimCNAMEs || []), requiredDns.mx, requiredDns.spf, requiredDns.dmarc].filter(Boolean)
  return records.map(formatDnsRecord).join('\n')
}

export function createSendingSetupTools ({ client }) {
  return [
    {
      name: 'manage_sending_setup',
      config: {
        title: 'Manage sending domains, sender identities, and regions',
        description: 'Lists, adds, checks DNS verification for, removes, or sets the default of the domains and sender identities emails are sent from, and lists the AWS regions this project can send from. A sender identity\'s email address domain must already be added and DKIM-verified before it can be created. There is no separate "default" flag - the first sender identity in the list is the default; use set_default to change which one that is. Domain create/check_dns/delete are not available on BYO AWS SES projects - listing domains, sender identity actions, and listing regions work on any project type. Regions only support the "list" action.',
        inputSchema: {
          resource: z.enum(['domain', 'sender_identity', 'region']),
          action: z.enum(['list', 'create', 'delete', 'check_dns', 'set_default']).describe('check_dns is domain-only - re-checks DNS records and can auto-create a default sender identity once DKIM passes. set_default is sender_identity-only - moves it to the front of the list. Regions only support list.'),
          domainId: z.string().optional().describe('Required for domain delete/check_dns.'),
          senderIdentityId: z.string().optional().describe('Required for sender_identity delete/set_default.'),
          domain: z.string().optional().describe('domain create only, e.g. "example.com".'),
          region: z.string().optional().describe('Required for domain/sender_identity create - an AWS region this project is set up to send from. Use resource: "region", action: "list" to see valid values first.'),
          email: z.string().optional().describe('sender_identity create only - the from-address to send as. Its domain must already be a verified domain in the given region.'),
          name: z.string().optional().describe('sender_identity create only - a display name for the sender.')
        }
      },
      handler: async (args) => {
        if (args.resource === 'region') {
          if (args.action !== 'list') {
            return textResult('Only the "list" action is supported for regions.')
          }
          const result = await client.get('/regions')
          if (!result.regions?.length) {
            return textResult('No sending regions are configured for this project yet.')
          }
          return textResult(`Available sending regions: ${result.regions.join(', ')}.`)
        }

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
          const summary = list.items.map((s, i) => `${s.email}${s.name ? ` (${s.name})` : ''}${i === 0 ? ' [default]' : ''}`).join(', ')
          return textResult(`${list.count} sender identit(y/ies): ${summary}. The default is whichever one is sent from when an email doesn't specify a sender identity - it's always the first one in this list.`)
        }

        if (args.action === 'create') {
          if (args.resource === 'domain') {
            const result = await client.post('/domains', { domain: args.domain, region: args.region })
            const dns = formatRequiredDns(result.requiredDns)
            return textResult(`Added domain "${result.domain}" (id ${result._id}). Add these DNS records, then use check_dns to verify:\n${dns}`)
          }
          const result = await client.post('/sender-identities', { email: args.email, name: args.name, region: args.region })
          return textResult(`Added sender identity "${result.email}" (id ${result._id}).`)
        }

        if (args.action === 'check_dns') {
          const result = await client.post(`/domains/${args.domainId}/check`)
          if (result.observed?.dkim?.allOk) {
            return textResult(`Domain "${result.domain}" DKIM is now verified.`)
          }
          const dns = formatRequiredDns(result.requiredDns)
          return textResult(`Domain "${result.domain}" DKIM is still not verified. Make sure these DNS records are set:\n${dns}`)
        }

        if (args.action === 'set_default') {
          const result = await client.post(`/sender-identities/${args.senderIdentityId}/set-default`)
          return textResult(`"${result.email}" is now the default sender identity.`)
        }

        const id = args.resource === 'domain' ? args.domainId : args.senderIdentityId
        await client.del(`${resourcePath}/${id}`)
        return textResult(args.resource === 'domain' ? 'Deleted the domain.' : 'Deleted the sender identity.')
      }
    }
  ]
}
