# Orvanta Security Hardening Notes

## Applied in code

- The old public `/api/company-execution` route was removed.
- A protected `/api/owner-execution` route was added.
- Owner/Admin requests must provide the server access value through `Authorization: Bearer ...` or `x-orvanta-access`.
- Write execution now checks Supabase availability through `requireSupabaseForWrite()`.
- The safe execution wrapper rejects unsaved execution results.
- The authority matrix now exposes server-side role checks for approval tiers.
- Middleware blocks the old company execution endpoint unless owner/admin access is supplied.

## Required Vercel environment variables

```text
ORVANTA_OWNER_SECRET=generate-a-long-random-value
ORVANTA_ADMIN_SECRET=generate-a-different-long-random-value
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
```

## Required Supabase review

Review all write-heavy business tables and make sure browser clients cannot write directly to them. Sensitive tables include projects, tasks, approvals, business_actions, business_kpis, financial_decisions, business_memory, business_alerts, and activity_logs.

The intended architecture is: browser -> protected Next.js API -> Supabase service role. Direct browser writes to governance data should remain disabled.
