import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const signupFormStyleFields = [
  'formLayout', 'showCaptcha', 'emailPlaceholder', 'captchaPlaceholder', 'formFontStyle', 'formFontColor',
  'formFontSize', 'btnLabel', 'btnFont', 'btnFontColor', 'btnColor', 'btnFontSize', 'successMessage',
  'successFont', 'successFontColor', 'successFontSize'
]

const signupFormSchema = {
  formLayout: z.string().optional().describe('This list\'s own join form only (not a separate signup_forms resource).'),
  showCaptcha: z.boolean().optional().describe('Defaults to true.'),
  emailPlaceholder: z.string().optional(),
  captchaPlaceholder: z.string().optional(),
  formFontStyle: z.string().optional(),
  formFontColor: z.string().optional(),
  formFontSize: z.string().optional(),
  btnLabel: z.string().optional(),
  btnFont: z.string().optional(),
  btnFontColor: z.string().optional(),
  btnColor: z.string().optional(),
  btnFontSize: z.string().optional(),
  successMessage: z.string().optional(),
  successFont: z.string().optional(),
  successFontColor: z.string().optional(),
  successFontSize: z.string().optional(),
  contactFields: z.array(z.object({
    name: z.string().describe('The custom contact field\'s name - use manage_contact_fields_and_tags (action: list) to see what exists on the project.'),
    show: z.boolean().optional().describe('Whether this field appears on the form. Defaults to false (hidden) the first time a field is configured.'),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    order: z.number().optional().describe('Display position relative to other visible fields - lower shows first.')
  })).optional().describe('Per-field show/hide, required, placeholder, and order for the project\'s custom contact fields on this list\'s own join form. Only the fields listed here are changed - any other field\'s existing settings are left as-is.')
}

function wantsSignupFormChange (args) {
  return signupFormStyleFields.some(field => args[field] !== undefined) || args.contactFields?.length > 0
}

// signupForm is a nested object the API replaces wholesale when given, not deep-merged - the caller passes in
// the already-fetched current signupForm (or undefined on create, where there's nothing to preserve yet).
function buildSignupFormBody (args, current = {}) {
  const signupForm = { ...current }
  for (const field of signupFormStyleFields) {
    if (args[field] !== undefined) {
      signupForm[field] = args[field]
    }
  }
  if (args.contactFields?.length) {
    const propertiesStyle = { ...current.propertiesStyle }
    for (const field of args.contactFields) {
      propertiesStyle[field.name] = {
        ...propertiesStyle[field.name],
        ...(field.show !== undefined && { show: field.show }),
        ...(field.required !== undefined && { required: field.required }),
        ...(field.placeholder !== undefined && { placeholder: field.placeholder }),
        ...(field.order !== undefined && { order: field.order })
      }
    }
    signupForm.propertiesStyle = propertiesStyle
  }
  return signupForm
}

function formatSubscriberListDetail (detail, stats) {
  const lines = [
    `"${detail.name}" - ${detail.description || 'no description'}. ${detail.private ? 'Private' : 'Public'}.`
  ]
  if (detail.doubleOptIn?.active) {
    lines.push(
      `Double opt-in: ON - confirmation email id ${detail.doubleOptIn.emailId || '(none set)'}. ` +
      `Redirect after confirming: ${detail.doubleOptIn.redirectLink || '(none)'}. ` +
      `Confirmation title: "${detail.doubleOptIn.confirmationTitle}". Confirmation message: "${detail.doubleOptIn.confirmationMessage}".`
    )
  } else {
    lines.push('Double opt-in: OFF.')
  }
  const signupForm = detail.signupForm || {}
  lines.push(
    `Join form: layout ${signupForm.formLayout}, captcha ${signupForm.showCaptcha === false ? 'off' : 'on'}, ` +
    `button "${signupForm.btnLabel}" (${signupForm.btnFontColor} on ${signupForm.btnColor}), ` +
    `success message: "${signupForm.successMessage}".`
  )
  const customFieldCount = signupForm.propertiesStyle ? Object.keys(signupForm.propertiesStyle).length : 0
  lines.push(`Custom contact field settings (propertiesStyle): ${customFieldCount ? JSON.stringify(signupForm.propertiesStyle) : 'none configured'}`)
  lines.push(`Stats: ${stats.active} active, ${stats.paused} paused, ${stats.unsubscribed} unsubscribed, ${stats.unverified} unverified.`)
  return lines.join('\n')
}

export function createSubscriberListTools ({ client, resolveIdOptional, resolveIdOrRequired }) {
  return [
    {
      name: 'create_subscriber_list',
      config: {
        title: 'Create subscriber list',
        description: 'Creates a new subscriber list (audience) that contacts, campaigns, and triggered emails can reference.',
        inputSchema: {
          name: z.string().describe('List name.'),
          description: z.string().describe('A short description of what this list is for.'),
          private: z.boolean().optional().describe('Private lists are not selectable as a "test email" recipient list target from a public signup form. Defaults to false.'),
          doubleOptInActive: z.boolean().optional().describe('Require confirmation before a new subscriber is fully active. The referenced transactional email\'s body MUST contain {{verifyLink}} - the API rejects enabling this otherwise, since that\'s the only way a contact can confirm.'),
          doubleOptInTransactionalEmailId: z.string().optional().describe('The transactional email that sends the confirmation message, by id. Required if doubleOptInActive is true. Its body must include {{verifyLink}}.'),
          doubleOptInTransactionalEmailName: z.string().optional().describe('The transactional email that sends the confirmation message, by name - looked up automatically. Required if doubleOptInActive is true and the id is not already known. Its body must include {{verifyLink}}.'),
          doubleOptInRedirectLink: z.string().optional().describe('Where to send the contact after they confirm.'),
          confirmationTitle: z.string().optional(),
          confirmationMessage: z.string().optional(),
          ...signupFormSchema
        }
      },
      handler: async (args) => {
        const body = {
          name: args.name,
          description: args.description
        }
        if (args.private !== undefined) {
          body.private = args.private
        }

        if (args.doubleOptInActive || args.doubleOptInTransactionalEmailId || args.doubleOptInTransactionalEmailName) {
          const emailId = await resolveIdOptional({
            id: args.doubleOptInTransactionalEmailId,
            name: args.doubleOptInTransactionalEmailName,
            resourcePath: '/transactional-emails',
            filterField: 'name',
            label: 'transactional email'
          })
          body.doubleOptIn = {
            active: args.doubleOptInActive,
            emailId,
            redirectLink: args.doubleOptInRedirectLink,
            confirmationTitle: args.confirmationTitle,
            confirmationMessage: args.confirmationMessage
          }
        }

        if (wantsSignupFormChange(args)) {
          body.signupForm = buildSignupFormBody(args)
        }

        const result = await client.post('/subscriber-lists', body)
        return textResult(`Created subscriber list "${result.name}" (id ${result._id}).`)
      }
    },
    {
      name: 'update_subscriber_list',
      config: {
        title: 'Update subscriber list',
        description: 'Updates an existing subscriber list\'s name, description, privacy, or double opt-in settings.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('The list to update, by name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional(),
          description: z.string().optional(),
          private: z.boolean().optional(),
          doubleOptInActive: z.boolean().optional().describe('The referenced transactional email\'s body MUST contain {{verifyLink}} - the API rejects enabling this otherwise.'),
          doubleOptInTransactionalEmailId: z.string().optional().describe('Its body must include {{verifyLink}}.'),
          doubleOptInTransactionalEmailName: z.string().optional().describe('Looked up automatically. Its body must include {{verifyLink}}.'),
          doubleOptInRedirectLink: z.string().optional().describe('On update, pass an empty string to clear it and fall back to showing the confirmation title/message instead of redirecting.'),
          confirmationTitle: z.string().optional().describe('On update, pass an empty string to clear it.'),
          confirmationMessage: z.string().optional().describe('On update, pass an empty string to clear it.'),
          ...signupFormSchema
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })

        const body = {}
        if (args.newName) {
          body.name = args.newName
        }
        if (args.description) {
          body.description = args.description
        }
        if (args.private !== undefined) {
          body.private = args.private
        }

        const wantsDoubleOptInChange = args.doubleOptInActive !== undefined ||
          args.doubleOptInTransactionalEmailId ||
          args.doubleOptInTransactionalEmailName ||
          args.doubleOptInRedirectLink !== undefined ||
          args.confirmationTitle !== undefined ||
          args.confirmationMessage !== undefined
        const signupFormChange = wantsSignupFormChange(args)

        // doubleOptIn/signupForm are nested objects the API replaces wholesale when given, not deep-merged -
        // fetch the current list first so fields the caller didn't mention aren't silently wiped out.
        let current
        if (wantsDoubleOptInChange || signupFormChange) {
          current = await client.get(`/subscriber-lists/${id}`)
        }

        if (wantsDoubleOptInChange) {
          const emailId = await resolveIdOptional({
            id: args.doubleOptInTransactionalEmailId,
            name: args.doubleOptInTransactionalEmailName,
            resourcePath: '/transactional-emails',
            filterField: 'name',
            label: 'transactional email'
          })
          body.doubleOptIn = {
            ...current.doubleOptIn,
            active: args.doubleOptInActive !== undefined ? args.doubleOptInActive : current.doubleOptIn?.active,
            emailId: emailId || current.doubleOptIn?.emailId,
            redirectLink: args.doubleOptInRedirectLink !== undefined ? args.doubleOptInRedirectLink : current.doubleOptIn?.redirectLink,
            confirmationTitle: args.confirmationTitle !== undefined ? args.confirmationTitle : current.doubleOptIn?.confirmationTitle,
            confirmationMessage: args.confirmationMessage !== undefined ? args.confirmationMessage : current.doubleOptIn?.confirmationMessage
          }
        }

        if (signupFormChange) {
          body.signupForm = buildSignupFormBody(args, current.signupForm)
        }

        const result = await client.patch(`/subscriber-lists/${id}`, body)
        return textResult(`Updated subscriber list "${result.name}".`)
      }
    },
    {
      name: 'get_subscriber_list',
      config: {
        title: 'Get subscriber list',
        description: 'Looks up a subscriber list by name (with its current stats), or lists every subscriber list on the project if no name is given.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Omit both this and subscriberListId to list every subscriber list instead.')
        }
      },
      handler: async (args) => {
        if (!args.subscriberListId && !args.subscriberListName) {
          const list = await client.get('/subscriber-lists', { limit: 30 })
          if (list.count === 0) {
            return textResult('This project has no subscriber lists yet.')
          }
          const names = list.items.map(item => `${item.name}${item.private ? ' (private)' : ''}`).join(', ')
          return textResult(`${list.count} subscriber list(s): ${names}${list.count > list.items.length ? ' (more not shown)' : ''}.`)
        }

        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        const [detail, stats] = await Promise.all([
          client.get(`/subscriber-lists/${id}`),
          client.get(`/subscriber-lists/${id}/stats`)
        ])
        return textResult(formatSubscriberListDetail(detail, stats))
      }
    },
    {
      name: 'delete_subscriber_list',
      config: {
        title: 'Delete subscriber list',
        description: 'Deletes a subscriber list and its subscribers. Fails if a triggered email, campaign, or automation still depends on it.',
        inputSchema: {
          subscriberListId: z.string().optional(),
          subscriberListName: z.string().optional().describe('Looked up automatically.')
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.subscriberListId,
          name: args.subscriberListName,
          resourcePath: '/subscriber-lists',
          filterField: 'name',
          label: 'subscriber list'
        })
        await client.del(`/subscriber-lists/${id}`)
        return textResult('Deleted the subscriber list.')
      }
    }
  ]
}
