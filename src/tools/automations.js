import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { formatAutomationDetail, formatAutomationSummaryLine, formatTrigger, formatExitCriteria } from './automationFormat.js'

const NODE_TYPES = ['delay', 'send-email', 'filter-audience', 'branch', 'complete', 'set-value', 'notify', 'manage-tags', 'webhook']

const TRIGGER_TYPES = ['contact-added', 'contact-updated', 'enter-segment', 'leave-segment', 'time-based']

const CONFIRM_DESCRIPTION = 'Set to true only after showing the user the automation\'s full current state (via manage_automation with action "get") and getting their explicit go-ahead - never infer confirmation from conversational tone. Omit or leave false to preview what this action would do without applying it.'

async function resolveAutomationId ({ resolveIdOrRequired, id, name }) {
  return resolveIdOrRequired({ id, name, resourcePath: '/automations', filterField: 'name', label: 'automation' })
}

// Shared by every lifecycle tool below (activate/merge/discard/pause/resume) and by manage_automation's delete
// action: fetches the automation and, unless confirm:true was passed, returns a side-effect-free preview built
// from the exact same formatter a "get" call would show - so a model that calls this without confirm still can't
// cause a mutation, and has everything it needs to summarize the automation to the user before calling again.
async function previewUnlessConfirmed ({ client, resolveIdOrRequired, id, name, confirm, verb }) {
  const automationId = await resolveAutomationId({ resolveIdOrRequired, id, name })
  const automation = await client.get(`/automations/${automationId}`)
  if (!confirm) {
    return {
      automationId,
      result: textResult(`Not yet applied - ${verb} requires confirmation. Here is the automation's current full state:\n\n${formatAutomationDetail(automation)}\n\nCall this tool again with confirm: true once the user has reviewed this and agreed.`)
    }
  }
  return { automationId, result: null }
}

function lifecycleTool ({ client, resolveIdOrRequired }, { name, title, pastTense, verb, description, path }) {
  return {
    name,
    config: {
      title,
      description,
      inputSchema: {
        automationId: z.string().optional(),
        automationName: z.string().optional().describe('The automation, by name - looked up automatically. Provide this if you do not already have the id.'),
        confirm: z.boolean().optional().describe(CONFIRM_DESCRIPTION)
      }
    },
    handler: async (args) => {
      const { automationId, result: preview } = await previewUnlessConfirmed({ client, resolveIdOrRequired, id: args.automationId, name: args.automationName, confirm: args.confirm, verb })
      if (preview) {
        return preview
      }
      const result = await client.post(`/automations/${automationId}${path}`, { confirm: true })
      if (result.hasErrors) {
        return textResult(`Validation failed - nothing was changed:\n\n${formatAutomationDetail(result)}`)
      }
      return textResult(`${pastTense}:\n\n${formatAutomationDetail(result)}`)
    }
  }
}

export function createAutomationTools ({ client, resolveIdOrRequired, resolveIdOptional }) {
  return [
    {
      name: 'manage_automation',
      config: {
        title: 'Manage automations',
        description: 'Automations are bluefox.email\'s visual workflow builder: a trigger plus a sequence of steps (delay, send email, filter/branch on audience, set a value, manage tags, call a webhook). Draft automations can be edited freely and every edit here applies immediately, mirroring the dashboard UI exactly. Once an automation is active, structural edits (trigger, exit criteria, and every node change from manage_automation_node/manage_automation_email_content) are automatically staged as an unmerged draft instead of touching what is actually running - use activate_automation/merge_automation_draft/discard_automation_draft/pause_automation/resume_automation to move between states, each of which requires explicit confirmation.',
        inputSchema: {
          action: z.enum(['list', 'get', 'create', 'update_name', 'delete']),
          automationId: z.string().optional(),
          automationName: z.string().optional().describe('The automation to get/update/delete, by name - looked up automatically. Provide this if you do not already have the id.'),
          name: z.string().optional().describe('create (required), or update_name to rename.'),
          basedOnId: z.string().optional().describe('create only - duplicate an existing automation (its trigger and full sequence) as the starting point. The new automation always starts in "draft" status regardless of the source\'s status.'),
          basedOnName: z.string().optional().describe('create only - same as basedOnId, by the source automation\'s name.'),
          subscriberListId: z.string().optional().describe('create with basedOnId/basedOnName only - overrides the duplicated trigger\'s subscriber list, to clone the automation onto a different list.'),
          subscriberListName: z.string().optional().describe('Same as subscriberListId, by list name.'),
          confirm: z.boolean().optional().describe(`delete only. ${CONFIRM_DESCRIPTION}`)
        }
      },
      handler: async (args) => {
        if (args.action === 'list') {
          const list = await client.get('/automations', { limit: 30 })
          if (list.count === 0) {
            return textResult('No automations are defined yet.')
          }
          const lines = list.items.map(formatAutomationSummaryLine).join('\n')
          return textResult(`${list.count} automation(s):\n${lines}${list.count > list.items.length ? '\n(more not shown)' : ''}`)
        }

        if (args.action === 'create') {
          const basedOn = await resolveIdOptional({ id: args.basedOnId, name: args.basedOnName, resourcePath: '/automations', filterField: 'name', label: 'automation' })
          const body = { name: args.name }
          if (basedOn) {
            body.basedOn = basedOn
            const subscriberListId = await resolveIdOptional({ id: args.subscriberListId, name: args.subscriberListName, resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' })
            if (subscriberListId) {
              body.subscriberListId = subscriberListId
            }
          }
          const result = await client.post('/automations', body)
          return textResult(`Created automation:\n\n${formatAutomationDetail(result)}`)
        }

        if (args.action === 'delete') {
          const { automationId, result: preview } = await previewUnlessConfirmed({ client, resolveIdOrRequired, id: args.automationId, name: args.automationName, confirm: args.confirm, verb: 'deleting this automation (this also deletes its email content and running-contact history and cannot be undone)' })
          if (preview) {
            return preview
          }
          await client.del(`/automations/${automationId}`, { confirm: 'true' })
          return textResult('Deleted the automation.')
        }

        const automationId = await resolveAutomationId({ resolveIdOrRequired, id: args.automationId, name: args.automationName })

        if (args.action === 'get') {
          const automation = await client.get(`/automations/${automationId}`)
          return textResult(formatAutomationDetail(automation))
        }

        const result = await client.patch(`/automations/${automationId}`, { name: args.name })
        return textResult(`Renamed automation:\n\n${formatAutomationDetail(result)}`)
      }
    },
    {
      name: 'manage_automation_trigger',
      config: {
        title: 'Get or set an automation\'s trigger',
        description: 'The trigger decides when contacts enter the automation. While the automation is draft, setting it applies immediately; once active/paused, it is staged as a draft change (see manage_automation\'s description) until merged.',
        inputSchema: {
          action: z.enum(['get', 'set']),
          automationId: z.string().optional(),
          automationName: z.string().optional().describe('Looked up automatically. Provide this if you do not already have the id.'),
          type: z.enum(TRIGGER_TYPES).optional().describe('set only.'),
          subscriberListId: z.string().optional().describe('set only - required for every trigger type.'),
          subscriberListName: z.string().optional().describe('Same as subscriberListId, by list name.'),
          segmentId: z.string().optional().describe('set only - required for enter-segment/leave-segment.'),
          segmentName: z.string().optional().describe('Same as segmentId, by segment name.'),
          property: z.string().optional().describe('set only, contact-updated - the contact field to watch.'),
          fromOperator: z.string().optional().describe('set only, contact-updated - e.g. "equals", "any". See manage_segment for the full operator list.'),
          fromValue: z.string().optional(),
          toOperator: z.string().optional(),
          toValue: z.string().optional(),
          schedule: z.enum(['daily', 'weekday', 'weekly', 'monthly', 'monthly-on-the-nth']).optional().describe('set only, time-based.'),
          time: z.string().optional().describe('set only, time-based - "HH:MM", 24h. Defaults to 09:00.'),
          dayOf: z.union([z.string(), z.array(z.string())]).optional().describe('set only, time-based - required for weekly/monthly/monthly-on-the-nth.'),
          nthOf: z.number().optional().describe('set only, time-based monthly-on-the-nth - which occurrence (e.g. 2 for "the 2nd Tuesday").')
        }
      },
      handler: async (args) => {
        const automationId = await resolveAutomationId({ resolveIdOrRequired, id: args.automationId, name: args.automationName })

        if (args.action === 'get') {
          const automation = await client.get(`/automations/${automationId}`)
          return textResult(formatTrigger(automation.trigger))
        }

        const subscriberListId = await resolveIdOptional({ id: args.subscriberListId, name: args.subscriberListName, resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' })
        const segmentId = await resolveIdOptional({ id: args.segmentId, name: args.segmentName, resourcePath: '/segments', filterField: 'name', label: 'segment' })
        const trigger = { type: args.type, subscriberListId, segmentId }
        if (args.property) {
          trigger.property = args.property
        }
        if (args.fromOperator || args.fromValue !== undefined) {
          trigger.from = { operator: args.fromOperator, value: args.fromValue }
        }
        if (args.toOperator || args.toValue !== undefined) {
          trigger.to = { operator: args.toOperator, value: args.toValue }
        }
        if (args.schedule) {
          trigger.schedule = args.schedule
        }
        if (args.time) {
          trigger.time = args.time
        }
        if (args.dayOf !== undefined) {
          trigger.dayOf = args.dayOf
        }
        if (args.nthOf !== undefined) {
          trigger.nthOf = args.nthOf
        }

        const result = await client.patch(`/automations/${automationId}/trigger`, trigger)
        const staged = result.draftTrigger ? ' (staged as a draft change - not live until merged)' : ''
        return textResult(`Set trigger${staged}:\n${formatTrigger(result.draftTrigger || result.trigger)}`)
      }
    },
    {
      name: 'manage_automation_exit_criteria',
      config: {
        title: 'Get, set, or clear an automation\'s exit criteria',
        description: 'Exit criteria removes a contact from the automation mid-flow when it becomes true, independent of where they are in the sequence. Same draft-vs-live staging rule as the trigger.',
        inputSchema: {
          action: z.enum(['get', 'set', 'clear']),
          automationId: z.string().optional(),
          automationName: z.string().optional().describe('Looked up automatically. Provide this if you do not already have the id.'),
          property: z.string().optional().describe('set only.'),
          operator: z.string().optional().describe('set only.'),
          value: z.any().optional().describe('set only.'),
          segmentId: z.string().optional().describe('set only.'),
          segmentName: z.string().optional().describe('Same as segmentId, by segment name.'),
          excludeUnengaged: z.boolean().optional().describe('set only.'),
          leaveSegment: z.boolean().optional().describe('set only - also removes the contact from the matched segment when they exit.')
        }
      },
      handler: async (args) => {
        const automationId = await resolveAutomationId({ resolveIdOrRequired, id: args.automationId, name: args.automationName })

        if (args.action === 'get') {
          const automation = await client.get(`/automations/${automationId}`)
          return textResult(formatExitCriteria(automation.exitCriteria))
        }

        if (args.action === 'clear') {
          const result = await client.patch(`/automations/${automationId}/exit-criteria`, { active: false })
          return textResult(result.draftExitCriteria ? 'Staged clearing the exit criteria (not live until merged).' : 'Cleared the exit criteria.')
        }

        const segmentId = await resolveIdOptional({ id: args.segmentId, name: args.segmentName, resourcePath: '/segments', filterField: 'name', label: 'segment' })
        const exitCriteria = { active: true, property: args.property, operator: args.operator, value: args.value, segmentId, excludeUnengaged: args.excludeUnengaged, leaveSegment: args.leaveSegment }

        const result = await client.patch(`/automations/${automationId}/exit-criteria`, exitCriteria)
        const staged = result.draftExitCriteria ? ' (staged as a draft change - not live until merged)' : ''
        return textResult(`Set exit criteria${staged}:\n${formatExitCriteria(result.draftExitCriteria || result.exitCriteria)}`)
      }
    },
    {
      name: 'manage_automation_node',
      config: {
        title: 'Add, update, delete, or restore a step in an automation\'s sequence',
        description: 'Steps run in order top to bottom. Use manage_automation (action "get") first to see the current sequence and every node\'s id - branch sub-conditions are addressable the same way, by their own id. send-email/notify content (subject, body, etc.) is set separately via manage_automation_email_content, not here. Deleting a step on an active/paused automation only stages it for removal (shown as "[PENDING DELETION]" in manage_automation\'s output) until the draft is merged - use "restore" to undo that before merging.',
        inputSchema: {
          action: z.enum(['add', 'update', 'delete', 'restore']),
          automationId: z.string().optional(),
          automationName: z.string().optional().describe('Looked up automatically. Provide this if you do not already have the id.'),
          nodeId: z.string().optional().describe('update/delete/restore only - the node (or branch sub-condition) to change, from a prior get/add.'),
          prevNodeId: z.string().optional().describe('add only - insert immediately after this existing node\'s id. Omit to insert as the very first step.'),
          nodeType: z.enum(NODE_TYPES).optional().describe('required for add; only needed for update if changing a send-email/notify node (so its content-handling applies) or genuinely changing the node\'s type.'),
          duration: z.number().optional().describe('delay.'),
          durationType: z.enum(['immediately', 'minute', 'hour', 'day', 'wait-until-time', 'wait-until-day', 'wait-until-weekday']).optional().describe('delay.'),
          waitUntilTime: z.string().optional().describe('delay, "HH:MM" 24h - required for wait-until-time/wait-until-day.'),
          waitUntilDay: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional().describe('delay wait-until-day.'),
          property: z.string().optional().describe('filter-audience / set-value / branch condition.'),
          operator: z.string().optional().describe('filter-audience / branch condition.'),
          value: z.any().optional().describe('filter-audience / set-value / branch condition.'),
          segmentId: z.string().optional().describe('filter-audience / branch condition.'),
          segmentName: z.string().optional().describe('Same as segmentId, by segment name.'),
          excludeUnengaged: z.boolean().optional().describe('filter-audience / notify / branch condition.'),
          condition: z.boolean().optional().describe('Set true when updating a branch\'s own sub-condition (targeted by nodeId) rather than a top-level node - uses property/operator/value/segmentId/excludeUnengaged above.'),
          addValue: z.array(z.string()).optional().describe('manage-tags.'),
          removeValue: z.array(z.string()).optional().describe('manage-tags.'),
          subscriberListId: z.string().optional().describe('notify.'),
          subscriberListName: z.string().optional().describe('Same as subscriberListId, by list name.'),
          emails: z.array(z.string()).optional().describe('notify - extra recipient addresses beyond the contact.'),
          url: z.string().optional().describe('webhook.'),
          method: z.enum(['POST', 'GET', 'PUT', 'PATCH']).optional().describe('webhook.'),
          headers: z.record(z.string()).optional().describe('webhook.'),
          includeContactData: z.boolean().optional().describe('webhook.')
        }
      },
      handler: async (args) => {
        const automationId = await resolveAutomationId({ resolveIdOrRequired, id: args.automationId, name: args.automationName })

        if (args.action === 'delete') {
          const result = await client.del(`/automations/${automationId}/node/${args.nodeId}`)
          const staged = result.status !== 'draft' && result.draftSequence
          return textResult(`${staged ? 'Flagged the step for deletion (staged in the draft - not applied until merge_automation_draft)' : 'Deleted the step'}:\n\n${formatAutomationDetail(result)}`)
        }

        if (args.action === 'restore') {
          const result = await client.put(`/automations/${automationId}/node/${args.nodeId}`, { pendingDeletion: false, emailDeleted: false })
          return textResult(`Restored the step (undid the pending deletion):\n\n${formatAutomationDetail(result)}`)
        }

        const segmentId = await resolveIdOptional({ id: args.segmentId, name: args.segmentName, resourcePath: '/segments', filterField: 'name', label: 'segment' })
        const subscriberListId = await resolveIdOptional({ id: args.subscriberListId, name: args.subscriberListName, resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' })

        const fields = args.condition
          ? { condition: { property: args.property, operator: args.operator, value: args.value, segmentId, excludeUnengaged: args.excludeUnengaged } }
          : { duration: args.duration, durationType: args.durationType, waitUntilTime: args.waitUntilTime, waitUntilDay: args.waitUntilDay, property: args.property, operator: args.operator, value: args.value, segmentId, excludeUnengaged: args.excludeUnengaged, addValue: args.addValue, removeValue: args.removeValue, subscriberListId, emails: args.emails, url: args.url, method: args.method, headers: args.headers, includeContactData: args.includeContactData }
        const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
        if (args.nodeType) {
          body.type = args.nodeType
        }

        if (args.action === 'add') {
          if (args.prevNodeId) {
            body.prevNodeId = args.prevNodeId
          }
          const result = await client.post(`/automations/${automationId}/node`, body)
          return textResult(`Added the step:\n\n${formatAutomationDetail(result)}`)
        }

        const result = await client.put(`/automations/${automationId}/node/${args.nodeId}`, body)
        return textResult(`Updated the step:\n\n${formatAutomationDetail(result)}`)
      }
    },
    {
      name: 'manage_automation_email_content',
      config: {
        title: 'Get or update a send-email/notify step\'s email content',
        description: 'Every send-email/notify node has a companion email document (subject, body, etc.), addressed by its own emailId - visible on the node in manage_automation\'s "get" output.',
        inputSchema: {
          action: z.enum(['get', 'update']),
          automationId: z.string().optional(),
          automationName: z.string().optional().describe('Looked up automatically. Provide this if you do not already have the id.'),
          emailId: z.string().describe('From the send-email/notify node\'s emailId field.'),
          subject: z.string().optional().describe('update only.'),
          previewText: z.string().optional().describe('update only - inbox preview text, meaningfully affects open rates.'),
          bodyType: z.enum(['html', 'text']).optional().describe('update only.'),
          body: z.string().optional().describe('update only - HTML/text content. This tool cannot author the visual (Chamaileon) editor format.'),
          senderIdentityId: z.string().optional().describe('update only.'),
          replyTo: z.string().optional().describe('update only.')
        }
      },
      handler: async (args) => {
        const automationId = await resolveAutomationId({ resolveIdOrRequired, id: args.automationId, name: args.automationName })

        if (args.action === 'get') {
          const email = await client.get(`/automations/${automationId}/email/${args.emailId}`)
          const type = email.type || 'chamaileon'
          return textResult(`"${email.subject || '(no subject yet)'}" (id ${email._id})\nPreview text: ${email.previewText || '(none)'}\nType: ${type}${type === 'chamaileon' ? '' : `\nBody:\n${email.document}`}`)
        }

        const body = {}
        if (args.subject !== undefined) {
          body.subject = args.subject
        }
        if (args.previewText !== undefined) {
          body.previewText = args.previewText
        }
        if (args.bodyType) {
          body.type = args.bodyType
        }
        if (args.body !== undefined) {
          body.document = args.body
        }
        if (args.senderIdentityId) {
          body.senderIdentity = args.senderIdentityId
        }
        if (args.replyTo !== undefined) {
          body.replyTo = args.replyTo
        }

        const email = await client.patch(`/automations/${automationId}/email/${args.emailId}`, body)
        return textResult(`Updated email content:\n"${email.subject}" (id ${email._id})`)
      }
    },
    lifecycleTool({ client, resolveIdOrRequired }, {
      name: 'activate_automation',
      title: 'Activate',
      pastTense: 'Activated automation',
      verb: 'activating this automation (it will go live and start triggering for matching contacts)',
      description: 'Makes a draft automation live, or re-validates and re-activates one that was paused. Validates the trigger and full sequence first - if anything is invalid, nothing changes and the specific problems are reported instead. Requires confirm: true (see its description).',
      path: '/activate'
    }),
    lifecycleTool({ client, resolveIdOrRequired }, {
      name: 'merge_automation_draft',
      title: 'Merge draft changes',
      pastTense: 'Merged the staged draft into the live automation',
      verb: 'merging staged draft changes into this live automation (every contact currently mid-automation is moved onto the new sequence from their current position)',
      description: 'Only meaningful when the automation is active/paused and has staged draft changes (trigger/exit-criteria/node edits made after it went live) - see the "Draft changes staged" section in manage_automation\'s "get" output. Validates the same way as activate_automation. Requires confirm: true.',
      path: '/merge-draft'
    }),
    lifecycleTool({ client, resolveIdOrRequired }, {
      name: 'discard_automation_draft',
      title: 'Discard draft changes',
      pastTense: 'Discarded the staged draft',
      verb: 'discarding the staged draft changes below (the live, running automation is not affected, but the staged edits are permanently lost)',
      description: 'Drops any staged trigger/exit-criteria/node edits without touching what is actually live. Requires confirm: true.',
      path: '/discard-draft'
    }),
    lifecycleTool({ client, resolveIdOrRequired }, {
      name: 'pause_automation',
      title: 'Pause',
      pastTense: 'Paused automation',
      verb: 'pausing this automation (it stops processing steps for contacts already in it, and stops accepting new ones, until resumed)',
      description: 'Requires confirm: true.',
      path: '/pause'
    }),
    lifecycleTool({ client, resolveIdOrRequired }, {
      name: 'resume_automation',
      title: 'Resume',
      pastTense: 'Resumed automation',
      verb: 'resuming this paused automation',
      description: 'Re-validates the same way as activate_automation, since the automation\'s configuration may have changed while paused. Requires confirm: true.',
      path: '/resume'
    })
  ]
}
