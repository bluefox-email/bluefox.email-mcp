import { z } from 'zod'

const feedSchema = z.object({
  url: z.string(),
  feedType: z.enum(['rss-xml', 'json']).describe('"rss-xml" covers both RSS and Atom XML feeds - which one it actually is gets auto-detected from the feed content itself, which changes the array key inside the template (see variableName).'),
  variableName: z.string().describe(
    'No spaces allowed. Becomes a top-level Handlebars variable in the email body. The feed\'s parsed items are NOT directly at {{variableName}} - ' +
    'they\'re nested under a feed-shape-dependent array key looped with {{#each}}: RSS -> <variableName>.item, Atom -> <variableName>.entry, ' +
    'json -> whatever key the source JSON uses for its list (inspect the feed to find it). Each item\'s own fields mirror the feed\'s actual content (e.g. {{this.title}}, {{this.link}}).'
  ),
  maxItems: z.number().optional().describe('Informational only - NOT enforced when the email is sent. To actually limit rendered items, pass limit/skip on the each tag itself, e.g. {{#each news.item limit=5 skip=0}}.'),
  required: z.boolean().optional(),
  availableFields: z.array(z.string()).optional().describe('Informational only, for the app UI - not enforced or used when rendering.')
})

export const feedsSchema = z.array(feedSchema).describe('RSS/Atom/JSON feeds to pull dynamic content into the email body - see variableName on each feed for how to reference it from the body.')
