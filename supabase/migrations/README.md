# Supabase migration policy

`supabase/migrations/` is the only location for new production schema changes.

## Rules

1. Files use UTC timestamp prefixes and are immutable after production deployment.
2. Every migration is idempotent where practical and must run on staging before production.
3. Application code may not depend on a migration until its readiness evidence is present.
4. Destructive changes require a separate data migration, verification query, and rollback plan.
5. Service-role grants do not replace RLS. Tables remain RLS-enabled even in personal mode.
6. SQL files under `docs/` are historical references only and must not be applied as the active chain.
7. A migration may be marked production-ready only after schema, security, and application smoke checks pass.

## Active hardening chain

- `202607130002_cron_run_tracking.sql`
- `202607130003_operational_reliability.sql`
- `202607130004_accounting_controls.sql`
- `202607130005_security_hardening.sql`
- `202607130006_integration_concurrency.sql`
- `202607130007_rls_policy_performance.sql`
- `202607130008_integration_completion_rpc.sql`
- `202607130009_core_foreign_key_indexes.sql`
- `202607130010_release_evidence.sql`

## Verification

The production project received the equivalent migrations during development and stores evidence in `readiness_evidence`. Before a commercial release, the same ordered chain must be applied to an isolated staging or restored database through `.github/workflows/database-security.yml`, followed by `supabase/tests/rls_regression.sql` and browser E2E.

`ORVANTA_MIGRATIONS_BASELINED=true` must not be set merely because files exist. The evidence-aware readiness endpoint derives this gate from an unexpired `migration-chain-applied` PASS record.
