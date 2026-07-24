const REQUIRED = ['BLUEFOX_BASE_URL', 'BLUEFOX_PROJECT_ID', 'BLUEFOX_API_KEY']

export function loadConfig (env = process.env) {
  const missing = REQUIRED.filter(key => !env[key])
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Set them in your MCP client\'s server config (e.g. Claude Desktop\'s claude_desktop_config.json "env" block) before starting this server.'
    )
  }

  return {
    baseUrl: env.BLUEFOX_BASE_URL.replace(/\/$/, ''),
    projectId: env.BLUEFOX_PROJECT_ID,
    apiKey: env.BLUEFOX_API_KEY
  }
}
