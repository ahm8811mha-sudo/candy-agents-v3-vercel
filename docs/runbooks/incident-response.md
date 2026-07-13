# Incident response runbook

## Severity

- **SEV-1:** unauthorized access, financial corruption, data loss, or complete outage.
- **SEV-2:** critical workflow, cron, integration, or government-document failure with no safe workaround.
- **SEV-3:** degraded capability with a safe workaround.

## First 15 minutes

1. Open **System → Operational Reliability**.
2. Record the alert ID, correlation ID, first-seen time, affected entity, and latest deployment.
3. Stop the harmful path: disable the integration, cron, or capability flag. Do not delete evidence.
4. Preserve logs, `cron_runs`, `integration_attempts`, `external_receipts`, `failed_writes`, `dead_letter_jobs`, and audit records.
5. For access incidents, rotate owner device signing secret, owner access key, API secret, cron secret, and affected OAuth credentials.

## Containment

- Financial issue: close the affected period and stop posting. Never edit a posted entry; create a reversal after analysis.
- Duplicate external actions: disable the capability and inspect idempotency keys and receipts.
- Stuck workflow: inspect current step, attempts, approval state, and outbox state before retrying.
- Database issue: make the application read-only and begin the backup/restore runbook.

## Recovery

1. Reproduce in staging with a sanitized payload.
2. Apply the smallest reviewed fix through CI and E2E.
3. Re-run the failed item through the controlled retry endpoint.
4. Verify the external receipt and reconciliation record.
5. Resolve the system alert with a written note.

## Post-incident

Within two business days, record root cause, impact, timeline, detection gap, corrective actions, tests added, and whether the readiness score must be reduced.
