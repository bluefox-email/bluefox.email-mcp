// Fields the public API always returns on a contact besides its custom fields - GET /contacts and
// GET /contacts/{email} flatten customFields onto the top level of the response (see bluefox.email-api's
// ContactModel.flatten()), so there's no nested object to read custom values from; anything not in this
// list is a custom field.
const CONTACT_BUILTIN_FIELDS = new Set([
  '_id', 'accountId', 'projectId', 'email', 'name', 'tags', '_lists', 'customFields',
  'lastOpenDate', 'lastClickDate', 'lastReceiveDate', 'createdAt', 'updatedAt', '__v'
])

export function extractCustomFields (contact) {
  return Object.fromEntries(Object.entries(contact).filter(([key]) => !CONTACT_BUILTIN_FIELDS.has(key)))
}
