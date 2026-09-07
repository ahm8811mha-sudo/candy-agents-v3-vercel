# Candy Agents: work desk and decision foundation

Implemented against `ahm8811mha-sudo/candy-agents-v3-vercel`, based on
`b57b04013330fc4cf5653b5537c34b7187668913`. This is the Candy Agents repository;
it is distinct from Focus Flow.

## Resulting behavior

- The Arabic work desk presents saved decisions, active projects, blockers and
  work awaiting confirmation. Failed reads are displayed as errors.
- Ideas are editable study files. Commercial studies calculate projections from
  entered quantities and costs; operational studies use a measurable expected
  outcome. Both require evidence, its source, an execution owner, a success
  metric and risks before requesting approval. Input coverage is labelled as
  completeness, not a probability of success.
- Opportunity discovery uses inventory shortages and blocked tasks in company
  records. It returns an explicit explanation when there is no new signal.
  Merely opening a page no longer creates a daily idea.
- Optional model analysis identifies its source and reports provider failures.
  It cannot fill missing evidence or bypass the human decision gate.
- Critical idea saves, approval decisions and deferrals use database transactions
  with audit entries. Revision checks reject stale study edits. Critical reads
  use persisted tenant-scoped records instead of a process-local snapshot.
- Retrying idea execution completes missing funding requests without resetting
  prior funding decisions. An execution marker is saved only after that step.
- Task confirmation through the status API requires an authenticated human
  owner/admin, a proof note, and the applicable funding approval. The status and
  audit entry commit together. Historical confirmations are not revalidated.
- The new paper-and-ink visual system covers the main work desk, study register,
  decision desk, project controls, navigation, owner entry and phone layout.
  Existing specialist screens remain available through the tools menu.

## Database change

Migration `20260907122056_idea_foundation_redesign.sql` was applied on
2026-09-07 to Supabase project `tzocpuvotezcxjvwygpk`, matching the public
Supabase URL tracked in this repository. It adds the idea revision column and
five service-role-only, security-invoker transaction functions. It does not
delete existing business records or replace existing tables.

`database/idea-foundation.verify.sql` runs synthetic cases inside its own
transaction and ends with `ROLLBACK`. It passed both before and after the
migration was applied: atomicity on audit failure, tenant isolation, stale
writes, conflicting decisions, deferral/revival, repeat funding, human proof,
and function grants. Sequence counters can advance during rolled-back fixtures.

## Verification and release boundaries

- 403 unit/API tests pass across 66 files.
- TypeScript checking and the production build pass.
- ESLint has no errors; one existing unused-variable warning remains in the
  design-system token generator.
- Browser fixtures cover owner access, the work desk, operational study entry,
  decision links and read failures on Chromium and iPhone WebKit. These tests
  are intended to run in the repository's existing Browser E2E CI workflow.
- Local browser execution was blocked by unavailable browser binaries and a
  browser environment that refused the local development address. No local
  screenshot or visual acceptance is claimed.
- Browser fixtures do not prove live persistence. The real database functions
  were verified separately with the rollback SQL suite. The real core-loop E2E
  path requires explicit staging configuration before it creates business data.
- Live model-provider calls and the user's original Vercel deployment have not
  been verified for this revision. The connected Vercel account returned 404
  for Candy Agents; a different visible project must not be used to publish it.
- Legacy synchronous helpers and specialist screens remain; this change does
  not claim to replace every older persistence path in the application.

## Rollback

Revert the application commit if needed. The database migration is additive and
can remain in place while the application is reverted. Do not remove persisted
ideas, approvals, audit records, or funding decisions as a rollback mechanism.
