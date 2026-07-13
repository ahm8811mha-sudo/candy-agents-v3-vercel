# Orvanta authoritative sources of truth

## General rule

PostgreSQL is the source of truth. In-process arrays and maps are caches or compatibility adapters only. A user-visible success may not be returned before a critical database transaction completes.

## Workflow model

The authoritative runtime hierarchy is:

`Workflow Instance → Workflow Steps → Actions → Integration Attempts → External Receipts`

- `workflow_instances`: lifecycle and current position.
- `workflow_steps`: durable step state, retry state, approval state, and output.
- domain actions: the approved business operation.
- `integration_attempts`: every external attempt and idempotency key.
- `external_receipts`: evidence that the external system accepted or produced the result.
- `event_outbox`: durable event publication.
- `cron_runs`: durable scheduler execution evidence.

Legacy task, action, ledger, and memory stores may feed migration adapters, but they cannot power official production totals after migration.

## Finance

Official financial sources:

- `accounting_journal_entries`
- `accounting_journal_lines`
- `accounting_accounts`
- `accounting_periods`
- official accounting views derived from the journal

Posted entries are immutable. Corrections use `orvanta_reverse_journal_entry`. `company/ledger` and ZATCA in-memory arrays are compatibility layers and must not be used for official financial reporting.

## Reliability

- `failed_writes`: non-critical persistence failures awaiting controlled replay.
- `dead_letter_jobs`: terminal failures requiring explicit intervention.
- `system_alerts`: deduplicated operational alerts.
- `cron_runs`: scheduler run, heartbeat, duration, counts, and error.
- `operational_telemetry`: request and execution spans.

## Capability truth

`capability_registry` is the authoritative statement of what Orvanta can do. User interfaces must display or hide capabilities according to:

- `LIVE`
- `SANDBOX`
- `HUMAN_CHECKPOINT`
- `NOT_INTEGRATED`
- `DISABLED`

No UI copy may claim autonomous execution for a capability that is not `LIVE`.

## Repository boundary

New modules follow:

`Route → Service → Repository / Transactional RPC → PostgreSQL → Result`

Direct fire-and-forget writes are prohibited for finance, identity, approvals, contracts, workflow state, integration attempts, receipts, and audit evidence.
