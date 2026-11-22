import { z } from 'zod'
import { toToolResult, ResolveError } from '../helpers/errors.js'
import { createCampaignTools } from './campaigns.js'
import { createSubscriberListTools } from './subscriberLists.js'
import { createTransactionalEmailTools } from './transactionalEmails.js'
import { createTriggeredEmailTools } from './triggeredEmails.js'
import { createContactTools } from './contacts.js'
import { createEmailLifecycleTools } from './emailLifecycle.js'
import { createTestEmailTools } from './testEmail.js'
import { createProjectSettingsTools } from './projectSettings.js'
import { createDesignSystemTools } from './designSystem.js'
import { createSendingSetupTools } from './sendingSetup.js'
import { createWebhookTools } from './webhook.js'
import { createContactFieldsAndTagsTools } from './contactFieldsAndTags.js'
import { createSegmentTools } from './segments.js'
import { createSuppressionListTools } from './suppressionList.js'
import { createTemplateTools } from './templates.js'
import { createSubscriptionTools } from './subscriptions.js'
import { createSignUpFormTools } from './signUpForms.js'
import { createProductionAccessTools } from './productionAccess.js'
import { createContactImportTools } from './contactImport.js'
import { createContactOpsTools } from './contactOps.js'
import { createProjectSetupTools } from './projectSetup.js'
import { createAutomationTools } from './automations.js'
import { createGalleryTools } from './gallery.js'

export function collectTools (deps) {
  return [
    ...createCampaignTools(deps),
    ...createSubscriberListTools(deps),
    ...createTransactionalEmailTools(deps),
    ...createTriggeredEmailTools(deps),
    ...createContactTools(deps),
    ...createEmailLifecycleTools(deps),
    ...createTestEmailTools(deps),
    ...createProjectSettingsTools(deps),
    ...createDesignSystemTools(deps),
    ...createSendingSetupTools(deps),
    ...createWebhookTools(deps),
    ...createContactFieldsAndTagsTools(deps),
    ...createSegmentTools(deps),
    ...createSuppressionListTools(deps),
    ...createTemplateTools(deps),
    ...createSubscriptionTools(deps),
    ...createSignUpFormTools(deps),
    ...createProductionAccessTools(deps),
    ...createContactImportTools(deps),
    ...createContactOpsTools(deps),
    ...createProjectSetupTools(deps),
    ...createAutomationTools(deps),
    ...createGalleryTools(deps)
  ]
}

const HOSTED_HIDDEN_PARAMS = ['imagePath', 'imageUrl', 'chamaileonJsonPath', 'chamaileonJsonOutputPath']

function withoutHostedParams (values) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !HOSTED_HIDDEN_PARAMS.includes(key)))
}

export function registerTools (server, deps) {
  for (const tool of collectTools(deps)) {
    server.registerTool(tool.name, tool.config, async (args, extra) => {
      try {
        return await tool.handler(args, extra)
      } catch (err) {
        return toToolResult(err)
      }
    })
  }
}

export function registerHostedTools (server, projects) {
  const toolSets = projects.map(project => collectTools({ ...project.deps, hosted: true }))
  const names = projects.map(project => `"${project.name}" (${project.projectId})`).join(', ')
  const projectParam = z.string().optional().describe(`Which bluefox.email project to use, by name or ID. Connected projects: ${names}. Defaults to "${projects[0].name}".`)

  toolSets[0].forEach((tool, index) => {
    const config = { ...tool.config, inputSchema: { ...withoutHostedParams(tool.config.inputSchema), project: projectParam } }
    server.registerTool(tool.name, config, async ({ project, ...args }, extra) => {
      try {
        const position = project ? projects.findIndex(item => item.projectId === project || item.name.toLowerCase() === project.toLowerCase()) : 0
        if (position === -1) {
          throw new ResolveError(`No connected project "${project}". Connected projects: ${names}.`)
        }
        return await toolSets[position][index].handler(withoutHostedParams(args), extra)
      } catch (err) {
        return toToolResult(err)
      }
    })
  })
}
