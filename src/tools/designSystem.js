import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const overrideSchema = z.object({
  category: z.enum(['variables', 'font', 'components']),
  key: z.string().describe('Depends on category: variables -> colors|fontStacks|images|links|texts, font -> resources|stacks, components -> buttons|texts|images|dividers.'),
  name: z.string().describe('For variables/components, must match an existing entry\'s name in the base design system (see the "get" action\'s output).'),
  value: z.any().describe('Shape depends on category/key - e.g. a hex color string, a font stack string, or a style object for components.'),
  main: z.boolean().optional(),
  description: z.string().optional()
})

const resetSchema = z.object({
  category: z.enum(['variables', 'font', 'components']),
  key: z.string(),
  name: z.string()
})

function formatEntries (entries) {
  if (!entries.length) {
    return 'none'
  }
  return entries.map(entry => {
    const value = entry.value && typeof entry.value === 'object' ? JSON.stringify(entry.value) : entry.value
    return `${entry.name}${entry.main ? ' (main)' : ''}: ${value}${entry.overridden ? ' [overridden]' : ''}`
  }).join(', ')
}

function formatDesignSystem (designSystem) {
  const lines = [
    `"${designSystem.name}" (id ${designSystem._id})`,
    `variables.colors: ${formatEntries(designSystem.variables.colors)}`,
    `variables.fontStacks: ${formatEntries(designSystem.variables.fontStacks)}`,
    `variables.images: ${formatEntries(designSystem.variables.images)}`,
    `variables.links: ${formatEntries(designSystem.variables.links)}`,
    `variables.texts: ${formatEntries(designSystem.variables.texts)}`,
    `font.resources: ${formatEntries(designSystem.font.resources)}`,
    `font.stacks: ${formatEntries(designSystem.font.stacks)}`,
    `components.buttons: ${formatEntries(designSystem.components.buttons)}`,
    `components.texts: ${formatEntries(designSystem.components.texts)}`,
    `components.images: ${formatEntries(designSystem.components.images)}`,
    `components.dividers: ${formatEntries(designSystem.components.dividers)}`
  ]
  return lines.join('\n')
}

export function createDesignSystemTools ({ client }) {
  return [
    {
      name: 'manage_design_system',
      config: {
        title: 'Get or override the project\'s design system',
        description: 'Reads the project\'s design system (colors, fonts, images, links, text/button/divider styles used in emails - shown in the app as "Email Theme"), or overrides/resets specific values. This cannot switch to a different design system or create a new one - only override pieces of the one the project already has.',
        inputSchema: {
          action: z.enum(['get', 'set_overrides', 'reset_overrides']),
          setOverrides: z.array(overrideSchema).optional().describe('set_overrides only.'),
          resetOverrides: z.array(resetSchema).optional().describe('reset_overrides only - reverts each named value back to the design system\'s base value.')
        }
      },
      handler: async (args) => {
        const list = await client.get('/design-systems', { limit: 1 })
        const designSystem = list.items[0]

        if (args.action === 'get') {
          return textResult(formatDesignSystem(designSystem))
        }

        const body = {}
        if (args.action === 'set_overrides') {
          body.setOverrides = args.setOverrides
        }
        if (args.action === 'reset_overrides') {
          body.resetOverrides = args.resetOverrides
        }

        const result = await client.patch(`/design-systems/${designSystem._id}`, body)
        const verb = args.action === 'set_overrides' ? 'Applied' : 'Reset'
        return textResult(`${verb} the design system override(s).\n${formatDesignSystem(result)}`)
      }
    }
  ]
}
