/** Configuration checks do not claim successful external delivery. */
export function outboxConfiguration(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const missing: string[] = [];
  if (env.ORVANTA_OUTBOX_ENABLED !== "true") missing.push("ORVANTA_OUTBOX_ENABLED=true");
  if (!env.CRON_SECRET?.trim()) missing.push("CRON_SECRET");
  const url = env.ORVANTA_WEBHOOK_URL?.trim();
  if (!url) missing.push("ORVANTA_WEBHOOK_URL");
  else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) missing.push("ORVANTA_WEBHOOK_URL (HTTPS without embedded credentials)");
    } catch { missing.push("ORVANTA_WEBHOOK_URL (valid HTTPS URL)"); }
  }
  if (!(env.ORVANTA_WEBHOOK_SECRET || env.API_SECRET_KEY)?.trim()) missing.push("ORVANTA_WEBHOOK_SECRET or API_SECRET_KEY");
  return { ready: missing.length === 0, missing };
}
