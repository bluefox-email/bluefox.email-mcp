# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tool names and input schemas are the public API: removing/renaming a tool or param,
or making a param required, is a breaking change.

## [0.3.0] - 2026-10-22

### Added
- `create_campaign`, `create_transactional_email`, `create_triggered_email`, `update_email`, `manage_automation_email_content` (update): `chamaileonJsonPath` (a local file) or `chamaileonJson` (inline) to upload a Chamaileon visual editor JSON instead of an html/text `body`. The email opens in the app's drag-and-drop editor. On updates this switches an html/text email back to the visual editor.
- `manage_templates`: `create` can upload a Chamaileon JSON instead of copying a source template, and `update` can replace a template's visual content with one.
- An uploaded Chamaileon JSON can be short and hand-written: any eid and style/attrs key a block leaves out gets the editor's default. The `chamaileonJson` description shows agents the format.
- `get_email`, `manage_templates` (get), `manage_automation_email_content` (get): `chamaileonJsonOutputPath` saves the visual editor JSON to a file, to edit it and upload it again.

### Changed
- `body` on `create_campaign`, `create_transactional_email` and `create_triggered_email` is now optional. It is still required unless a Chamaileon JSON is given.

## [0.2.4] - 2026-10-21

### Added
- `create_campaign`, `create_transactional_email`, `create_triggered_email`, `update_email`, `manage_automation_email_content` (update) and `manage_automation_node` (send-email update): `trackOpens` / `trackClicks` turn open and click tracking on or off per email (both on by default).
- `get_email` and `manage_automation_email_content` (get) show "Open tracking: on/off" and "Click tracking: on/off".

## [0.2.3] - 2026-10-20

### Fixed
- `npx @bluefox-email/mcp` exited silently on Windows: the command is renamed from `bluefox.email-mcp` to `bluefox-email-mcp`, because Windows `cmd` can't run a command name with a dot in it. If you installed it with `npm link` and use `bluefox.email-mcp` as your MCP `command`, switch to the `npx` setup in the README.

## [0.2.2] - 2026-10-15

### Changed
- `add_list_subscriber`: on a list with double opt-in, `status: "active"` no longer skips the verification email (the API now always sends it to new, unverified, or unsubscribed contacts). The result says when a verification email was sent instead of reporting an undefined subscriber.
- `import_contacts` with a list: uses the new bulk import endpoint (batches of 1000) instead of subscribing one row at a time. Like the app's CSV import, it adds contacts as active without double opt-in, and contacts already on the list keep their status. `status` is now ignored.
- `bulk_update_contacts` with `subscribe_to_list`: uses the bulk import endpoint, like the app's bulk "assign to list". Contacts not yet on the list are added as active without double opt-in; contacts already on the list keep their status. The result reports how many were already on the list.
- `update_contact`, `add_list_subscriber`, `update_list_subscriber`: descriptions steer contact data changes to `update_contact` and keep the list tools for subscription changes.
- `add_list_subscriber`, `update_list_subscriber`, `import_contacts`, `resend_verification_email`: descriptions warn the agent that each call can send another verification email on a double opt-in list, not to retry to force a status change, and to prefer `import_contacts` for contacts who already agreed.
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

[0.3.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.3.0
[0.2.3]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.3
[0.2.2]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.2
[0.2.1]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.1.0
