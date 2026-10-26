# Backup and restore verification

A configured backup is not evidence of recoverability. `ORVANTA_BACKUP_RESTORE_VERIFIED=true` is allowed only after a successful restore drill.

## Target

- **RPO:** 24 hours maximum for the personal installation.
- **RTO:** 4 hours for core decisions, workflows, government documents, and accounting.

## GitHub Actions drill

`.github/workflows/backup-restore-drill.yml` is the owner-approved restore. It is `workflow_dispatch` only. It does not run on a schedule and it does not deploy.

Secrets the workflow reads:

| Secret | Role |
|---|---|
| `PRODUCTION_DB_URL` | Direct Postgres URI of production. `pg_dump` reads it. |
| `RESTORE_DB_URL` | Direct Postgres URI of the isolated restore project `jejdisbbtgkmpkredxtv`. `pg_restore` writes only here. |
| `RESTORE_SUPABASE_URL` | API URL of that same isolated project, for `scripts/verify-restore.mjs`. |
| `RESTORE_SUPABASE_SERVICE_ROLE_KEY` | Service role of the isolated project. |
| `PRODUCTION_SUPABASE_URL` | Production API URL. The verifier records evidence back to production. |
| `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` | Production service role, used only for the evidence insert. |

`RESTORE_DB_URL` is a new GitHub Actions secret. Put the session or direct URI (host `db.jejdisbbtgkmpkredxtv.supabase.co`, port 5432) in it. Do not use the shared pooler host: that hostname is regional, so it can match production's pooler host and the guard will abort. Do not point this secret at production.

What the job does, in order:

1. Abort if either database URL is missing. The values are not printed.
2. Run `lib/ops/restoreTargetGuard.ts`. The job stops when the restore host equals the production host, when the restore URL or its host contains the production project ref (the ref in `db.<ref>.supabase.co` or in the `postgres.<ref>` user), when the production ref cannot be identified on a Supabase host, or when the restore URL is not project `jejdisbbtgkmpkredxtv`. The `restore_target` input must be that same ref. Rejection messages name the check and do not include the URLs.
3. Install a PostgreSQL client whose major version matches production. A bootstrap `psql` runs `SHOW server_version_num` and the job installs `postgresql-client-<major>` from PGDG when Ubuntu's client is a different major. `pg_dump` must not be older than the server.
4. `pg_dump` production with `-Fc --no-owner --no-privileges` into `$RUNNER_TEMP/orvanta-production.dump`.
5. Run the guard again, then `pg_restore --no-owner --clean --if-exists` into `RESTORE_DB_URL`.
6. Run the existing `scripts/verify-restore.mjs`. That script counts the core tables, checks journal lines, calls `orvanta_owner_setup_state`, and inserts `backup_verification_runs` on production.
7. Delete the dump, including when an earlier step failed. The dump is not uploaded. The only artifact is `restore-verification.json`.

Dispatch inputs: `backup_reference` (stored on the evidence row) and `restore_target` (default `jejdisbbtgkmpkredxtv`).

A failed `pg_dump` or `pg_restore` withholds its log. Those tools can echo a connection string, and this repository's Actions logs are visible to anyone with read access.

## Drill procedure

The manual procedure below is the fallback when the Actions drill cannot run. Never restore over production.

1. Use the isolated Supabase project `jejdisbbtgkmpkredxtv`. Do not create a second restore target for this drill.
2. Restore the latest production backup or supported logical export into that project only.
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
