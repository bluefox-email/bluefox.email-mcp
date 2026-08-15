import { describe, expect, test, vi, beforeEach } from 'vitest'
import { createSignUpFormTools } from './signUpForms.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'
import fs from 'fs/promises'

vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn().mockResolvedValue(undefined) }
}))

beforeEach(() => {
  fs.writeFile.mockClear()
})

function setup () {
  const client = createFakeClient()
  const resolveHelpers = createResolveId(client)
  const tools = createSignUpFormTools({ client, ...resolveHelpers })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('create_signup_form', () => {
  test('creates a bare-minimum form', async () => {
    const { client, create_signup_form: createSignUpForm } = setup()
    client.post.mockResolvedValue({ _id: 'form123', name: 'Newsletter form' })

    const result = await createSignUpForm.handler({ name: 'Newsletter form' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/signup-forms', { name: 'Newsletter form' })
    expect(result.content[0].text).toContain('Created signup form:')
    expect(result.content[0].text).toContain('"Newsletter form" (id form123)')
  })

  test('creates a form targeting lists by id and by name, with turnstile and terms and conditions', async () => {
    const { client, create_signup_form: createSignUpForm } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'list456' }] })
    client.post.mockResolvedValue({ _id: 'form123', name: 'Newsletter form' })

    await createSignUpForm.handler({
      name: 'Newsletter form',
      subscriberListIds: ['list123'],
      subscriberListNames: ['VIP'],
      captchaType: 'turnstile',
      turnstileSiteKey: 'site-key',
      turnstileSecretKey: 'secret-key',
      termsAndConditionsShow: true,
      termsAndConditionsLabel: 'I agree'
    })

    expect(client.post).toHaveBeenCalledWith('/signup-forms', {
      name: 'Newsletter form',
      subscriberListIds: ['list123', 'list456'],
      captchaType: 'turnstile',
      turnstileSiteKey: 'site-key',
      turnstileSecretKey: 'secret-key',
      termsAndConditions: {
        show: true,
        label: 'I agree',
        linkLabel: undefined,
        link: undefined
      }
    })
  })

  test('creates a form with double opt-in, resolving the confirmation email by name', async () => {
    const { client, create_signup_form: createSignUpForm } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'email123' }] })
    client.post.mockResolvedValue({ _id: 'form123', name: 'Newsletter form' })

    await createSignUpForm.handler({
      name: 'Newsletter form',
      doubleOptInActive: true,
      doubleOptInTransactionalEmailName: 'Confirm subscription',
      doubleOptInRedirectLink: 'https://example.com/thanks'
    })

    expect(client.post).toHaveBeenCalledWith('/signup-forms', {
      name: 'Newsletter form',
      doubleOptIn: {
        active: true,
        emailId: 'email123',
        redirectLink: 'https://example.com/thanks',
        confirmationTitle: undefined,
        confirmationMessage: undefined
      }
    })
  })

  test('creates a form with per-field contact field visibility, required, placeholder, and order', async () => {
    const { client, create_signup_form: createSignUpForm } = setup()
    client.post.mockResolvedValue({ _id: 'form123', name: 'Newsletter form' })

    await createSignUpForm.handler({
      name: 'Newsletter form',
      contactFields: [
        { name: 'firstName', show: true, required: true, placeholder: 'First name', order: 0 },
        { name: 'company', show: false }
      ]
    })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/signup-forms', {
      name: 'Newsletter form',
      propertiesStyle: {
        firstName: { show: true, required: true, placeholder: 'First name', order: 0 },
        company: { show: false }
      }
    })
  })
})

describe('update_signup_form', () => {
  test('updates simple fields without touching doubleOptIn', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.patch.mockResolvedValue({ name: 'New name' })

    const result = await updateSignUpForm.handler({ signUpFormId: 'form123', newName: 'New name', btnLabel: 'Join' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', { name: 'New name', btnLabel: 'Join' })
    expect(result.content[0].text).toContain('Updated signup form:')
    expect(result.content[0].text).toContain('"New name"')
  })

  test('resolves the form by name and merges into the existing doubleOptIn object instead of replacing it wholesale', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/signup-forms') {
        return { items: [{ _id: 'form123' }] }
      }
      return {
        doubleOptIn: {
          active: true,
          emailId: 'oldEmail',
          redirectLink: 'https://example.com/old',
          confirmationTitle: 'Old title',
          confirmationMessage: 'Old message'
        }
      }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({ signUpFormName: 'Newsletter form', confirmationTitle: 'New title' })

    expect(client.get).toHaveBeenCalledWith('/signup-forms/form123')
    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      doubleOptIn: {
        active: true,
        emailId: 'oldEmail',
        redirectLink: 'https://example.com/old',
        confirmationTitle: 'New title',
        confirmationMessage: 'Old message'
      }
    })
  })

  test('falls back to the current confirmationTitle when only other doubleOptIn fields change', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockResolvedValue({ doubleOptIn: { active: true, confirmationTitle: 'Existing title' } })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({ signUpFormId: 'form123', confirmationMessage: 'New message' })

    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      doubleOptIn: {
        active: true,
        confirmationTitle: 'Existing title',
        emailId: undefined,
        redirectLink: undefined,
        confirmationMessage: 'New message'
      }
    })
  })

  test('clears doubleOptInRedirectLink when explicitly given an empty string, instead of keeping the old value', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockResolvedValue({
      doubleOptIn: {
        active: true,
        emailId: 'oldEmail',
        redirectLink: 'https://example.com/old',
        confirmationTitle: 'Old title',
        confirmationMessage: 'Old message'
      }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({
      signUpFormId: 'form123',
      doubleOptInRedirectLink: '',
      confirmationTitle: 'You\'re confirmed!',
      confirmationMessage: 'Thanks for confirming your subscription.'
    })

    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      doubleOptIn: {
        active: true,
        emailId: 'oldEmail',
        redirectLink: '',
        confirmationTitle: 'You\'re confirmed!',
        confirmationMessage: 'Thanks for confirming your subscription.'
      }
    })
  })

  test('overrides every doubleOptIn field when all are given, instead of falling back to current', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/signup-forms/form123') {
        return {
          doubleOptIn: {
            active: false,
            emailId: 'oldEmail',
            redirectLink: 'https://example.com/old',
            confirmationTitle: 'Old title',
            confirmationMessage: 'Old message'
          }
        }
      }
      return { items: [{ _id: 'newEmail' }] }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({
      signUpFormId: 'form123',
      doubleOptInActive: true,
      doubleOptInTransactionalEmailName: 'New confirmation email',
      doubleOptInRedirectLink: 'https://example.com/new',
      confirmationTitle: 'New title',
      confirmationMessage: 'New message'
    })

    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      doubleOptIn: {
        active: true,
        emailId: 'newEmail',
        redirectLink: 'https://example.com/new',
        confirmationTitle: 'New title',
        confirmationMessage: 'New message'
      }
    })
  })

  test('replaces the target lists, merging ids and resolved names', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'list456' }] })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({ signUpFormId: 'form123', subscriberListIds: ['list123'], subscriberListNames: ['VIP'] })

    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', { subscriberListIds: ['list123', 'list456'] })
  })

  test('merges per-field contact field settings into the existing propertiesStyle, preserving other fields and unmentioned sub-keys', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockResolvedValue({
      propertiesStyle: {
        firstName: { show: true, required: true, placeholder: 'First', order: 0 },
        company: { show: true, placeholder: 'Company' }
      }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({
      signUpFormId: 'form123',
      contactFields: [
        { name: 'firstName', placeholder: 'New first' },
        { name: 'lastName', show: true, order: 1 }
      ]
    })

    expect(client.get).toHaveBeenCalledWith('/signup-forms/form123')
    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      propertiesStyle: {
        firstName: { show: true, required: true, placeholder: 'New first', order: 0 },
        company: { show: true, placeholder: 'Company' },
        lastName: { show: true, order: 1 }
      }
    })
  })

  test('fetches the current form only once when both doubleOptIn and contact field changes are given together', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.get.mockResolvedValue({ doubleOptIn: { active: true, confirmationTitle: 'Existing title' }, propertiesStyle: {} })
    client.patch.mockResolvedValue({ name: 'Newsletter form' })

    await updateSignUpForm.handler({
      signUpFormId: 'form123',
      confirmationMessage: 'New message',
      contactFields: [{ name: 'firstName', show: true }]
    })

    expect(client.get).toHaveBeenCalledTimes(1)
    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', {
      doubleOptIn: {
        active: true,
        confirmationTitle: 'Existing title',
        emailId: undefined,
        redirectLink: undefined,
        confirmationMessage: 'New message'
      },
      propertiesStyle: { firstName: { show: true } }
    })
  })
})

describe('get_signup_form', () => {
  test('lists every signup form when none is specified', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{ _id: 'form123', name: 'Newsletter form', captchaType: 'turnstile', doubleOptIn: { active: true }, subscriberListIds: ['list123'] }]
    })

    const result = await getSignUpForm.handler({})

    expect(client.get).toHaveBeenCalledWith('/signup-forms', { limit: 30 })
    expect(result.content[0].text).toContain('1 signup form(s)')
    expect(result.content[0].text).toContain('"Newsletter form" (id form123) - captcha: turnstile, double opt-in: on, lists: 1.')
  })

  test('shows no captcha in the list view when showCaptcha is explicitly false', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{ _id: 'form123', name: 'Newsletter form', showCaptcha: false }]
    })

    const result = await getSignUpForm.handler({})
    expect(result.content[0].text).toContain('captcha: none')
  })

  test('notes when more forms exist than were shown', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ _id: 'form123', name: 'Newsletter form' }] })

    const result = await getSignUpForm.handler({})
    expect(result.content[0].text).toContain('(more not shown)')
  })

  test('reports when the project has no signup forms yet', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await getSignUpForm.handler({})
    expect(result.content[0].text).toBe('This project has no signup forms yet.')
  })

  test('returns full detail for a single form, including redirectLink and doubleOptIn.redirectLink', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({
      _id: 'form123',
      name: 'Newsletter form',
      formLayout: 'column',
      captchaType: 'svg',
      showCaptcha: true,
      emailPlaceholder: 'your@email.com',
      captchaPlaceholder: 'enter captcha text',
      btnLabel: 'Submit',
      btnFont: 'Roboto',
      btnFontSize: '16',
      btnFontColor: '#FFFFFF',
      btnColor: '#10B1EF',
      formFontStyle: 'Roboto',
      formFontSize: '16',
      formFontColor: '#000000',
      successMessage: 'Thank you!',
      successFont: 'Roboto',
      successFontSize: '16',
      successFontColor: '#000000',
      redirectLink: 'https://example.com/thanks',
      termsAndConditions: { show: true, label: 'I agree to the', linkLabel: 'Terms', link: 'https://example.com/terms' },
      doubleOptIn: { active: true, emailId: 'email123', redirectLink: 'https://example.com/confirmed', confirmationTitle: 'Confirmed!', confirmationMessage: 'You are in.' },
      propertiesStyle: { firstName: { show: true } },
      subscriberListIds: ['list123']
    })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    const text = result.content[0].text

    expect(text).toContain('"Newsletter form" (id form123)')
    expect(text).toContain('Target lists: 1')
    expect(text).toContain('Redirect after signup (redirectLink): https://example.com/thanks')
    expect(text).toContain('Terms and conditions: shown - "I agree to the Terms" -> https://example.com/terms')
    expect(text).toContain('Double opt-in: ON - confirmation email id email123. Redirect after confirming (doubleOptIn.redirectLink): https://example.com/confirmed.')
    expect(text).toContain('Custom contact field settings (propertiesStyle): {"firstName":{"show":true}}')
  })

  test('handles a minimal form with no redirectLink, terms, or double opt-in configured', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ _id: 'form123', name: 'Newsletter form', showCaptcha: false })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    const text = result.content[0].text

    expect(text).toContain('Captcha: none')
    expect(text).toContain('Redirect after signup (redirectLink): (none - shows the success message instead)')
    expect(text).toContain('Double opt-in: OFF.')
    expect(text).toContain('Custom contact field settings (propertiesStyle): none configured')
  })

  test('falls back to placeholders when double opt-in is on but has no emailId or redirectLink set yet', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ _id: 'form123', name: 'Newsletter form', doubleOptIn: { active: true } })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    const text = result.content[0].text

    expect(text).toContain('confirmation email id (none set)')
    expect(text).toContain('Redirect after confirming (doubleOptIn.redirectLink): (none - shows the confirmation message instead)')
  })

  test('includes turnstile config details when captchaType is turnstile', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ _id: 'form123', name: 'Newsletter form', captchaType: 'turnstile', turnstileTheme: 'dark', turnstileSize: 'compact', turnstileAppearance: 'always' })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    expect(result.content[0].text).toContain('Captcha: turnstile (theme dark, size compact, appearance always)')
  })
})

describe('delete_signup_form', () => {
  test('resolves by name and deletes', async () => {
    const { client, delete_signup_form: deleteSignUpForm } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'form123' }] })

    const result = await deleteSignUpForm.handler({ signUpFormName: 'Newsletter form' })

    expect(client.del).toHaveBeenCalledWith('/signup-forms/form123')
    expect(result.content[0].text).toBe('Deleted the signup form.')
  })
})

describe('get_signup_form_embed_html', () => {
  test('resolves the form by name, writes the embed HTML to a local file, and reports the path', async () => {
    const { client, get_signup_form_embed_html: getEmbedHtml } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'form123' }] })
    client.getText.mockResolvedValue('<style>...</style><form id="signupForm"></form>')

    const result = await getEmbedHtml.handler({ signUpFormName: 'Newsletter form' })

    expect(client.get).toHaveBeenCalledWith('/signup-forms', { filter: { name: 'Newsletter form' }, limit: 2 })
    expect(client.getText).toHaveBeenCalledWith('/signup-forms/form123/embed')
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('bluefox-signup-form-form123-embed.html'),
      '<style>...</style><form id="signupForm"></form>',
      'utf8'
    )
    expect(result.content[0].text).toContain('Saved the embeddable form HTML to')
  })

  test('uses the id directly when given, without resolving by name', async () => {
    const { client, get_signup_form_embed_html: getEmbedHtml } = setup()
    client.getText.mockResolvedValue('<form id="signupForm"></form>')

    await getEmbedHtml.handler({ signUpFormId: 'form123' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.getText).toHaveBeenCalledWith('/signup-forms/form123/embed')
  })
})
