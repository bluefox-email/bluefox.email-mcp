import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

function formatTemplateDetail (template) {
  return `"${template.name}" (id ${template._id}) - subject: "${template.subject}"${template.previewText ? `, preview: "${template.previewText}"` : ''}. Tags: ${(template.tags || []).join(', ') || 'none'}. On new project creation: ${template.onProjectCreation || 'do-nothing'}.`
}

export function createTemplateTools ({ client, resolveIdOrRequired }) {
  return [
    {
      name: 'manage_templates',
      config: {
        title: 'Manage templates',
        description: 'Lists, inspects, duplicates, renames, or deletes templates from bluefox.email\'s visual (Chamaileon) editor. This tool cannot author or edit a template\'s visual content (its "document") from scratch - that only happens in the app\'s drag-and-drop editor - so create only works by duplicating an existing template\'s visual content under new metadata. It also cannot create a campaign/transactional/triggered email FROM a template, or attach one to an existing email - creating those only supports plain html/text content.',
        inputSchema: {
          action: z.enum(['list', 'get', 'create', 'update', 'delete']),
          templateId: z.string().optional(),
          templateName: z.string().optional().describe('The template to get/update/delete, by name - looked up automatically. Provide this if you do not already have the id.'),
          sourceTemplateId: z.string().optional().describe('create only, required - the existing template whose visual content gets copied as-is into the new one. Alternatively give sourceTemplateName.'),
          sourceTemplateName: z.string().optional().describe('create only. Looked up automatically.'),
          name: z.string().optional().describe('create only, required - the new template\'s name.'),
          newName: z.string().optional().describe('update only.'),
          subject: z.string().optional().describe('create/update. On create, defaults to the source template\'s subject if omitted.'),
          previewText: z.string().optional().describe('create/update. On create, defaults to the source template\'s previewText if omitted.'),
          tags: z.array(z.string()).optional().describe('create/update - replaces the whole tag list. On create, defaults to the source template\'s tags if omitted.'),
          onProjectCreation: z.enum(['do-nothing', 'set-as-transactional', 'set-as-triggered', 'set-as-campaign']).optional().describe('create/update. Whether new projects automatically get this template set as their default transactional/triggered/campaign email.')
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

        if (args.action === 'create') {
          const sourceId = await resolveIdOrRequired({
            id: args.sourceTemplateId,
            name: args.sourceTemplateName,
            resourcePath: '/templates',
            filterField: 'name',
            label: 'source template'
          })
          const source = await client.get(`/templates/${sourceId}`)
          const body = {
            name: args.name,
            subject: args.subject || source.subject,
            document: source.document,
            tags: args.tags || source.tags,
            previewText: args.previewText ?? source.previewText,
            onProjectCreation: args.onProjectCreation || source.onProjectCreation
          }
          const result = await client.post('/templates', body)
          return textResult(`Created template (from a copy of "${source.name}"):\n${formatTemplateDetail(result)}`)
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
          return textResult(formatTemplateDetail(template))
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
          if (args.onProjectCreation) {
            body.onProjectCreation = args.onProjectCreation
          }
          const result = await client.patch(`/templates/${id}`, body)
          return textResult(`Updated template:\n${formatTemplateDetail(result)}`)
        }

        await client.del(`/templates/${id}`)
        return textResult('Deleted the template.')
      }
    }
  ]
}
