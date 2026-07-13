# Supabase migration policy

`supabase/migrations/` is the only location for new production schema changes.

## Rules

1. Files use UTC timestamp prefixes and are immutable after production deployment.
2. Every migration is idempotent where practical and must run on staging before production.
3. Application code may not depend on a migration until its readiness flag is enabled.
4. Destructive changes require a separate data migration, verification query, and rollback plan.
5. Service-role grants do not replace RLS. Tables remain RLS-enabled even in personal mode.
6. SQL files under `docs/` are historical references only and must not be applied as the active chain.

## Active hardening chain

- `202607130002_cron_run_tracking.sql`
- `202607130003_operational_reliability.sql`
- `202607130004_accounting_controls.sql`

The production project already received the equivalent applied migrations during development. Before setting `ORVANTA_MIGRATIONS_BASELINED=true`, compare the production schema with this chain on a staging branch and retain the evidence in the release record.
