# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tool names and input schemas are the public API: removing/renaming a tool or param,
or making a param required, is a breaking change.

## [0.2.2] - 2026-10-15

### Changed
- `add_list_subscriber`: on a list with double opt-in, `status: "active"` no longer skips the verification email (the API now always sends it to new, unverified, or unsubscribed contacts). The result says when a verification email was sent instead of reporting an undefined subscriber.
- `import_contacts` with a list: uses the new bulk import endpoint (batches of 1000) instead of subscribing one row at a time. Like the app's CSV import, it adds contacts as active without double opt-in, and contacts already on the list keep their status. `status` is now ignored.
- `update_list_subscriber`: on a list with double opt-in, setting an unverified or unsubscribed contact to `active` sends the verification email instead, and the result says so. Paused contacts are still reactivated directly.

## [0.2.1] - 2026-10-06

### Added
- `create_campaign` and `update_email`: `webVersionEnabled` turns a campaign's public web version on or off (off by default); `get_email` shows "Web version: on/off" for campaigns.

### Changed
- `create_campaign` and `update_email`: the `body` description documents the `{{webVersionLink}}` merge tag (public, non-personalized "view in browser" link, campaigns only, works once the web version is enabled and the campaign is sent or archived, always shows the latest version of the campaign).

## [0.2.0] - 2026-10-02

### Added
- `get_email`: `interval` (hourly/daily/weekly/monthly) + `metric` + `timeZone` for a per-period breakdown, the same data and range limits as the app's stats chart, including subscribe/unsubscribe/resubscribe/pause/unpause counts; `from`/`to` to limit the stats to a date range.
- `get_automation_stats`: the same `interval`/`metric`/`timeZone` breakdown for the `email` action.

## [0.1.0] - 2026-09-29

First versioned release. Changes before this version are not tracked here.

### Added
- `list_contacts`: list and filter contacts by subscriber list, saved segment (name or id), tags and contact fields.

[0.2.1]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.1.0
