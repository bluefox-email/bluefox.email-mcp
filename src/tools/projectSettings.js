import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { groupsSchema } from './segmentGroupsSchema.js'

export function createProjectSettingsTools ({ client }) {
  return [
    {
      name: 'manage_project_settings',
      config: {
        title: 'Get or update project settings',
        description: 'Reads or updates this project\'s own settings - its name, logo, the segment that defines "unengaged" contacts (used by excludeUnengaged on campaigns/triggered emails), and what happens to a contact automatically when they bounce or complain. Note: API keys and the IP whitelist cannot be read or changed through this tool.',
        inputSchema: {
          action: z.enum(['get', 'update']),
          name: z.string().optional().describe('update only.'),
          logoUrl: z.string().optional().describe('update only.'),
          unengagedContactSegmentGroups: groupsSchema.optional().describe('update only. Replaces the whole "unengaged" segment definition.'),
          autoRemoveOnBounce: z.enum(['off', 'removeFromLists', 'deleteContact']).optional().describe('update only. Defaults to removeFromLists. "off" leaves the contact\'s subscriptions untouched, "removeFromLists" unsubscribes them from every list, "deleteContact" also deletes the contact entirely.'),
          autoRemoveOnComplaint: z.enum(['off', 'removeFromLists', 'deleteContact']).optional().describe('update only. Same modes as autoRemoveOnBounce, applied on a spam complaint instead.')
        }
      },
      handler: async (args) => {
        if (args.action === 'get') {
          const project = await client.get('')
          const autoRemove = project.autoRemoveFromList || {}
          return textResult(`Project "${project.name}" - status: ${project.status}, logoUrl: ${project.logoUrl || 'none'}, auto-remove on bounce: ${autoRemove.bounce || 'removeFromLists'}, auto-remove on complaint: ${autoRemove.complaint || 'removeFromLists'}.`)
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
        return textResult(`Updated project settings - name is now "${result.name}".`)
      }
    }
  ]
}
