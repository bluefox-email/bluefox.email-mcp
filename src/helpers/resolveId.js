import { ResolveError } from './errors.js'

// Users refer to campaigns/lists/segments/sender identities/etc. by name, but the REST API takes ids. This looks
// the name up via the resource's own list endpoint (exact-match filter, the only kind the API supports) and
// resolves it to an id - or throws a clear, already-relayable error if it's missing or ambiguous.
export function createResolveId (client) {
  async function resolveId ({ resourcePath, name, filterField, label }) {
    const result = await client.get(resourcePath, { filter: { [filterField]: name }, limit: 2 })
    const items = result?.items || []
    if (items.length === 0) {
      throw new ResolveError(`No ${label} named "${name}" found. Double-check the name, or pass its id directly if you already have it.`)
    }
    if (items.length > 1) {
      throw new ResolveError(`Multiple ${label}s are named "${name}" - please specify which one by id instead.`)
    }
    return items[0]._id
  }

  // For a tool param pair like (subscriberListId, subscriberListName) where one is required: prefers the id if
  // given (no lookup needed), otherwise resolves the name, otherwise fails clearly instead of silently listing
  // everything (an unfiltered lookup) or resolving against "undefined".
  async function resolveIdOrRequired ({ id, name, resourcePath, filterField, label }) {
    if (id) {
      return id
    }
    if (name) {
      return resolveId({ resourcePath, name, filterField, label })
    }
    throw new ResolveError(`Either a ${label} id or name is required.`)
  }

  // Same, but for an optional reference (e.g. segmentId/segmentName narrowing a campaign further) - returns
  // undefined instead of throwing when neither is given.
  async function resolveIdOptional ({ id, name, resourcePath, filterField, label }) {
    if (id) {
      return id
    }
    if (name) {
      return resolveId({ resourcePath, name, filterField, label })
    }
    return undefined
  }

  return { resolveId, resolveIdOrRequired, resolveIdOptional }
}
