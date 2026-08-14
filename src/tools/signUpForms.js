import fs from 'fs/promises'
import os from 'os'
import path from 'path'
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
  redirectLink: z.string().optional().describe('The general post-signup redirect - where a visitor lands immediately after submitting the form (used when double opt-in is off, or is on but hasn\'t been confirmed yet). This is a DIFFERENT field from doubleOptInRedirectLink below - that one only fires later, after the contact clicks the confirmation link in their email. If the user just says "redirect people after they sign up" without mentioning confirmation/verification, they mean this field, not doubleOptInRedirectLink.'),
  termsAndConditionsShow: z.boolean().optional(),
  termsAndConditionsLabel: z.string().optional(),
  termsAndConditionsLinkLabel: z.string().optional(),
  termsAndConditionsLink: z.string().optional()
}

const contactFieldsSchema = {
  contactFields: z.array(z.object({
    name: z.string().describe('The custom contact field\'s name - use manage_contact_fields_and_tags (action: list) to see what exists on the project.'),
    show: z.boolean().optional().describe('Whether this field appears on the form. Defaults to false (hidden) the first time a field is configured.'),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    order: z.number().optional().describe('Display position relative to other visible fields - lower shows first.')
  })).optional().describe('Per-field show/hide, required, placeholder, and order for the project\'s custom contact fields on this form. The built-in email field is controlled separately via emailPlaceholder (always shown and required). Only the fields listed here are changed - any other field\'s existing settings are left as-is.')
}

const doubleOptInSchema = {
  doubleOptInActive: z.boolean().optional().describe('The referenced transactional email\'s body MUST contain {{verifyLink}} - the API rejects enabling this otherwise, since that\'s the only way a contact can confirm.'),
  doubleOptInTransactionalEmailId: z.string().optional().describe('Its body must include {{verifyLink}}.'),
  doubleOptInTransactionalEmailName: z.string().optional().describe('The transactional email that sends the confirmation message, by name - looked up automatically. Required (id or name) if doubleOptInActive is true. Its body must include {{verifyLink}}.'),
  doubleOptInRedirectLink: z.string().optional().describe('Where to send the contact after they click the confirmation link in their email and their subscription becomes verified. Only relevant when double opt-in is active. This is a DIFFERENT field from the top-level redirectLink above - that one is the general post-signup redirect, used before/without confirmation. Setting this alone does NOT change where visitors land right after submitting the form.'),
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

function mergePropertiesStyle (contactFields, current = {}) {
  const propertiesStyle = { ...current }
  for (const field of contactFields) {
    propertiesStyle[field.name] = {
      ...current[field.name],
      ...(field.show !== undefined && { show: field.show }),
      ...(field.required !== undefined && { required: field.required }),
      ...(field.placeholder !== undefined && { placeholder: field.placeholder }),
      ...(field.order !== undefined && { order: field.order })
    }
  }
  return propertiesStyle
}

function formatForm (item) {
  const parts = [`captcha: ${item.captchaType || (item.showCaptcha === false ? 'none' : 'svg')}`]
  parts.push(`double opt-in: ${item.doubleOptIn?.active ? 'on' : 'off'}`)
  parts.push(`lists: ${item.subscriberListIds?.length || 0}`)
  return `"${item.name}" (id ${item._id}) - ${parts.join(', ')}.`
}

function formatFormDetail (item) {
  const lines = [
    `"${item.name}" (id ${item._id})`,
    `Target lists: ${item.subscriberListIds?.length || 0}`,
    `Layout: ${item.formLayout}. Captcha: ${item.captchaType || (item.showCaptcha === false ? 'none' : 'svg')}${item.captchaType === 'turnstile' ? ` (theme ${item.turnstileTheme}, size ${item.turnstileSize}, appearance ${item.turnstileAppearance})` : ''}.`,
    `Email placeholder: "${item.emailPlaceholder}". Captcha placeholder: "${item.captchaPlaceholder}".`,
    `Button: label "${item.btnLabel}", font ${item.btnFont} ${item.btnFontSize}px, text color ${item.btnFontColor}, background ${item.btnColor}.`,
    `Form text: font ${item.formFontStyle} ${item.formFontSize}px, color ${item.formFontColor}.`,
    `Success message: "${item.successMessage}" (font ${item.successFont} ${item.successFontSize}px, color ${item.successFontColor}).`,
    `Redirect after signup (redirectLink): ${item.redirectLink || '(none - shows the success message instead)'}`,
    `Terms and conditions: ${item.termsAndConditions?.show ? `shown - "${item.termsAndConditions.label} ${item.termsAndConditions.linkLabel}" -> ${item.termsAndConditions.link}` : 'hidden'}.`,
    `Double opt-in: ${item.doubleOptIn?.active
      ? `ON - confirmation email id ${item.doubleOptIn.emailId || '(none set)'}. Redirect after confirming (doubleOptIn.redirectLink): ${item.doubleOptIn.redirectLink || '(none - shows the confirmation message instead)'}. Confirmation title: "${item.doubleOptIn.confirmationTitle}". Confirmation message: "${item.doubleOptIn.confirmationMessage}".`
      : 'OFF.'}`,
    `Custom contact field settings (propertiesStyle): ${item.propertiesStyle && Object.keys(item.propertiesStyle).length ? JSON.stringify(item.propertiesStyle) : 'none configured'}`
  ]
  return lines.join('\n')
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
        description: 'Creates a signup form - with an optional captcha (built-in svg or Cloudflare Turnstile), double opt-in, and per-field visibility/required/order for the project\'s custom contact fields (contactFields) - that subscribes contacts to one or more subscriber lists.',
        inputSchema: {
          name: z.string(),
          subscriberListIds: z.array(z.string()).optional(),
          subscriberListNames: z.array(z.string()).optional().describe('Lists to subscribe to, by name - looked up automatically. Merged with subscriberListIds if both are given.'),
          ...doubleOptInSchema,
          ...contactFieldsSchema,
          ...styleSchema
        }
      },
      handler: async (args) => {
        const body = { name: args.name, ...buildStyleBody(args) }

        const subscriberListIds = await resolveSubscriberListIds(args)
        if (subscriberListIds.length) {
          body.subscriberListIds = subscriberListIds
        }

        if (args.contactFields?.length) {
          body.propertiesStyle = mergePropertiesStyle(args.contactFields)
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
        return textResult(`Created signup form:\n${formatFormDetail(result)}`)
      }
    },
    {
      name: 'update_signup_form',
      config: {
        title: 'Update a signup form',
        description: 'Updates an existing signup form\'s name, target lists, captcha/Turnstile settings, styling, double opt-in configuration, or per-field contact field settings (contactFields).',
        inputSchema: {
          signUpFormId: z.string().optional(),
          signUpFormName: z.string().optional().describe('The form to update, by name - looked up automatically. Provide this if you do not already have the id.'),
          newName: z.string().optional(),
          subscriberListIds: z.array(z.string()).optional(),
          subscriberListNames: z.array(z.string()).optional().describe('Replaces the form\'s target lists (merged with subscriberListIds if both given) - looked up automatically.'),
          ...doubleOptInSchema,
          ...contactFieldsSchema,
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
        const wantsContactFieldsChange = args.contactFields?.length > 0

        // doubleOptIn and propertiesStyle are nested objects the API replaces wholesale when given, not
        // deep-merged - fetch the current form first so fields the caller didn't mention aren't wiped out.
        let current
        if (wantsDoubleOptInChange || wantsContactFieldsChange) {
          current = await client.get(`/signup-forms/${id}`)
        }

        if (wantsDoubleOptInChange) {
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

        if (wantsContactFieldsChange) {
          body.propertiesStyle = mergePropertiesStyle(args.contactFields, current.propertiesStyle)
        }

        const result = await client.patch(`/signup-forms/${id}`, body)
        return textResult(`Updated signup form:\n${formatFormDetail(result)}`)
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
        return textResult(formatFormDetail(result))
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
    },
    {
      name: 'get_signup_form_embed_html',
      config: {
        title: 'Get a signup form\'s embeddable HTML',
        description: 'Generates the same self-contained HTML (styling, markup, and captcha/submit JS included) shown on the dashboard\'s "embed" tab for this signup form, and saves it to a local file - hand that file\'s contents to whoever is pasting the form into an external site or page builder.',
        inputSchema: {
          signUpFormId: z.string().optional(),
          signUpFormName: z.string().optional().describe('The form to get, by name - looked up automatically. Provide this if you do not already have the id.')
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
        const html = await client.getText(`/signup-forms/${id}/embed`)
        const filePath = path.join(os.tmpdir(), `bluefox-signup-form-${id}-embed.html`)
        await fs.writeFile(filePath, html, 'utf8')
        return textResult(`Saved the embeddable form HTML to ${filePath}.`)
      }
    }
  ]
}
