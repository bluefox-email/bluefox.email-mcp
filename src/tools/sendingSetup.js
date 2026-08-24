import { z } from 'zod'
import { textResult, ResolveError } from '../helpers/errors.js'

function formatDnsRecord (record) {
  return `${record.type} ${record.name} -> ${record.value}${record.priority ? ` (priority ${record.priority})` : ''}`
}

function formatRequiredDns (requiredDns) {
  if (!requiredDns) {
    return ''
  }
  const records = [...(requiredDns.dkimCNAMEs || []), requiredDns.mx, requiredDns.spf, requiredDns.dmarc].filter(Boolean)
  return records.map(formatDnsRecord).join('\n')
}

function formatDomainDetail (domain) {
  const observed = domain.observed || {}
  return (
    `"${domain.domain}" (id ${domain._id}, region ${domain.region}) - ` +
    `DKIM: ${observed.dkim?.allOk ? 'verified' : 'not verified'}, SPF: ${observed.spf?.present ? 'present' : 'missing'}, ` +
    `DMARC: ${observed.dmarc?.present ? 'present' : 'missing'}, MX: ${observed.mx?.present ? 'present' : 'missing'}. ` +
    `Overall: ${observed.allOk ? 'fully verified' : 'not fully verified'}.`
  )
}

function formatSenderIdentityDetail (identity, isDefault) {
  return `"${identity.email}"${identity.name ? ` (${identity.name})` : ''} (id ${identity._id}, region ${identity.region})${isDefault ? ' [default]' : ''}.`
}

async function resolveDomainId (client, { domainId, domain, region }) {
  if (domainId) {
    return domainId
  }
  if (!domain) {
    throw new ResolveError('Either domainId or domain is required.')
  }
  const list = await client.get('/domains', { filter: { domain, region } })
  if (list.items.length === 0) {
    throw new ResolveError(`No domain "${domain}"${region ? ` in region ${region}` : ''} found. Double-check the domain, or pass domainId if you already have it.`)
  }
  if (list.items.length > 1) {
    throw new ResolveError(`Multiple domains named "${domain}" exist across regions - specify region or pass domainId instead.`)
  }
  return list.items[0]._id
}

async function resolveSenderIdentityId (client, { senderIdentityId, senderIdentityEmail }) {
  if (senderIdentityId) {
    return senderIdentityId
  }
  if (!senderIdentityEmail) {
    throw new ResolveError('Either senderIdentityId or senderIdentityEmail is required.')
  }
  const list = await client.get('/sender-identities', { filter: { email: senderIdentityEmail } })
  if (list.items.length === 0) {
    throw new ResolveError(`No sender identity with email "${senderIdentityEmail}" found. Double-check the email, or pass senderIdentityId if you already have it.`)
  }
  if (list.items.length > 1) {
    throw new ResolveError(`Multiple sender identities have email "${senderIdentityEmail}" - pass senderIdentityId instead.`)
  }
  return list.items[0]._id
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
          action: z.enum(['list', 'get', 'create', 'delete', 'check_dns', 'set_default']).describe('get returns full per-record DNS status for one domain, or full detail for one sender identity - use when list\'s compact summary isn\'t enough. check_dns is domain-only - re-checks DNS records and can auto-create a default sender identity once DKIM passes. set_default is sender_identity-only - moves it to the front of the list. Regions only support list.'),
          domainId: z.string().optional().describe('For domain delete/check_dns - alternative to domain (list never exposes an id, so either works).'),
          senderIdentityId: z.string().optional().describe('For sender_identity delete/set_default - alternative to senderIdentityEmail (list never exposes an id, so either works).'),
          domain: z.string().optional().describe('domain create, or as an alternative to domainId for delete/check_dns - matched by exact domain string (plus region, if the same domain exists in more than one).'),
          region: z.string().optional().describe('Required for domain/sender_identity create - an AWS region this project is set up to send from. Use resource: "region", action: "list" to see valid values first. Also used to disambiguate domain when resolving by name.'),
          email: z.string().optional().describe('sender_identity create only - the from-address to send as. Its domain must already be a verified domain in the given region.'),
          senderIdentityEmail: z.string().optional().describe('For sender_identity delete/set_default, as an alternative to senderIdentityId - matched by exact email.'),
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
            const summary = list.items.map(formatDomainDetail).join('\n')
            return textResult(`${list.count} domain(s):\n${summary}`)
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
          return textResult(`Added sender identity: ${formatSenderIdentityDetail(result)}`)
        }

        if (args.action === 'get') {
          if (args.resource === 'domain') {
            const domainId = await resolveDomainId(client, { domainId: args.domainId, domain: args.domain, region: args.region })
            const result = await client.get(`/domains/${domainId}`)
            return textResult(formatDomainDetail(result))
          }
          const senderIdentityId = await resolveSenderIdentityId(client, { senderIdentityId: args.senderIdentityId, senderIdentityEmail: args.senderIdentityEmail })
          const list = await client.get('/sender-identities')
          const index = list.items.findIndex(item => item._id === senderIdentityId)
          if (index === -1) {
            throw new ResolveError(`No sender identity with id "${senderIdentityId}" found.`)
          }
          return textResult(formatSenderIdentityDetail(list.items[index], index === 0))
        }

        if (args.action === 'check_dns') {
          const domainId = await resolveDomainId(client, { domainId: args.domainId, domain: args.domain, region: args.region })
          const result = await client.post(`/domains/${domainId}/check`)
          if (result.observed?.dkim?.allOk) {
            return textResult(`Domain "${result.domain}" DKIM is now verified.`)
          }
          const dns = formatRequiredDns(result.requiredDns)
          return textResult(`Domain "${result.domain}" DKIM is still not verified. Make sure these DNS records are set:\n${dns}`)
        }

        if (args.action === 'set_default') {
          const senderIdentityId = await resolveSenderIdentityId(client, { senderIdentityId: args.senderIdentityId, senderIdentityEmail: args.senderIdentityEmail })
          const result = await client.post(`/sender-identities/${senderIdentityId}/set-default`)
          return textResult(`"${result.email}" is now the default sender identity.`)
        }

        const id = args.resource === 'domain'
          ? await resolveDomainId(client, { domainId: args.domainId, domain: args.domain, region: args.region })
          : await resolveSenderIdentityId(client, { senderIdentityId: args.senderIdentityId, senderIdentityEmail: args.senderIdentityEmail })
        await client.del(`${resourcePath}/${id}`)
        return textResult(args.resource === 'domain' ? 'Deleted the domain.' : 'Deleted the sender identity.')
      }
    }
  ]
}
