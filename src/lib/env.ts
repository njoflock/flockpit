function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Revisá .env.local o la configuración de Vercel.`);
  return v;
}
export const env = {
  appUrl: () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: () => req('SESSION_SECRET'),
  tokenKey: () => req('TOKEN_ENCRYPTION_KEY'),
  supabaseUrl: () => req('SUPABASE_URL'),
  supabaseKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),
  msClientId: () => req('MS_CLIENT_ID'),
  msClientSecret: () => req('MS_CLIENT_SECRET'),
  msTenant: () => process.env.MS_TENANT_ID || 'organizations',
  slackClientId: () => req('SLACK_CLIENT_ID'),
  slackClientSecret: () => req('SLACK_CLIENT_SECRET'),
  anthropicKey: () => process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  cronSecret: () => req('CRON_SECRET'),
};
