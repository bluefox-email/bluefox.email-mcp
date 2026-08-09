import { z } from 'zod'
import { textResult } from '../helpers/errors.js'

const directStyleFields = [
  'formLayout', 'showCaptcha', 'captchaType', 'turnstileSiteKey', 'turnstileSecretKey', 'turnstileTheme',
  'turnstileSize', 'turnstileAppearance', 'emailPlaceholder', 'captchaPlaceholder', 'formFontStyle',
  'formFontColor', 'formFontSize', 'btnLabel', 'btnFont', 'btnFontColor', 'btnColor', 'btnFontSize',
  'successMessage', 'successFont', 'successFontColor', 'successFontSize', 'redirectLink'
]

const styleSchema = {
  formLayout: z.string().optional(),
  showCaptcha: z.boolean().optional().describe('Defaults to true. Overridden by captchaType when given.'),
  captchaType: z.enum(['none', 'svg', 'turnstile']).optional().describe('svg is a built-in image captcha; turnstile requires turnstileSiteKey and turnstileSecretKey.'),
  turnstileSiteKey: z.string().optional(),
  turnstileSecretKey: z.string().optional(),
  turnstileTheme: z.enum(['light', 'dark', 'auto']).optional(),
  turnstileSize: z.enum(['normal', 'compact', 'flexible']).optional(),
  turnstileAppearance: z.enum(['always', 'execute', 'interaction-only']).optional(),
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
  redirectLink: z.string().optional().describe('Where to send visitors after a successful signup (when double opt-in doesn\'t apply).'),
  termsAndConditionsShow: z.boolean().optional(),
  termsAndConditionsLabel: z.string().optional(),
  termsAndConditionsLinkLabel: z.string().optional(),
  termsAndConditionsLink: z.string().optional()
}

const doubleOptInSchema = {
  doubleOptInActive: z.boolean().optional(),
  doubleOptInTransactionalEmailId: z.string().optional(),
  doubleOptInTransactionalEmailName: z.string().optional().describe('The transactional email that sends the confirmation message, by name - looked up automatically. Required (id or name) if doubleOptInActive is true.'),
  doubleOptInRedirectLink: z.string().optional().describe('Where to send the contact after they confirm.'),
  confirmationTitle: z.string().optional(),
  confirmationMessage: z.string().optional()
}

function buildStyleBody (args) {
  const body = {}
  for (const field of directStyleFields) {
    if (args[field] !== undefined) {
      body[field] = args[field]
    }
  }
  const wantsTerms = args.termsAndConditionsShow !== undefined || args.termsAndConditionsLabel || args.termsAndConditionsLinkLabel || args.termsAndConditionsLink
  if (wantsTerms) {
    body.termsAndConditions = {
      show: args.termsAndConditionsShow,
      label: args.termsAndConditionsLabel,
      linkLabel: args.termsAndConditionsLinkLabel,
      link: args.termsAndConditionsLink
    }
  }
  return body
}

function formatForm (item) {
  const parts = [`captcha: ${item.captchaType || (item.showCaptcha === false ? 'none' : 'svg')}`]
  parts.push(`double opt-in: ${item.doubleOptIn?.active ? 'on' : 'off'}`)
  parts.push(`lists: ${item.subscriberListIds?.length || 0}`)
  return `"${item.name}" (id ${item._id}) - ${parts.join(', ')}.`
}

export function createSignUpFormTools ({ client, resolveId, resolveIdOptional, resolveIdOrRequired }) {
  async function resolveSubscriberListIds ({ subscriberListIds, subscriberListNames }) {
    const fromNames = await Promise.all((subscriberListNames || []).map(name => resolveId({
      resourcePath: '/subscriber-lists', name, filterField: 'name', label: 'subscriber list'
    })))
    return [...(subscriberListIds || []), ...fromNames]
  }

  async function resolveDoubleOptInEmailId (args) {
    return resolveIdOptional({
      id: args.doubleOptInTransactionalEmailId,
      name: args.doubleOptInTransactionalEmailName,
      resourcePath: '/transactional-emails',
      filterField: 'name',
      label: 'transactional email'
    })
  }

  return [
    {
      name: 'create_signup_form',
      config: {
        title: 'Create a signup form',
        description: 'Creates a signup form - with an optional captcha (built-in svg or Cloudflare Turnstile) and double opt-in - that subscribes contacts to one or more subscriber lists.',
        inputSchema: {
          name: z.string(),
          subscriberListIds: z.array(z.string()).optional(),
          subscriberListNames: z.array(z.string()).optional().describe('Lists to subscribe to, by name - looked up automatically. Merged with subscriberListIds if both are given.'),
          ...doubleOptInSchema,
          ...styleSchema
        }
      },
      handler: async (args) => {
        const body = { name: args.name, ...buildStyleBody(args) }

        const subscriberListIds = await resolveSubscriberListIds(args)
        if (subscriberListIds.length) {
          body.subscriberListIds = subscriberListIds
        }

        if (args.doubleOptInActive || args.doubleOptInTransactionalEmailId || args.doubleOptInTransactionalEmailName) {
          const emailId = await resolveDoubleOptInEmailId(args)
          body.doubleOptIn = {
            active: args.doubleOptInActive,
            emailId,
            redirectLink: args.doubleOptInRedirectLink,
            confirmationTitle: args.confirmationTitle,
            confirmationMessage: args.confirmationMessage
          }
        }

        const result = await client.post('/signup-forms', body)
        return textResult(`Created signup form "${result.name}" (id ${result._id}).`)
      }
    },
    {
      name: 'update_signup_form',
      config: {
        title: 'Update a signup form',
        description: 'Updates an existing signup form\'s name, target lists, captcha/Turnstile settings, styling, or double opt-in configuration.',
        inputSchema: {
          signUpFormId: z.string().optional(),
          signUpFormName: z.string().optional().describe('The form to update, by name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional(),
          subscriberListIds: z.array(z.string()).optional(),
          subscriberListNames: z.array(z.string()).optional().describe('Replaces the form\'s target lists (merged with subscriberListIds if both given) - looked up automatically.'),
          ...doubleOptInSchema,
          ...styleSchema
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.signUpFormId,
          name: args.signUpFormName,
          resourcePath: '/signup-forms',
          filterField: 'name',
          label: 'signup form'
        })

        const body = buildStyleBody(args)
        if (args.newName) {
          body.name = args.newName
        }

        const subscriberListIds = await resolveSubscriberListIds(args)
        if (subscriberListIds.length) {
          body.subscriberListIds = subscriberListIds
        }

        const wantsDoubleOptInChange = args.doubleOptInActive !== undefined ||
          args.doubleOptInTransactionalEmailId ||
          args.doubleOptInTransactionalEmailName ||
          args.doubleOptInRedirectLink ||
          args.confirmationTitle ||
          args.confirmationMessage
        if (wantsDoubleOptInChange) {
          // doubleOptIn is a nested object the API replaces wholesale when given, not deep-merged - fetch the
          // current one first so fields the caller didn't mention aren't silently wiped out.
          const current = await client.get(`/signup-forms/${id}`)
          const emailId = await resolveDoubleOptInEmailId(args)
          body.doubleOptIn = {
            ...current.doubleOptIn,
            active: args.doubleOptInActive !== undefined ? args.doubleOptInActive : current.doubleOptIn?.active,
            emailId: emailId || current.doubleOptIn?.emailId,
            redirectLink: args.doubleOptInRedirectLink || current.doubleOptIn?.redirectLink,
            confirmationTitle: args.confirmationTitle || current.doubleOptIn?.confirmationTitle,
            confirmationMessage: args.confirmationMessage || current.doubleOptIn?.confirmationMessage
          }
        }

        const result = await client.patch(`/signup-forms/${id}`, body)
        return textResult(`Updated signup form "${result.name}".`)
      }
    },
    {
      name: 'get_signup_form',
      config: {
        title: 'Get a signup form',
        description: 'Looks up a signup form by name (with its captcha, double opt-in, and target list summary), or lists every signup form on the project if no name is given.',
        inputSchema: {
          signUpFormId: z.string().optional(),
          signUpFormName: z.string().optional().describe('Omit both this and signUpFormId to list every signup form instead.')
        }
      },
      handler: async (args) => {
        if (!args.signUpFormId && !args.signUpFormName) {
          const list = await client.get('/signup-forms', { limit: 30 })
          if (list.count === 0) {
            return textResult('This project has no signup forms yet.')
          }
          const summary = list.items.map(formatForm).join(' ')
          return textResult(`${list.count} signup form(s): ${summary}${list.count > list.items.length ? ' (more not shown)' : ''}`)
        }

        const id = await resolveIdOrRequired({
          id: args.signUpFormId,
          name: args.signUpFormName,
          resourcePath: '/signup-forms',
          filterField: 'name',
          label: 'signup form'
        })
        const result = await client.get(`/signup-forms/${id}`)
        return textResult(formatForm(result))
      }
    },
    {
      name: 'delete_signup_form',
      config: {
        title: 'Delete a signup form',
        description: 'Deletes a signup form. Contacts already subscribed through it keep their subscriptions.',
        inputSchema: {
          signUpFormId: z.string().optional(),
          signUpFormName: z.string().optional().describe('Looked up automatically.')
        }
      },
      handler: async (args) => {
        const id = await resolveIdOrRequired({
          id: args.signUpFormId,
          name: args.signUpFormName,
          resourcePath: '/signup-forms',
          filterField: 'name',
          label: 'signup form'
        })
        await client.del(`/signup-forms/${id}`)
        return textResult('Deleted the signup form.')
      }
    }
  ]
}
