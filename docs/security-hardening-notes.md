# Orvanta Security Hardening Notes

## Applied in code

- The old public `/api/company-execution` route was removed.
- A protected `/api/owner-execution` route was added and all execution UIs now use it.
- Owner/Admin requests use the same signed HttpOnly trusted-device cookie as the rest of the private app. System and Supabase bearer authentication remain supported by the unified auth module.
- Write execution now checks Supabase availability through `requireSupabaseForWrite()`.
- The safe execution wrapper rejects unsaved execution results.
- The authority matrix now exposes server-side role checks for approval tiers.
- The old company execution endpoint remains removed; no browser component references it.

## Required Vercel environment variables

```text
ORVANTA_OWNER_SECRET=generate-a-long-random-value
ORVANTA_ADMIN_SECRET=generate-a-different-long-random-value
SUPABASE_SECRET_KEY=your-server-secret-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
```

## Required Supabase review

Review all write-heavy business tables and make sure browser clients cannot write directly to them. Sensitive tables include projects, tasks, approvals, business_actions, business_kpis, financial_decisions, business_memory, business_alerts, and activity_logs.

The intended architecture is: browser -> protected Next.js API -> Supabase service role. Direct browser writes to governance data should remain disabled.
