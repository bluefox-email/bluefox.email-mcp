import { ResolveError } from './errors.js'

export function normalizeScheduledFor (value) {
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new ResolveError(`scheduledFor "${value}" is not a valid date-time. Pass an absolute ISO 8601 value such as "2026-09-10T08:00:00-05:00" or "2026-09-10T13:00:00Z".`)
  }
  return date.toISOString()
}
