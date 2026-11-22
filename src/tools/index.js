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

function projectNames (projects) {
  return projects.map(project => `"${project.name}" (${project.projectId})`).join(', ')
}

export function hostedInstructions (projects) {
  return `Connected bluefox.email projects: ${projectNames(projects)}. Every reply starts with the project it ran in. ` +
    'Always tell the user which project you are working in. Keep using the same project until the user asks to switch, ' +
    'and when they do, say clearly that you are now working in the other project. Never change project on your own.'
}

export function registerHostedTools (server, projects) {
  const toolSets = projects.map(project => collectTools({ ...project.deps, hosted: true }))
  const names = projectNames(projects)
  const projectParam = projects.length > 1
    ? z.string().describe(`Which bluefox.email project to use, by name or ID: ${names}. Use the project the user is working in; change it only when the user asks to switch.`)
    : z.string().optional().describe(`The only connected project is ${names}.`)

  toolSets[0].forEach((tool, index) => {
    const config = { ...tool.config, inputSchema: { ...withoutHostedParams(tool.config.inputSchema), project: projectParam } }
    server.registerTool(tool.name, config, async ({ project, ...args }, extra) => {
      const selected = project ? projects.find(item => item.projectId === project || item.name.toLowerCase() === project.toLowerCase()) : projects[0]
      if (!selected) {
        return toToolResult(new ResolveError(`No connected project "${project}". Connected projects: ${names}.`))
      }
      let result
      try {
        result = await toolSets[projects.indexOf(selected)][index].handler(withoutHostedParams(args), extra)
      } catch (err) {
        result = toToolResult(err)
      }
      return { ...result, content: [{ type: 'text', text: `Project: "${selected.name}" (${selected.projectId})` }, ...result.content] }
    })
  })
}
