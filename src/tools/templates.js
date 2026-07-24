import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

export function createTemplateTools ({ client, resolveIdOrRequired }) {
  return [
    {
      name: 'manage_templates',
      config: {
        title: 'Manage templates',
        description: 'Lists, inspects, renames, or deletes templates from bluefox.email\'s visual (Chamaileon) editor. This tool cannot author or edit a template\'s visual content (its "document") - that only happens in the app\'s drag-and-drop editor. It also cannot create a campaign/transactional/triggered email FROM a template, or attach one to an existing email - creating those only supports plain html/text content. Use this tool only for metadata: name, subject, previewText, tags.',
        inputSchema: {
          action: z.enum(['list', 'get', 'update', 'delete']),
          templateId: z.string().optional(),
          templateName: z.string().optional().describe('The template to get/update/delete, by name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional().describe('update only.'),
          subject: z.string().optional().describe('update only.'),
          previewText: z.string().optional().describe('update only.'),
          tags: z.array(z.string()).optional().describe('update only - replaces the whole tag list.')
        }
      },
      handler: async (args) => {
        if (args.action === 'list') {
          const list = await client.get('/templates', { limit: 30 })
          if (list.count === 0) {
            return textResult('No templates exist yet.')
          }
          const names = list.items.map(template => template.name).join(', ')
          return textResult(`${list.count} template(s): ${names}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        const id = await resolveIdOrRequired({
          id: args.templateId,
          name: args.templateName,
          resourcePath: '/templates',
          filterField: 'name',
          label: 'template'
        })

        if (args.action === 'get') {
          const template = await client.get(`/templates/${id}`)
          return textResult(`"${template.name}" - subject: "${template.subject}"${template.previewText ? `, preview: "${template.previewText}"` : ''}. Tags: ${(template.tags || []).join(', ') || 'none'}.`)
        }

        if (args.action === 'update') {
          const body = {}
          if (args.newName) {
            body.name = args.newName
          }
          if (args.subject) {
            body.subject = args.subject
          }
          if (args.previewText) {
            body.previewText = args.previewText
          }
          if (args.tags) {
            body.tags = args.tags
          }
          const result = await client.patch(`/templates/${id}`, body)
          return textResult(`Updated template "${result.name}".`)
        }

        await client.del(`/templates/${id}`)
        return textResult('Deleted the template.')
      }
    }
  ]
}
