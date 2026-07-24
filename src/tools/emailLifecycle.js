import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

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
          previewText: z.string().optional(),
          senderIdentityId: z.string().optional(),
          senderIdentityEmail: z.string().optional().describe('Looked up automatically.'),
          subscriberListId: z.string().optional().describe('Campaign/triggered only.'),
          subscriberListName: z.string().optional().describe('Campaign/triggered only. Looked up automatically.'),
          segmentId: z.string().optional().describe('Campaign only.'),
          segmentName: z.string().optional().describe('Campaign only. Looked up automatically.'),
          status: z.enum(['draft', 'archive', 'scheduled']).optional().describe('Campaign only. Set to "draft" to cancel a scheduled send.'),
          scheduledFor: z.string().optional().describe('Campaign only. ISO 8601 date-time - resolve relative phrases like "tomorrow at 8am" to an absolute value yourself first. Set alongside status "scheduled" to (re)schedule.'),
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
        if (args.previewText) {
          body.previewText = args.previewText
        }
        if (args.excludeUnengaged !== undefined) {
          body.excludeUnengaged = args.excludeUnengaged
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
          if (args.status) {
            body.status = args.status
          }
          if (args.scheduledFor) {
            body.scheduledTo = args.scheduledFor
          }
        }

        const result = await client.patch(`${RESOURCE_PATH[args.type]}/${id}`, body)
        return textResult(`Updated ${LABEL[args.type]} "${result.name}".`)
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
        return textResult(
          `"${detail.name}" - subject: "${detail.subject}". ` +
          `${stats.sent} sent, ${stats.opens} opens (${stats.uniqueOpens} unique), ${stats.clicks} clicks (${stats.uniqueClicks} unique), ${stats.bounce} bounced, ${stats.complaint} complaints.`
        )
      }
    },
    {
      name: 'delete_email',
      config: {
        title: 'Delete email (campaign or triggered)',
        description: 'Deletes a campaign or triggered email. (Deleting a transactional email is not supported by this tool.)',
        inputSchema: {
          type: z.enum(['campaign', 'triggered']),
          emailId: z.string().optional(),
          emailName: z.string().optional().describe('Looked up automatically.')
        }
      },
      handler: async (args) => {
        const id = await resolveEmailId(args.type, { id: args.emailId, name: args.emailName })
        await client.del(`${RESOURCE_PATH[args.type]}/${id}`)
        return textResult(`Deleted the ${LABEL[args.type]}.`)
      }
    }
  ]
}
