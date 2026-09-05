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
        description: 'Reads or updates this project\'s own settings - its name, logo, a custom subscription preferences page, the segment that defines "unengaged" contacts (used by excludeUnengaged on campaigns/triggered emails), what happens to a contact automatically when they bounce or complain, and the domain whitelist. Note: API keys cannot be read or changed through this tool.',
        inputSchema: {
          action: z.enum(['get', 'update']),
          name: z.string().optional().describe('update only.'),
          logoUrl: z.string().optional().describe('update only. Pass an empty string to remove the logo.'),
          customSubscriptionPreferencesUrl: z.string().optional().describe(
            'update only. A subscriber-facing page you host yourself for managing subscription preferences - when set, unsubscribe/pause links in emails point here instead of bluefox.email\'s default page. Send with or without a scheme (http/https is stripped either way, since bluefox.email always links to it as https). Pass an empty string to revert to the default page.\n\n' +
            'Building this page? It never needs and should never hold the project\'s API key - the emailed link carries a `?token=...` query parameter scoped to that one subscriber, and that\'s the only credential the page ever sees. Send it as-is as a bearer token (`Authorization: Bearer <token>`) to the bluefox.email public API: ' +
            'GET /v1/projectId/{projectId}/subscriber-lists/public/{email} lists every list that email can manage with its current status (active/paused/unsubscribed) on each; PATCH /v1/projectId/{projectId}/subscriber-lists/{id}/subscribers/{email} changes status on one list (pause needs a future pausedUntil); POST /v1/projectId/{projectId}/subscriber-lists/{id}/subscribers re-subscribes them to a list they are not currently on. Same token for every call on that page load - do not decode, generate, or persist it.'
          ),
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
            `Project "${project.name}" - status: ${project.status}, logoUrl: ${project.logoUrl || 'none'}, custom subscription preferences URL: ${project.customSubscriptionPreferencesUrl || 'none (using bluefox.email\'s default page)'}, ` +
            `auto-remove on bounce: ${autoRemove.bounce || 'removeFromLists'}, auto-remove on complaint: ${autoRemove.complaint || 'removeFromLists'}, ` +
            `domain whitelist: ${project.whiteList?.length ? project.whiteList.join(', ') : 'none'}.\n` +
            `Unengaged contact segment: ${formatUnengagedSegment(project.unengagedContactSegment)}`
          )
        }

        const body = {}
        if (args.name) {
          body.name = args.name
        }
        if (args.logoUrl !== undefined) {
          body.logoUrl = args.logoUrl
        }
        if (args.customSubscriptionPreferencesUrl !== undefined) {
          body.customSubscriptionPreferencesUrl = args.customSubscriptionPreferencesUrl
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
          `Updated project "${result.name}" - status: ${result.status}, logoUrl: ${result.logoUrl || 'none'}, custom subscription preferences URL: ${result.customSubscriptionPreferencesUrl || 'none (using bluefox.email\'s default page)'}, ` +
          `auto-remove on bounce: ${autoRemove.bounce || 'removeFromLists'}, auto-remove on complaint: ${autoRemove.complaint || 'removeFromLists'}, ` +
          `domain whitelist: ${result.whiteList?.length ? result.whiteList.join(', ') : 'none'}.\n` +
          `Unengaged contact segment: ${formatUnengagedSegment(result.unengagedContactSegment)}`
        )
      }
    }
  ]
}
