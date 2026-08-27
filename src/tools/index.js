import { toToolResult } from '../helpers/errors.js'
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
    ...createGalleryTools(deps)
  ]
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
