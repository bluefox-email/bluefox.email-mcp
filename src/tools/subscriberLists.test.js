import { describe, expect, test } from 'vitest'
import { createSubscriberListTools } from './subscriberLists.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const tools = createSubscriberListTools({ client, resolveIdOrRequired, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('create_subscriber_list', () => {
  test('creates a list without double opt-in', async () => {
    const { client, create_subscriber_list: createSubscriberList } = setup()
    client.post.mockResolvedValue({ _id: 'list123', name: 'Newsletter' })

    const result = await createSubscriberList.handler({ name: 'Newsletter', description: 'Weekly updates' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/subscriber-lists', { name: 'Newsletter', description: 'Weekly updates' })
    expect(result.content[0].text).toBe('Created subscriber list "Newsletter" (id list123).')
  })

  test('creates a private list with double opt-in, resolving the confirmation email by name', async () => {
    const { client, create_subscriber_list: createSubscriberList } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'email123' }] })
    client.post.mockResolvedValue({ _id: 'list123', name: 'Newsletter' })

    await createSubscriberList.handler({
      name: 'Newsletter',
      description: 'Weekly updates',
      private: true,
      doubleOptInActive: true,
      doubleOptInTransactionalEmailName: 'Confirm subscription',
      doubleOptInRedirectLink: 'https://example.com/thanks',
      confirmationTitle: 'Confirm',
      confirmationMessage: 'Please confirm'
    })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists', {
      name: 'Newsletter',
      description: 'Weekly updates',
      private: true,
      doubleOptIn: {
        active: true,
        emailId: 'email123',
        redirectLink: 'https://example.com/thanks',
        confirmationTitle: 'Confirm',
        confirmationMessage: 'Please confirm'
      }
    })
  })

  test('creates a list with join-form styling and per-field contact field settings', async () => {
    const { client, create_subscriber_list: createSubscriberList } = setup()
    client.post.mockResolvedValue({ _id: 'list123', name: 'Newsletter' })

    await createSubscriberList.handler({
      name: 'Newsletter',
      description: 'Weekly updates',
      formLayout: 'column',
      showCaptcha: false,
      btnLabel: 'Join',
      btnColor: '#000',
      contactFields: [{ name: 'firstName', show: true, required: true, placeholder: 'First name', order: 0 }]
    })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists', {
      name: 'Newsletter',
      description: 'Weekly updates',
      signupForm: {
        formLayout: 'column',
        showCaptcha: false,
        btnLabel: 'Join',
        btnColor: '#000',
        propertiesStyle: { firstName: { show: true, required: true, placeholder: 'First name', order: 0 } }
      }
    })
  })

  test('creates a list with only per-field contact field settings, no other join-form styling', async () => {
    const { client, create_subscriber_list: createSubscriberList } = setup()
    client.post.mockResolvedValue({ _id: 'list123', name: 'Newsletter' })

    await createSubscriberList.handler({
      name: 'Newsletter',
      description: 'Weekly updates',
      contactFields: [{ name: 'firstName' }]
    })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists', {
      name: 'Newsletter',
      description: 'Weekly updates',
      signupForm: { propertiesStyle: { firstName: {} } }
    })
  })
})

describe('update_subscriber_list', () => {
  test('updates simple fields without touching doubleOptIn', async () => {
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.patch.mockResolvedValue({ name: 'New name' })

    const result = await updateSubscriberList.handler({
      subscriberListId: 'list123',
      newName: 'New name',
      description: 'New description',
      private: true
    })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
      name: 'New name',
      description: 'New description',
      private: true
    })
    expect(result.content[0].text).toBe('Updated subscriber list "New name".')
  })

  test('merges join-form style changes into the existing signupForm object instead of replacing it wholesale', async () => {
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.get.mockResolvedValue({
      signupForm: { formLayout: 'column', btnLabel: 'Subscribe', btnColor: '#123456', propertiesStyle: { company: { show: true } } }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter' })

    await updateSubscriberList.handler({
      subscriberListId: 'list123',
      btnLabel: 'Join now',
      contactFields: [{ name: 'firstName', show: true }]
    })

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists/list123')
    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
      signupForm: {
        formLayout: 'column',
        btnLabel: 'Join now',
        btnColor: '#123456',
        propertiesStyle: { company: { show: true }, firstName: { show: true } }
      }
    })
  })

  test('merges into the existing doubleOptIn object instead of replacing it wholesale', async () => {
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
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
    client.patch.mockResolvedValue({ name: 'Newsletter' })

    await updateSubscriberList.handler({ subscriberListName: 'Newsletter', confirmationTitle: 'New title' })

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists/list123')
    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
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
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
      }
      return { doubleOptIn: { active: true, confirmationTitle: 'Existing title' } }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter' })

    await updateSubscriberList.handler({ subscriberListName: 'Newsletter', confirmationMessage: 'New message' })

    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
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
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
      }
      if (path === '/subscriber-lists/list123') {
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
    client.patch.mockResolvedValue({ name: 'Newsletter' })

    await updateSubscriberList.handler({
      subscriberListId: 'list123',
      doubleOptInActive: true,
      doubleOptInTransactionalEmailName: 'New confirmation email',
      doubleOptInRedirectLink: 'https://example.com/new',
      confirmationTitle: 'New title',
      confirmationMessage: 'New message'
    })

    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
      doubleOptIn: {
        active: true,
        emailId: 'newEmail',
        redirectLink: 'https://example.com/new',
        confirmationTitle: 'New title',
        confirmationMessage: 'New message'
      }
    })
  })

  test('turns on double opt-in for the first time, when the list has no existing doubleOptIn object', async () => {
    const { client, update_subscriber_list: updateSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists/list123') {
        return { name: 'Newsletter' }
      }
      return { items: [{ _id: 'email123' }] }
    })
    client.patch.mockResolvedValue({ name: 'Newsletter' })

    await updateSubscriberList.handler({
      subscriberListId: 'list123',
      doubleOptInActive: true,
      doubleOptInTransactionalEmailName: 'Confirm subscription'
    })

    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123', {
      doubleOptIn: {
        active: true,
        emailId: 'email123',
        redirectLink: undefined,
        confirmationTitle: undefined,
        confirmationMessage: undefined
      }
    })
  })
})

describe('get_subscriber_list', () => {
  test('lists every subscriber list when none is specified, flagging private ones', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockResolvedValue({ count: 2, items: [{ name: 'Newsletter' }, { name: 'VIP', private: true }] })

    const result = await getSubscriberList.handler({})

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists', { limit: 30 })
    expect(result.content[0].text).toBe('2 subscriber list(s): Newsletter, VIP (private).')
  })

  test('reports when the project has no subscriber lists yet', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await getSubscriberList.handler({})
    expect(result.content[0].text).toBe('This project has no subscriber lists yet.')
  })

  test('notes when more lists exist than were shown', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ name: 'Newsletter' }] })

    const result = await getSubscriberList.handler({})
    expect(result.content[0].text).toBe('5 subscriber list(s): Newsletter (more not shown).')
  })

  test('returns detail and stats for a single list found by id, including privacy and full double opt-in/signup form detail', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists/list123') {
        return {
          name: 'Newsletter',
          description: 'Weekly updates',
          private: true,
          doubleOptIn: { active: true, emailId: 'email123', redirectLink: 'https://example.com/confirmed', confirmationTitle: 'Confirmed!', confirmationMessage: 'You are in.' },
          signupForm: { formLayout: 'column', showCaptcha: false, btnLabel: 'Join', btnFontColor: '#fff', btnColor: '#000', successMessage: 'Thanks!', propertiesStyle: { firstName: { show: true } } }
        }
      }
      return { active: 10, paused: 1, unsubscribed: 2, unverified: 3 }
    })

    const result = await getSubscriberList.handler({ subscriberListId: 'list123' })
    const text = result.content[0].text

    expect(text).toContain('"Newsletter" - Weekly updates. Private.')
    expect(text).toContain('Double opt-in: ON - confirmation email id email123. Redirect after confirming: https://example.com/confirmed. Confirmation title: "Confirmed!". Confirmation message: "You are in.".')
    expect(text).toContain('Join form: layout column, captcha off, button "Join" (#fff on #000), success message: "Thanks!".')
    expect(text).toContain('Custom contact field settings (propertiesStyle): {"firstName":{"show":true}}')
    expect(text).toContain('Stats: 10 active, 1 paused, 2 unsubscribed, 3 unverified.')
  })

  test('falls back to placeholders when double opt-in is on but has no emailId or redirectLink set yet', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists/list123') {
        return { name: 'Newsletter', description: 'Weekly updates', doubleOptIn: { active: true } }
      }
      return { active: 0, paused: 0, unsubscribed: 0, unverified: 0 }
    })

    const result = await getSubscriberList.handler({ subscriberListId: 'list123' })
    const text = result.content[0].text

    expect(text).toContain('confirmation email id (none set)')
    expect(text).toContain('Redirect after confirming: (none).')
  })

  test('reports public, double opt-in off, and no custom field settings by default', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists/list123') {
        return { name: 'Newsletter', description: 'Weekly updates' }
      }
      return { active: 0, paused: 0, unsubscribed: 0, unverified: 0 }
    })

    const result = await getSubscriberList.handler({ subscriberListId: 'list123' })
    const text = result.content[0].text

    expect(text).toContain('Public.')
    expect(text).toContain('Double opt-in: OFF.')
    expect(text).toContain('Custom contact field settings (propertiesStyle): none configured')
  })

  test('falls back to "no description" when the list has none', async () => {
    const { client, get_subscriber_list: getSubscriberList } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists/list123') {
        return { name: 'Newsletter' }
      }
      return { active: 0, paused: 0, unsubscribed: 0, unverified: 0 }
    })

    const result = await getSubscriberList.handler({ subscriberListId: 'list123' })
    expect(result.content[0].text).toContain('no description')
  })
})

describe('delete_subscriber_list', () => {
  test('resolves by name and deletes', async () => {
    const { client, delete_subscriber_list: deleteSubscriberList } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'list123' }] })

    const result = await deleteSubscriberList.handler({ subscriberListName: 'Newsletter' })

    expect(client.del).toHaveBeenCalledWith('/subscriber-lists/list123')
    expect(result.content[0].text).toBe('Deleted the subscriber list.')
  })
})
