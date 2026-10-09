# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tool names and input schemas are the public API: removing/renaming a tool or param,
or making a param required, is a breaking change.

## [0.2.1] - 2026-10-06

### Changed
- `create_campaign` and `update_email`: the `body` description documents the `{{webVersionLink}}` merge tag (public, non-personalized "view in browser" link, campaigns only, works once the campaign is sent or archived, always shows the latest version of the campaign).

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
