# RLS and Outbox correction — 2026-09-08

Correct project: Candy Agents, Supabase `tzocpuvotezcxjvwygpk`.

The latest saved production RLS verification expired on 2026-08-14. The existing
`supabase/tests/rls_regression.sql` suite was run against the actual database in
a rolled-back transaction and passed. A new production evidence row records
the real checks and expires on 2026-09-22. No RLS policy was weakened and no
environment flag was used to substitute for the verification.

Eight events were incorrectly marked PUBLISHED with `skipped=true` when no
webhook destination existed. `database/repair-skipped-outbox.sql` was first
tested with ROLLBACK, then applied. Those events are now DEAD_LETTER for manual
review, their publication timestamps are cleared, and disabled-integration
receipts are unverified. Prior metadata and a correction record are retained.
No external event was resent. This repair is idempotent.

The publisher now validates enablement, scheduler authentication, an HTTPS
destination, and a signing secret before claiming any queued event. A missing
destination cannot create a successful receipt. Legacy cached skipped results
cannot be counted as published. Configuration readiness uses the same checks.
The status page distinguishes missing current isolation verification from
incomplete delivery setup instead of describing both as preview-only issues.

Release limitation: the connected Vercel app still exposes only Focus Flow;
Candy Agents returns 404. The actual deployment environment variables have
not been changed. Outbox needs the intended HTTPS receiver, its signing secret,
and authenticated scheduling verified in the correct project before activation.
Do not enable external delivery or replay old events just to clear a warning.
