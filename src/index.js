#!/usr/bin/env node
/* c8 ignore start -- real process entrypoint (stdio transport, process.exit); verified manually via the MCP
   Inspector and a real MCP client rather than unit-tested. Its only branching logic (env validation) is
   covered directly by src/helpers/config.test.js. */
import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './helpers/config.js'
import { createBluefoxClient } from './helpers/bluefoxClient.js'
import { createResolveId } from './helpers/resolveId.js'
import { registerTools } from './tools/index.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

async function main () {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    console.error(`bluefox.email-mcp: ${err.message}`)
    process.exit(1)
    return
  }

  const client = createBluefoxClient(config)
  const resolveHelpers = createResolveId(client)

  const server = new McpServer({ name: 'bluefox.email-mcp', version })
  registerTools(server, { client, ...resolveHelpers })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main()
/* c8 ignore stop */
