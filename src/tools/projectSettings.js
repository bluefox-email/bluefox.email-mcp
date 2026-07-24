import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { groupsSchema } from './segmentGroupsSchema.js'

export function createProjectSettingsTools ({ client }) {
  return [
    {
      name: 'manage_project_settings',
      config: {
        title: 'Get or update project settings',
        description: 'Reads or updates this project\'s own settings - its name, logo, and the segment that defines "unengaged" contacts (used by excludeUnengaged on campaigns/triggered emails). Note: API keys and the IP whitelist cannot be read or changed through this tool.',
        inputSchema: {
          action: z.enum(['get', 'update']),
          name: z.string().optional().describe('update only.'),
          logoUrl: z.string().optional().describe('update only.'),
          unengagedContactSegmentGroups: groupsSchema.optional().describe('update only. Replaces the whole "unengaged" segment definition.')
        }
      },
      handler: async (args) => {
        if (args.action === 'get') {
          const project = await client.get('')
          return textResult(`Project "${project.name}" - status: ${project.status}, logoUrl: ${project.logoUrl || 'none'}.`)
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

        const result = await client.patch('', body)
        return textResult(`Updated project settings - name is now "${result.name}".`)
      }
    }
  ]
}
