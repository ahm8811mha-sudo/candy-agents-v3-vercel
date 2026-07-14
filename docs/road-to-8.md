# Orvanta Road to 8/10

This document is the binding engineering plan for raising every reviewed quality dimension to approximately 8/10. New modules and pages are frozen until the P0 gates pass.

## P0 gates

### Security
- No anonymous request may receive OWNER context.
- Personal mode requires a signed HttpOnly trusted-device cookie.
- System and cron requests require their dedicated secrets.
- Public commercial APIs remain disabled in personal mode.
- RLS and cross-tenant tests must pass before commercial mode is restored.

### CI
Every pull request must pass:
1. Locked dependency install.
2. TypeScript.
3. Unit and integration tests.
4. Production build.
5. High-severity production dependency audit.

### Reliability
- Critical writes must be awaited or executed in a transaction/RPC.
- Non-critical asynchronous failures must enter `failed_writes` and logs.
- Every cron must have a durable run record, duration, counts, error, and heartbeat.
- External actions require idempotency keys, receipts, retry state, and reconciliation.

## P1 architecture gates

### Persistence
- PostgreSQL is the source of truth; process memory is cache only.
- All new modules use repositories or transactional RPCs.
- SQL changes live in `supabase/migrations/` with ordered versions.

### Accounting
- `accounting_journal_entries` and `accounting_journal_lines` are the only official financial source.
- Posted entries are immutable; corrections use reversal entries.
- Period close, trial balance, receivables, payables, VAT reports, and reconciliation are required.

### Workflow
One runtime model only:

`Workflow -> Steps -> Actions -> Attempts -> Receipts`

Legacy task/action stores may remain only as migration adapters and must not power production dashboards.

## P1 integration gates

Complete three vertical journeys before adding more integrations:

1. Google Workspace: Gmail, Sheets, Drive, Calendar, token refresh, retries, receipts, idempotency.
2. Government relations: document upload, extraction, required fields, deadlines, tasks, human checkpoints, evidence.
3. Finance/ZATCA: invoice, VAT, approval, submission or certified sandbox, response, journal posting, reconciliation.

Every capability must be labelled one of:
- `LIVE`
- `SANDBOX`
- `HUMAN_CHECKPOINT`
- `NOT_INTEGRATED`
- `DISABLED`

## UX gates

The main navigation is reduced to:
1. Overview
2. Decisions
3. Execution
4. Departments
5. System

Pages without real data are hidden. Demo data cannot be mixed with production data. Every metric identifies its source and freshness.

## Target acceptance scores

| Dimension | Target |
|---|---:|
| Operating model | 8.5+ |
| Governance and accounting | 8+ |
| Business logic and testing | 8+ |
| Security | 8+ |
| Operational reliability | 8+ |
| Real integrations | 8+ |
| User experience | 8+ |
| Engineering discipline | 8+ |

## Freeze rule

Until the P0 gates pass, do not add agents, departments, pages, demo metrics, unversioned SQL files, or new fallback success paths.
