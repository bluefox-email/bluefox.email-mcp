# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tool names and input schemas are the public API: removing/renaming a tool or param,
or making a param required, is a breaking change.

## [0.3.0] - 2026-10-06

### Added
- `create_campaign`, `create_transactional_email`, `create_triggered_email`, `update_email`, `manage_automation_email_content` (update): `chamaileonJsonPath` (a local file) or `chamaileonJson` (inline) to upload a Chamaileon visual editor JSON instead of an html/text `body`. The email opens in the app's drag-and-drop editor. On updates this switches an html/text email back to the visual editor.
- `manage_templates`: `create` can upload a Chamaileon JSON instead of copying a source template, and `update` can replace a template's visual content with one.

### Changed
- `body` on `create_campaign`, `create_transactional_email` and `create_triggered_email` is now optional. It is still required unless a Chamaileon JSON is given.

## [0.2.0] - 2026-10-02

### Added
- `get_email`: `interval` (hourly/daily/weekly/monthly) + `metric` + `timeZone` for a per-period breakdown, the same data and range limits as the app's stats chart, including subscribe/unsubscribe/resubscribe/pause/unpause counts; `from`/`to` to limit the stats to a date range.
- `get_automation_stats`: the same `interval`/`metric`/`timeZone` breakdown for the `email` action.

## [0.1.0] - 2026-09-29

First versioned release. Changes before this version are not tracked here.

### Added
- `list_contacts`: list and filter contacts by subscriber list, saved segment (name or id), tags and contact fields.

[0.3.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.3.0
[0.2.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/bluefox-email/bluefox.email-mcp/releases/tag/v0.1.0
