import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { normalizeScheduledFor } from '../helpers/scheduledFor.js'
import { feedsSchema } from './feedsSchema.js'

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

export function formatEmailDetail (type, detail, stats) {
  const lines = [
    `"${detail.name}" (id ${detail._id})`,
    `Subject: "${detail.subject}"`
  ]
  if (detail.previewText) {
    lines.push(`Preview text: "${detail.previewText}"`)
  }
  lines.push(`Content type: ${detail.type || 'chamaileon (visual editor)'}`)
  if (typeof detail.document === 'string') {
    lines.push(`Body:\n${detail.document}`)
  } else if (detail.document) {
    lines.push('Body: visual editor (Chamaileon) document - not shown as text, use the app to view/edit it.')
  }
  if (type === 'campaign') {
    lines.push(`Status: ${detail.status}${detail.scheduledTo ? `, scheduled for ${detail.scheduledTo} (time zone: ${detail.timeZone || 'UTC'})` : ''}`)
    lines.push(`Subscriber list id: ${detail.subscriberListId || 'none'}`)
    if (detail.segmentId) {
      lines.push(`Segment id: ${detail.segmentId}`)
    }
  }
  if (type === 'triggered') {
    lines.push(`Subscriber list id: ${detail.subscriberListId || 'none'}`)
  }
  if (detail.senderIdentity) {
    lines.push(`Sender identity id: ${detail.senderIdentity}`)
  }
  if (detail.replyTo) {
    lines.push(`Reply-to: ${detail.replyTo}`)
  }
  if (type !== 'transactional') {
    lines.push(`Exclude unengaged: ${detail.excludeUnengaged ? 'yes' : 'no'}`)
  }
  if (detail.feeds?.length) {
    lines.push(`Feeds:\n${detail.feeds.map(feed =>
      `- ${feed.variableName || '(no variableName)'}: ${feed.url} (${feed.feedType}), maxItems ${feed.maxItems ?? 'unlimited'}, ` +
      `required: ${feed.required ? 'yes' : 'no'}${feed.availableFields?.length ? `, available fields: ${feed.availableFields.join(', ')}` : ''}`
    ).join('\n')}`)
  }
  if (stats) {
    lines.push(`Stats: ${stats.sent} sent, ${stats.failed || 0} failed, ${stats.opens} opens (${stats.uniqueOpens} unique), ${stats.clicks} clicks (${stats.uniqueClicks} unique), ${stats.bounce} bounced, ${stats.complaint} complaints.`)
  }
  return lines.join('\n')
}

export function createEmailLifecycleTools ({ client, resolveId, resolveIdOptional }) {
  async function resolveEmailId (type, { id, name }) {
    if (id) {
      return id
    }
    if (name) {
      return resolveId({ resourcePath: RESOURCE_PATH[type], name, filterField: 'name', label: LABEL[type] })
    }
    throw new Error(`Either an id or a name is required to find the ${LABEL[type]}.`)
  }

  return [
    {
      name: 'update_email',
      config: {
        title: 'Update email (campaign, transactional, or triggered)',
        description: 'Updates an existing campaign, transactional email, or triggered email - name, subject, body, schedule, status, etc. Also used to cancel a scheduled campaign (set status to "draft") or reschedule one (give a new scheduledFor). A campaign cannot be updated within 6 minutes of its scheduled send time.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('The email to update, by its current name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional(),
          subject: z.string().optional(),
          body: z.string().optional().describe('Replaces the email body (a Handlebars template string).'),
          bodyType: z.enum(['html', 'text']).optional().describe('Switches the body between plain html/text authoring. Omit to keep using the visual (Chamaileon) editor document - only set this alongside body when authoring as html/text.'),
          previewText: z.string().optional(),
          senderIdentityId: z.string().optional(),
          senderIdentityEmail: z.string().optional().describe('Looked up automatically.'),
          replyTo: z.string().optional().describe('Reply-to email address recipients\' replies go to.'),
          feeds: feedsSchema.optional().describe('Replaces the whole feeds list.'),
          subscriberListId: z.string().optional().describe('Campaign/triggered only.'),
          subscriberListName: z.string().optional().describe('Campaign/triggered only. Looked up automatically.'),
          segmentId: z.string().optional().describe('Campaign only.'),
          segmentName: z.string().optional().describe('Campaign only. Looked up automatically.'),
          status: z.enum(['draft', 'archive', 'scheduled']).optional().describe('Campaign only. Set to "draft" to cancel a scheduled send. Passing scheduledFor on its own already (re)schedules - status defaults to "scheduled" then.'),
          scheduledFor: z.string().optional().describe('Campaign only. Absolute ISO 8601 date-time with a UTC offset or trailing "Z" (e.g. "2026-09-10T08:00:00-05:00") - resolve relative phrases like "tomorrow at 8am" to an absolute instant yourself first. Pass this to (re)schedule the campaign.'),
          timeZone: z.string().optional().describe('Campaign only. IANA time zone (e.g. "America/New_York") stored with the campaign and shown next to the scheduled time in the app. It does NOT shift scheduledFor.'),
          excludeUnengaged: z.boolean().optional().describe('Campaign/triggered only.')
        }
      },
      handler: async (args) => {
        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })

        const body = {}
        if (args.newName) {
          body.name = args.newName
        }
        if (args.subject) {
          body.subject = args.subject
        }
        if (args.body) {
          body.document = args.body
        }
        if (args.bodyType) {
          body.type = args.bodyType
        }
        if (args.previewText) {
          body.previewText = args.previewText
        }
        if (args.excludeUnengaged !== undefined && args.type !== 'transactional') {
          body.excludeUnengaged = args.excludeUnengaged
        }
        if (args.replyTo) {
          body.replyTo = args.replyTo
        }
        if (args.feeds) {
          body.feeds = args.feeds
        }

        const senderIdentity = await resolveIdOptional({
          id: args.senderIdentityId,
          name: args.senderIdentityEmail,
          resourcePath: '/sender-identities',
          filterField: 'email',
          label: 'sender identity'
        })
        if (senderIdentity) {
          body.senderIdentity = senderIdentity
        }

        if (args.type === 'campaign' || args.type === 'triggered') {
          const subscriberListId = await resolveIdOptional({
            id: args.subscriberListId,
            name: args.subscriberListName,
            resourcePath: '/subscriber-lists',
            filterField: 'name',
            label: 'subscriber list'
          })
          if (subscriberListId) {
            body.subscriberListId = subscriberListId
          }
        }

        if (args.type === 'campaign') {
          const segmentId = await resolveIdOptional({
            id: args.segmentId,
            name: args.segmentName,
            resourcePath: '/segments',
            filterField: 'name',
            label: 'segment'
          })
          if (segmentId) {
            body.segmentId = segmentId
          }
          if (args.scheduledFor) {
            body.scheduledTo = normalizeScheduledFor(args.scheduledFor)
            body.status = args.status || 'scheduled'
          } else if (args.status) {
            body.status = args.status
          }
          if (args.timeZone) {
            body.timeZone = args.timeZone
          }
        }

        const result = await client.patch(`${RESOURCE_PATH[args.type]}/${id}`, body)
        return textResult(`Updated ${LABEL[args.type]}:\n${formatEmailDetail(args.type, result)}`)
      }
    },
    {
      name: 'get_email',
      config: {
        title: 'Get email (campaign, transactional, or triggered)',
        description: 'Looks up a campaign, transactional email, or triggered email by name (with its current stats), or lists every email of that type on the project if no name is given.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('Omit both this and emailId to list every email of this type instead.')
        }
      },
      handler: async (args) => {
        const resourcePath = RESOURCE_PATH[args.type]

        if (!args.emailId && !args.emailName) {
          const list = await client.get(resourcePath, { limit: 30 })
          if (list.count === 0) {
            return textResult(`This project has no ${LABEL[args.type]}s yet.`)
          }
          const names = list.items.map(item => item.name).join(', ')
          return textResult(`${list.count} ${LABEL[args.type]}(s): ${names}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })
        const [detail, stats] = await Promise.all([
          client.get(`${resourcePath}/${id}`),
          client.get(`${resourcePath}/${id}/stats`)
        ])
        return textResult(formatEmailDetail(args.type, detail, stats))
      }
    },
    {
      name: 'get_email_recipients',
      config: {
        title: 'List recipients of an email (campaign, transactional, or triggered)',
        description: 'Per-recipient detail for a specific send - who received it, how many times they opened/clicked, and whether they bounced/complained/unsubscribed/paused/subscribed/resubscribed as a result of THIS specific send (not their overall history). Paginated - use skip to page through more when there are more than fit in one page.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('The email to list recipients for, by name - looked up automatically. Provide this if you do not already have the id.'),
          email: z.string().optional().describe('Filter to a single recipient email address.'),
          status: z.enum(['scheduled', 'being-sent', 'sent', 'failed']).optional(),
          opened: z.boolean().optional().describe('Filter to recipients who did/did not open this send.'),
          clicked: z.boolean().optional().describe('Filter to recipients who did/did not click a link in this send.'),
          bounced: z.boolean().optional(),
          complained: z.boolean().optional(),
          unsubscribed: z.boolean().optional().describe('Filter to recipients who did/did not unsubscribe via this specific send\'s link.'),
          paused: z.boolean().optional(),
          subscribed: z.boolean().optional(),
          resubscribed: z.boolean().optional(),
          limit: z.number().optional().describe('Max recipients per page. Defaults to 10, capped at 30.'),
          skip: z.number().optional().describe('Number of recipients to skip, for pagination.'),
          sort: z.enum(['sentAt', 'createdAt', 'email']).optional().describe('Defaults to sentAt.'),
          order: z.enum(['asc', 'desc']).optional().describe('Defaults to desc.')
        }
      },
      handler: async (args) => {
        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })
        const resourcePath = RESOURCE_PATH[args.type]

        const filter = {}
        if (args.email) {
          filter.email = args.email
        }
        if (args.status) {
          filter.status = args.status
        }
        if (args.opened !== undefined) {
          filter.opened = args.opened
        }
        if (args.clicked !== undefined) {
          filter.clicked = args.clicked
        }
        if (args.bounced !== undefined) {
          filter.bounced = args.bounced
        }
        if (args.complained !== undefined) {
          filter.complained = args.complained
        }
        if (args.unsubscribed !== undefined) {
          filter.unsubscribed = args.unsubscribed
        }
        if (args.paused !== undefined) {
          filter.paused = args.paused
        }
        if (args.subscribed !== undefined) {
          filter.subscribed = args.subscribed
        }
        if (args.resubscribed !== undefined) {
          filter.resubscribed = args.resubscribed
        }

        const query = { limit: args.limit, skip: args.skip, sort: args.sort, order: args.order }
        if (Object.keys(filter).length) {
          query.filter = filter
        }

        const result = await client.get(`${resourcePath}/${id}/recipients`, query)
        if (result.count === 0) {
          return textResult('No recipients match.')
        }

        const lines = result.items.map(r => {
          const flags = ['bounced', 'complained', 'unsubscribed', 'paused', 'subscribed', 'resubscribed'].filter(f => r[f]).join(', ')
          const errors = r.errors?.length ? ` - errors: ${r.errors.map(e => typeof e === 'string' ? e : (e.message || JSON.stringify(e))).join('; ')}` : ''
          return `${r.email} - ${r.status}${r.sentAt ? ` at ${r.sentAt}` : ''}, ${r.opens} opens, ${r.clicks} clicks${flags ? ` (${flags})` : ''}${errors}`
        })

        const shownSoFar = (args.skip || 0) + result.items.length
        const more = shownSoFar < result.count ? ` (${result.count - shownSoFar} more - pass skip=${shownSoFar} for the next page)` : ''
        return textResult(`${result.count} recipient(s) total, showing ${result.items.length}${more}:\n${lines.join('\n')}`)
      }
    },
    {
      name: 'delete_email',
      config: {
        title: 'Delete email (campaign, transactional, or triggered)',
        description: 'Deletes a campaign, transactional email, or triggered email.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('Looked up automatically.')
        }
      },
      handler: async (args) => {
        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })
        await client.del(`${RESOURCE_PATH[args.type]}/${id}`)
        return textResult(`Deleted the ${LABEL[args.type]}.`)
      }
    },
    {
      name: 'list_email_error_log',
      config: {
        title: 'List processing/delivery errors for an email',
        description: 'Lists errors for a campaign, transactional email, or triggered email - both send-processing errors and delivery failures from the last 30 days, newest first. Reports how many are unseen since the log was last marked seen in the app.',
        inputSchema: {
          type: z.enum(['campaign', 'transactional', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('Looked up automatically.'),
          limit: z.number().optional(),
          skip: z.number().optional()
        }
      },
      handler: async (args) => {
        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })
        const result = await client.get(`/related-to/${id}/email-error-logs`, { limit: args.limit, skip: args.skip })
        if (!result.count) {
          return textResult('No errors logged.')
        }
        const lines = result.items.map(item => `${item.createdAt} [${item.source}]${item.recipient ? ` ${item.recipient}` : ''} ${item.errorName}: ${item.errorMessage}`)
        return textResult(`${result.count} error(s), ${result.unseenCount} unseen:\n${lines.join('\n')}`)
      }
    }
  ]
}
