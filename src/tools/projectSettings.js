import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { groupsSchema } from './segmentGroupsSchema.js'
import { formatCondition } from './segments.js'

function formatUnengagedSegment (unengagedContactSegment) {
  const groups = unengagedContactSegment?.groups
  if (!groups?.length) {
    return 'not configured'
  }
  return groups.map((group, index) => `Group ${index + 1} (OR): ${group.conditions.map(formatCondition).join(' AND ') || '(no conditions - matches everyone)'}`).join('; ')
}

export function createProjectSettingsTools ({ client }) {
  return [
    {
      name: 'manage_project_settings',
      config: {
        title: 'Get or update project settings',
        description: 'Reads or updates this project\'s own settings - its name, logo, the segment that defines "unengaged" contacts (used by excludeUnengaged on campaigns/triggered emails), what happens to a contact automatically when they bounce or complain, and the domain whitelist. Note: API keys cannot be read or changed through this tool.',
        inputSchema: {
          action: z.enum(['get', 'update']),
          name: z.string().optional().describe('update only.'),
          logoUrl: z.string().optional().describe('update only.'),
          unengagedContactSegmentGroups: groupsSchema.optional().describe('update only. Replaces the whole "unengaged" segment definition.'),
          autoRemoveOnBounce: z.enum(['off', 'removeFromLists', 'deleteContact']).optional().describe('update only. Defaults to removeFromLists. "off" leaves the contact\'s subscriptions untouched, "removeFromLists" unsubscribes them from every list, "deleteContact" also deletes the contact entirely.'),
          autoRemoveOnComplaint: z.enum(['off', 'removeFromLists', 'deleteContact']).optional().describe('update only. Same modes as autoRemoveOnBounce, applied on a spam complaint instead.'),
          domainWhitelist: z.array(z.string()).optional().describe('update only. Replaces the whole whitelist. Bare domains only (e.g. "example.com", no protocol/path) - lets browser JavaScript on that origin call certain endpoints (like the direct subscribe-to-list endpoint) without an API key.')
        }
      },
      handler: async (args) => {
        if (args.action === 'get') {
          const project = await client.get('')
          const autoRemove = project.autoRemoveFromList || {}
          return textResult(
            `Project "${project.name}" - status: ${project.status}, logoUrl: ${project.logoUrl || 'none'}, ` +
            `auto-remove on bounce: ${autoRemove.bounce || 'removeFromLists'}, auto-remove on complaint: ${autoRemove.complaint || 'removeFromLists'}, ` +
            `domain whitelist: ${project.whiteList?.length ? project.whiteList.join(', ') : 'none'}.\n` +
            `Unengaged contact segment: ${formatUnengagedSegment(project.unengagedContactSegment)}`
          )
        }

        const body = {}
        if (args.name) {
          body.name = args.name
        }
        if (args.logoUrl) {
          body.logoUrl = args.logoUrl
        }
        if (args.unengagedContactSegmentGroups) {
          body.unengagedContactSegment = { groups: args.unengagedContactSegmentGroups }
        }
        if (args.domainWhitelist) {
          body.whiteList = args.domainWhitelist
        }
        if (args.autoRemoveOnBounce || args.autoRemoveOnComplaint) {
          // the API replaces the whole autoRemoveFromList object, not a per-key merge - fetch the current
          // one first so setting only one of bounce/complaint doesn't silently reset the other to its default.
          const current = args.autoRemoveOnBounce && args.autoRemoveOnComplaint ? null : await client.get('')
          body.autoRemoveFromList = {
            bounce: args.autoRemoveOnBounce || current?.autoRemoveFromList?.bounce || 'removeFromLists',
            complaint: args.autoRemoveOnComplaint || current?.autoRemoveFromList?.complaint || 'removeFromLists'
          }
        }

        const result = await client.patch('', body)
        const autoRemove = result.autoRemoveFromList || {}
        return textResult(
          `Updated project "${result.name}" - status: ${result.status}, logoUrl: ${result.logoUrl || 'none'}, ` +
          `auto-remove on bounce: ${autoRemove.bounce || 'removeFromLists'}, auto-remove on complaint: ${autoRemove.complaint || 'removeFromLists'}, ` +
          `domain whitelist: ${result.whiteList?.length ? result.whiteList.join(', ') : 'none'}.\n` +
          `Unengaged contact segment: ${formatUnengagedSegment(result.unengagedContactSegment)}`
        )
      }
    }
  ]
}
