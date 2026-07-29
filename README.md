# bluefox.email MCP server

**What this is:** a small local program that lets an AI agent (Claude Desktop, Claude Code, or any other
[MCP](https://modelcontextprotocol.io)-compatible client) manage your [bluefox.email](https://bluefox.email)
account directly - creating campaigns, sending emails, managing contacts and subscriber lists, and more - just by
you asking in plain language. No API docs, no writing code, no copy-pasting HTTP requests.

It runs on your own computer (not hosted anywhere), and only talks to `bluefox.email` using your own API key.
It is not published to npm - you run it from this folder.

## What it can do

Once connected, you can just ask your AI agent things like:

- "Create a subscriber list called Newsletter."
- "Set up a welcome email for new subscribers on that list."
- "Create a campaign called Summer Sale, schedule it for tomorrow at 8am."
- "How did my last campaign perform?"
- "Add a new sending domain and check if it's verified yet."

See the full list of what's supported in [Tools](#tools) below.

## Setup

### 1. Install

```bash
git clone https://github.com/gyulanemeth/bluefox.email-mcp.git
cd bluefox.email-mcp
npm install
npm link
```

`npm link` makes the `bluefox.email-mcp` command available on your computer, pointing at this folder. That's what
lets your AI agent launch it (step 3 below).

Requires Node.js 20 or later.

### 2. Get your credentials

You need two things from your bluefox.email account:

| What | Where to find it |
|---|---|
| Project ID | In the app: **Project Settings > Integrations** |
| API key | In the app: **Project Settings > API Keys & Domain Whitelist** ("Get your API key") |

### 3. Connect it to your AI agent

Most MCP clients use the same config shape - a `command` to run plus the three env vars from step 2:

```json
{
  "mcpServers": {
    "bluefox-email": {
      "command": "bluefox.email-mcp",
      "env": {
        "BLUEFOX_BASE_URL": "https://api.bluefox.email",
        "BLUEFOX_PROJECT_ID": "YOUR_PROJECT_ID",
        "BLUEFOX_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Where that block goes, per client:

| Client | Put it in... |
|---|---|
| **Claude Desktop** | `claude_desktop_config.json` (Settings > Developer > Edit Config), then restart. |
| **Cursor** | `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for every project), then reload. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json`, then reload. |
| **Cline** (VS Code extension) | Cline's "MCP Servers" panel > Configure MCP Servers - same block. |

**Claude Code** doesn't use a config file - run this in your terminal instead:

```bash
claude mcp add bluefox-email \
  --env BLUEFOX_BASE_URL=https://api.bluefox.email \
  --env BLUEFOX_PROJECT_ID=YOUR_PROJECT_ID \
  --env BLUEFOX_API_KEY=YOUR_API_KEY \
  -- bluefox.email-mcp
```

**ChatGPT**: as of now, ChatGPT's MCP support (Settings > Connectors) expects a server reachable at a URL, not a
local command - so this local server can't be connected from ChatGPT directly. If you want AI-agent access to
bluefox.email from ChatGPT specifically, use the REST API + OpenAPI spec instead (see your Project Settings >
Integrations page in the app).

Once connected, start a new chat and ask it to do something with your bluefox.email project.

<details>
<summary>Didn't use <code>npm link</code>? Use this config instead</summary>

```json
{
  "mcpServers": {
    "bluefox-email": {
      "command": "node",
      "args": ["/absolute/path/to/bluefox.email-mcp/src/index.js"],
      "env": { "...": "as above" }
    }
  }
}
```

</details>

If the project ID or API key is missing or wrong, the server will fail to start with a clear error message instead
of connecting in a broken state.

## Tools

26 tools, grouped by area below. You can refer to things by name (a subscriber list, a campaign, a sender identity,
...) - the server looks up the matching id for you, you never need to know or pass raw ids yourself.

| Tool | What it does |
|---|---|
| `create_campaign` | Create a campaign email, optionally scheduling it. |
| `create_transactional_email` | Create a reusable transactional email. |
| `send_transactional_email` | Send a transactional email to one recipient. |
| `create_triggered_email` | Create a triggered email for a subscriber list. |
| `send_triggered_email` | Send a triggered email to a list (or specific recipients). |
| `update_email` | Update a campaign/transactional/triggered email; also cancels/reschedules a campaign. |
| `get_email` | Look up one email (with stats) or list all of a given type. |
| `get_email_recipients` | Per-recipient detail for one send - who received/opened/clicked/bounced/unsubscribed, paginated. |
| `delete_email` | Delete a campaign or triggered email. |
| `send_test_email` | Send a one-off test send without affecting real stats. |
| `create_contact` / `get_contact` / `update_contact` / `delete_contact` | Manage a single contact. |
| `create_subscriber_list` | Create a subscriber list, optionally with double opt-in. |
| `update_subscriber_list` | Update a list's name/description/privacy/double opt-in. |
| `get_subscriber_list` | Look up one list (with stats) or list all lists. |
| `delete_subscriber_list` | Delete a subscriber list. |
| `manage_segment` | List/create/get/update/delete segments (contact-property and engagement conditions). |
| `manage_project_settings` | Get/update the project's name, logo, and "unengaged contact" definition. |
| `manage_design_system` | Get the project's design system, or set/reset style overrides (colors, fonts, button/text/divider styles). |
| `manage_sending_setup` | List/add/remove/check sending domains and sender identities. |
| `manage_webhook` | Get/set/remove the project's webhook. |
| `manage_contact_fields_and_tags` | Manage custom contact field definitions and contact tags. |
| `manage_suppression_list` | List/add/remove entries on this project's suppression list. |
| `manage_templates` | List/get/rename/delete templates (metadata only - can't author template content, see Limitations). |

A well-behaved agent should ask you for details that matter (like a campaign's preview text) instead of guessing,
and look up your real options (like your actual subscriber lists) instead of asking you for raw ids.

## Limitations

- **Sandbox projects** can only send to verified email addresses - a bluefox.email account restriction, not
  something this server changes.
- **No date-range filtering** on list tools - "campaigns from this month" relies on the agent filtering the
  returned list itself, since the API only supports exact-match filters.
- **Templates** can be listed, renamed, or have their subject/preview text/tags updated, but this tool cannot
  author or edit a template's actual visual content, and can't create an email directly from a saved template -
  those only accept plain html/text content.
- **No transactional email delete** - `delete_email` only supports campaigns and triggered emails.
- **API keys and the domain whitelist** can't be read or changed through this server - manage those from Project
  Settings in the app.
- **Webhook `secretKey`** must match one of the project's existing API keys, which this server can't look up for
  you - get it from Project Settings > API Keys & Domain Whitelist.

## Development

```bash
npm test   # vitest + 100% coverage gate
npm run lint
```

Tests live next to the file they cover (`src/tools/campaigns.js` -> `src/tools/campaigns.test.js`, etc.), matching
the sibling bluefox.email repos. Most test each tool's handler logic directly (mocked HTTP); `src/tools/index.test.js`
spins up a real `McpServer` and `Client` over the SDK's in-memory transport to catch schema-registration issues the
handler tests can't see.
