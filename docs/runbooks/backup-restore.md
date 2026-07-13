# Backup and restore verification

A configured backup is not evidence of recoverability. `ORVANTA_BACKUP_RESTORE_VERIFIED=true` is allowed only after a successful restore drill.

## Target

- **RPO:** 24 hours maximum for the personal installation.
- **RTO:** 4 hours for core decisions, workflows, government documents, and accounting.

## Drill procedure

1. Create an isolated Supabase staging or branch project. Never restore over production.
2. Restore the latest production backup or supported logical export.
3. Apply any migrations newer than the backup.
4. Verify row counts and referential integrity for:
   - decisions and approvals
   - workflow instances and steps
   - company events and event outbox
   - government documents and extraction records
   - accounting entries and lines
   - integration attempts and receipts
   - cron runs, alerts, failed writes, and dead letters
5. Run the RLS regression suite using anonymous, owner, and cross-tenant test identities.
6. Run the application smoke and browser E2E tests against the restored project.
7. Record the drill in `backup_verification_runs` with the backup reference, restore target, duration, verified tables, and operator.
8. Delete the isolated restored data after evidence is retained.

## Failure handling

A failed drill is a release blocker. Open a CRITICAL system alert, record the failing table or migration, and keep the readiness flag false until a complete rerun succeeds.

## Evidence

Retain:

- backup identifier and timestamp
- restore target identifier
- migration version
- verification query output
- RLS test output
- E2E workflow URL
- start/end time and operator
