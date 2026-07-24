import { z } from 'zod'
import { textResult } from '../helpers/errors.js'
import { groupsSchema } from './segmentGroupsSchema.js'

export function createSegmentTools ({ client, resolveIdOrRequired }) {
  return [
    {
      name: 'manage_segment',
      config: {
        title: 'Manage segments',
        description: 'Segments narrow a subscriber list down by contact properties or engagement history, for use on campaigns (segmentId/segmentName) or as the project\'s "unengaged" definition. A segment cannot be deleted while a campaign or automation still uses it.',
        inputSchema: {
          action: z.enum(['list', 'get', 'create', 'update', 'delete']),
          segmentId: z.string().optional(),
          segmentName: z.string().optional().describe('The segment to get/update/delete, by name - looked up automatically. Provide this if you do not already have the id.'),
          name: z.string().optional().describe('create only, or update to rename.'),
          groups: groupsSchema.optional().describe('create (required), or update to replace the whole condition set.')
        }
      },
      handler: async (args) => {
        if (args.action === 'list') {
          const list = await client.get('/segments', { limit: 30 })
          if (list.count === 0) {
            return textResult('No segments are defined yet.')
          }
          const names = list.items.map(segment => segment.name).join(', ')
          return textResult(`${list.count} segment(s): ${names}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        if (args.action === 'create') {
          const result = await client.post('/segments', { name: args.name, groups: args.groups })
          return textResult(`Created segment "${result.name}" (id ${result._id}).`)
        }

        const id = await resolveIdOrRequired({
          id: args.segmentId,
          name: args.segmentName,
          resourcePath: '/segments',
          filterField: 'name',
          label: 'segment'
        })

        if (args.action === 'get') {
          const segment = await client.get(`/segments/${id}`)
          return textResult(`"${segment.name}" - ${segment.groups.length} group(s), ${segment.groups.reduce((n, g) => n + g.conditions.length, 0)} total condition(s).`)
        }

        if (args.action === 'update') {
          const body = {}
          if (args.name) {
            body.name = args.name
          }
          if (args.groups) {
            body.groups = args.groups
          }
          const result = await client.patch(`/segments/${id}`, body)
          return textResult(`Updated segment "${result.name}".`)
        }

        await client.del(`/segments/${id}`)
        return textResult('Deleted the segment.')
      }
    }
  ]
}
