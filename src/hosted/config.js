const REQUIRED = ['BLUEFOX_BASE_URL', 'PUBLIC_URL', 'APP_URL', 'MCP_OAUTH_SECRET']

export function loadHostedConfig (env = process.env) {
  const missing = REQUIRED.filter(key => !env[key])
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}.`)
  }

  return {
    port: Number(env.PORT || 3333),
    baseUrl: env.BLUEFOX_BASE_URL.replace(/\/$/, ''),
    publicUrl: env.PUBLIC_URL,
    appUrl: env.APP_URL,
    secret: env.MCP_OAUTH_SECRET
  }
}
