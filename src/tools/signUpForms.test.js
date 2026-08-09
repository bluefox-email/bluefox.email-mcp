import { describe, expect, test } from 'vitest'
import { createSignUpFormTools } from './signUpForms.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

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
    expect(result.content[0].text).toBe('Created signup form "Newsletter form" (id form123).')
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
})

describe('update_signup_form', () => {
  test('updates simple fields without touching doubleOptIn', async () => {
    const { client, update_signup_form: updateSignUpForm } = setup()
    client.patch.mockResolvedValue({ name: 'New name' })

    const result = await updateSignUpForm.handler({ signUpFormId: 'form123', newName: 'New name', btnLabel: 'Join' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('/signup-forms/form123', { name: 'New name', btnLabel: 'Join' })
    expect(result.content[0].text).toBe('Updated signup form "New name".')
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

  test('returns detail for a single form found by id, defaulting to svg captcha and off double opt-in', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ _id: 'form123', name: 'Newsletter form' })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    expect(result.content[0].text).toBe('"Newsletter form" (id form123) - captcha: svg, double opt-in: off, lists: 0.')
  })

  test('reports no captcha when showCaptcha is explicitly false', async () => {
    const { client, get_signup_form: getSignUpForm } = setup()
    client.get.mockResolvedValue({ _id: 'form123', name: 'Newsletter form', showCaptcha: false })

    const result = await getSignUpForm.handler({ signUpFormId: 'form123' })
    expect(result.content[0].text).toContain('captcha: none')
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
