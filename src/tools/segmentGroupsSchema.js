import { z } from 'zod'

const OPERATORS = [
  'any', 'equals', 'does-not-equal', 'contains', 'does-not-contain',
  'is-empty', 'is-not-empty', 'is-true', 'is-false',
  'greater-than', 'greater-than-or-equal', 'less-than', 'less-than-or-equal',
  'has-tag', 'does-not-have-tag',
  'opened', 'not-opened', 'clicked', 'not-clicked', 'received', 'not-received',
  'date-equals', 'date-before', 'date-after', 'date-in-last', 'date-more-than'
]

const conditionSchema = z.object({
  category: z.enum(['contact-property', 'engagement']).optional().describe('Defaults to "contact-property". Use "engagement" for opened/clicked/received conditions - those have no property field.'),
  property: z.string().optional().describe('A custom contact field name (see get_contact/manage_contact_fields_and_tags for the registered names), or "createdAt". Required unless operator is "any", a tag operator, or category is "engagement".'),
  operator: z.enum(OPERATORS).optional().describe('Defaults to "any" (matches everyone).'),
  value: z.any().optional().describe('Comparison value - type depends on the operator/property (string, number, boolean, or a date string).')
})

export const groupsSchema = z.array(z.object({
  conditions: z.array(conditionSchema).describe('Conditions within a group are AND-ed together.')
})).describe('Groups are OR-ed together - a contact matches the segment if they match every condition in at least one group.')
