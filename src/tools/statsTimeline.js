import { z } from 'zod'

const PERCENTAGE_METRICS = ['clicksPerUniqueOpens', 'uniqueClicksPerUniqueOpens', 'unsubscribePerUniqueOpens']

// Same intervals, metrics and range limits as the stats chart in the app.
export const timelineInputSchema = {
  interval: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional().describe('Break the stats down per hour/day/week/month instead of totals (same as the app\'s stats chart). Requires metric. Max range: hourly 7 days, daily 60 days, weekly/monthly 12 months. Defaults to the last 7 days (hourly) or last month (others) when from/to are omitted.'),
  metric: z.enum([
    'sent', 'failed', 'opens', 'uniqueOpens', 'clicks', 'uniqueClicks',
    'clicksPerUniqueOpens', 'uniqueClicksPerUniqueOpens', 'unsubscribePerUniqueOpens', 'bounces', 'complaints',
    'subscribe', 'unsubscribe', 'resubscribe', 'pause-subscription', 'unpause-subscription'
  ]).optional().describe('With interval: what to count per period. Count metrics also show their rate against total sends; the *PerUniqueOpens metrics are percentages; subscribe/unsubscribe/resubscribe/pause-subscription/unpause-subscription count subscription changes caused by this email. unsubscribePerUniqueOpens is not available for transactional emails.'),
  timeZone: z.string().optional().describe('With interval: IANA time zone (e.g. "Europe/Budapest") the periods are labelled in. Defaults to UTC.')
}

export const rangeInputSchema = {
  from: z.string().optional().describe('Only count events on or after this date (ISO 8601). With interval, whole UTC days are used - e.g. from=to=2026-10-01 gives that full day.'),
  to: z.string().optional().describe('Only count events on or before this date (ISO 8601).')
}

export function buildStatsQuery (args) {
  return { from: args.from, to: args.to, interval: args.interval, metric: args.metric, timeZone: args.timeZone }
}

function formatBucket (bucket, metric) {
  if (PERCENTAGE_METRICS.includes(metric)) {
    return `${bucket.period}: ${bucket.rate}%`
  }
  if (bucket.rate === undefined || bucket.rate === null) {
    return `${bucket.period}: ${bucket.count}`
  }
  return `${bucket.period}: ${bucket.count} (${bucket.rate}% of sent)`
}

export function formatTimeline (timeline) {
  const header = `${timeline.interval} "${timeline.metric}" from ${timeline.from.slice(0, 10)} to ${timeline.to.slice(0, 10)} (${timeline.timeZone})`
  const buckets = timeline.buckets.filter(bucket => bucket.count || bucket.rate)
  if (buckets.length === 0) {
    return `${header}: nothing in this range.`
  }
  return `${header}:\n${buckets.map(bucket => formatBucket(bucket, timeline.metric)).join('\n')}\nPeriods not listed had 0.`
}
