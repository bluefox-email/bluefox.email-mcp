import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

function formatAwsConfig (project) {
  const awsConfig = project.awsConfig || {}
  const identities = awsConfig.senderIdentities?.length
    ? awsConfig.senderIdentities.map(identity => `${identity.name} <${identity.email}>${identity.region ? ` (${identity.region})` : ''}`).join(', ')
    : 'none'
  return `AWS config for "${project.name}" (status: ${project.status}). Access key: ${awsConfig.accessKeyIdHint || 'none'}. Secret key: ${awsConfig.secretAccessKeyHint || 'none'}. STS role: ${awsConfig.roleArnHint || 'none'}. Region: ${awsConfig.region || 'none'}. Limit: ${awsConfig.limit ?? 'none'} sends/sec. Sender identities: ${identities}.`
}

export function createProjectSetupTools ({ client }) {
  return [
    {
      name: 'set_byo_aws_config',
      config: {
        title: 'Set up bring-your-own AWS SES credentials',
        description: 'Submits (or updates) this project\'s own AWS SES credentials - either an STS role ARN or a static access key/secret pair, never both. Setting status: "byoAwsSes" switches the project to send through these credentials instead of bluefox.email\'s shared sending infrastructure. Use check_aws_credentials to validate before relying on them. This is only for projects that want to run their own AWS account - most projects should use apply_for_production_access instead to raise limits on bluefox.email\'s shared infrastructure without managing AWS themselves.',
        inputSchema: {
          roleArn: z.string().optional().describe('STS role ARN, from the CloudFormation setup - mutually exclusive with accessKeyId/secretAccessKey.'),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
          region: z.string().optional(),
          limit: z.number().optional().describe('Max sends per second.'),
          senderIdentities: z.array(z.object({ name: z.string(), email: z.string(), region: z.string().optional() })).optional(),
          removeAwsConfig: z.enum(['sts', 'accessKey']).optional().describe('Removes just the STS role or just the static keys, leaving the other half (if set) intact.'),
          activateByoAwsSes: z.boolean().optional().describe('Also switches the project\'s status to byoAwsSes.')
        }
      },
      handler: async (args) => {
        const awsConfig = {}
        for (const field of ['roleArn', 'accessKeyId', 'secretAccessKey', 'region', 'limit', 'senderIdentities', 'removeAwsConfig']) {
          if (args[field] !== undefined) {
            awsConfig[field] = args[field]
          }
        }
        const body = { awsConfig }
        if (args.activateByoAwsSes) {
          body.status = 'byoAwsSes'
        }
        const result = await client.patch('', body)
        return textResult(`Updated ${formatAwsConfig(result)}`)
      }
    },
    {
      name: 'get_aws_config',
      config: {
        title: 'Get the current BYO-AWS SES configuration',
        description: 'Reads back this project\'s currently configured BYO-AWS region, sending limit, sender identities, and credential hints (the real secrets are never returned). Empty/unset is normal for a project that sends through bluefox.email\'s shared infrastructure instead - use get_production_access_status to check that project\'s status and limits.',
        inputSchema: {}
      },
      handler: async () => {
        const project = await client.get('')
        return textResult(formatAwsConfig(project))
      }
    },
    {
      name: 'check_aws_credentials',
      config: {
        title: 'Validate AWS SES credentials',
        description: 'Checks BYO-AWS credentials against SES directly - verifies the credentials work, every sender identity is actually verified in SES, and the requested limit is within the account\'s max send rate. Omit any field to check against what\'s already stored on the project.',
        inputSchema: {
          roleArn: z.string().optional(),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
          region: z.string().optional(),
          limit: z.number().optional(),
          senderIdentities: z.array(z.object({ _id: z.string().optional(), name: z.string(), email: z.string() })).optional()
        }
      },
      handler: async (args) => {
        await client.post('/aws-check', args)
        return textResult('AWS credentials check passed.')
      }
    },
    {
      name: 'get_cloudformation_link',
      config: {
        title: 'Get the BYO-AWS CloudFormation setup link',
        description: 'Returns the CloudFormation quick-create link for setting up the STS role bluefox.email needs to send through this project\'s own AWS account.',
        inputSchema: {}
      },
      handler: async () => {
        const result = await client.get('/cloudformation-link')
        return textResult(result.link)
      }
    },
    {
      name: 'get_sandbox_deliverability',
      config: {
        title: 'Get sandbox sending deliverability',
        description: 'Reports today\'s sandbox send count plus overall bounce/complaint rates (and their percentage of the platform max) for this project\'s sandbox sending.',
        inputSchema: {}
      },
      handler: async () => {
        const result = await client.get('/sandbox/deliverability')
        return textResult(`Sent today: ${result.sentCount}. Bounce rate: ${result.bounce.rate}% (${result.bounce.pct}% of max). Complaint rate: ${result.complaint.rate}% (${result.complaint.pct}% of max).`)
      }
    },
    {
      name: 'get_production_deliverability',
      config: {
        title: 'Get production sending deliverability',
        description: 'Reports the worst bounce/complaint rate over the last 7/30/90 days, a per-verified-domain breakdown, and this month\'s send count against the monthly limit.',
        inputSchema: {}
      },
      handler: async () => {
        const result = await client.get('/production/deliverability')
        const domains = result.domains.map(d => `${d.domain}: ${d.sent} sent, ${d.bounces} bounces, ${d.complaints} complaints`).join('; ') || 'none'
        return textResult(`Worst bounce rate: ${result.bounce.rate}% (${result.bounce.windowLabel}). Worst complaint rate: ${result.complaint.rate}% (${result.complaint.windowLabel}). This month: ${result.monthly.sent}/${result.monthly.limit || 'unlimited'} sent. Domains: ${domains}.`)
      }
    },
    {
      name: 'test_webhook',
      config: {
        title: 'Send a synthetic test webhook event',
        description: 'Fires a synthetic event of the given type at this project\'s configured webhook URL, to confirm it\'s reachable and correctly signed.',
        inputSchema: {
          type: z.enum(['bounce', 'complaint', 'open', 'click', 'pause-subscription', 'unsubscribe', 'subscribe', 'resubscribe', 'sent', 'failed'])
        }
      },
      handler: async (args) => {
        await client.get('/test-webhook', { type: args.type })
        return textResult(`Test "${args.type}" event delivered successfully.`)
      }
    },
    {
      name: 'export_domain_dns',
      config: {
        title: 'Export a domain\'s DNS records to a CSV file',
        description: 'Writes a domain\'s required DNS records (DKIM, SPF, DMARC, MX) to a local CSV file and reports the saved path - handy for handing to whoever manages DNS.',
        inputSchema: {
          domainId: z.string().describe('Use manage_sending_setup (resource: domain, action: list) to find this.')
        }
      },
      handler: async (args) => {
        const csv = await client.getText(`/domains/${args.domainId}/export/csv`)
        const filePath = path.join(os.tmpdir(), `bluefox-domain-dns-${args.domainId}.csv`)
        await fs.writeFile(filePath, csv, 'utf8')
        return textResult(`Saved DNS records to ${filePath}.`)
      }
    }
  ]
}
