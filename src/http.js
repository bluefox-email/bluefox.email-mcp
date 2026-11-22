#!/usr/bin/env node
/* c8 ignore start */
import { createRequire } from 'node:module'
import { loadHostedConfig } from './hosted/config.js'
import { createHostedApp } from './hosted/app.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

let config
try {
  config = loadHostedConfig()
} catch (err) {
  console.error(`bluefox.email-mcp: ${err.message}`)
  process.exit(1)
}

createHostedApp({ ...config, version }).listen(config.port, () => {
  console.log(`bluefox.email-mcp hosted server listening on port ${config.port}`)
})
/* c8 ignore stop */
