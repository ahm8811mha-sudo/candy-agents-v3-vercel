# ORVANTA Core Completion Runbook

This runbook activates the governed company runtime introduced by PR #17.

## 1. Migration order

Run in a staging Supabase project first:

```text
1. docs/supabase-schema.sql
2. docs/supabase-multitenant.sql
3. docs/enable-pgvector.sql
4. docs/supabase-world-class-os.sql
5. docs/supabase-core-completion.sql
```

Do not set the readiness flags until the migration finishes without errors and the tests below pass.

## 2. Supabase user claims

Every interactive user must have a tenant claim in `app_metadata`:

```json
{
  "tenant_id": "golden-star",
  "role": "CEO"
}
```

Supported application roles are `ADMIN`, `CEO`, `CFO`, `MANAGER`, `EMPLOYEE`, and `VIEWER`.

A browser request cannot override its JWT tenant with `x-orvanta-tenant-id`. The header is accepted only for trusted API-key or scheduler calls.

## 3. Vercel environment gates

Configure server-only values in Vercel. Never use `NEXT_PUBLIC_` for secrets.

```text
AUTH_ENABLED=true
API_SECRET_KEY=<strong random secret>
CRON_SECRET=<different strong random secret>
ORVANTA_MULTI_TENANT=true
ORVANTA_TENANT_ID=golden-star
ORVANTA_CORE_SCHEMA_READY=true
ORVANTA_RLS_READY=true
ORVANTA_WORKFLOW_RUNTIME_ENABLED=true
ORVANTA_OUTBOX_ENABLED=true
ORVANTA_RECONCILIATION_REQUIRED=true
```

Google Workspace remains behind its own kill switch and OAuth variables.

## 4. Runtime APIs

```text
POST /api/company-os/workflows
GET  /api/company-os/workflows
GET|POST /api/company-os/workflows/tick
GET|POST /api/company-os/outbox/publish
GET  /api/company-os/health
GET|POST /api/company-os/knowledge
POST /api/company-os/reconcile
```

Worker endpoints require either:

```text
Authorization: Bearer <CRON_SECRET>
```

or:

```text
x-api-key: <API_SECRET_KEY>
x-orvanta-tenant-id: golden-star
```

## 5. Acceptance tests

### Tenant isolation

1. Create users for `tenant-a` and `tenant-b`.
2. Insert one project and one action for each tenant.
3. Use each user's access token to query tenant-scoped routes.
4. Confirm neither user can read, update, execute, or reconcile the other tenant's records.
5. Attempt to send a conflicting `x-orvanta-tenant-id`; expect HTTP 403.

### Workflow restart and idempotency

1. Start an `idea-to-investment` workflow with a fixed correlation ID.
2. Start it again with the same correlation ID; expect `reused=true`.
3. Run one worker tick.
4. Redeploy or restart the server.
5. Continue worker ticks and confirm execution resumes from the persisted current step.
6. Verify only one decision packet, one project, one budget commitment, and one action set exist.

### Approval pause

1. Start a MEDIUM/HIGH workflow.
2. Confirm the workflow enters `WAITING_APPROVAL`.
3. Approve all required rows in `decision_approvals` through governed approval routes.
4. Run the worker again and confirm it resumes.

### Outbox reliability

1. Configure a test webhook endpoint.
2. Start a workflow and run the publisher.
3. Confirm signed delivery and `PUBLISHED` status.
4. Return HTTP 500 from the receiver and confirm `RETRY` with a future `available_at`.
5. Repeat failures until the row becomes `DEAD_LETTER`.
6. Confirm a repeated publisher run never sends a `PUBLISHED` event again.

### Reconciliation

1. Execute Gmail, Sheets, and Drive actions.
2. Confirm an external provider ID is stored as the receipt.
3. Confirm `execution_reconciliations.status=RECONCILED` before the action becomes `DONE`.
4. For a financial action, omit the ledger reference; expect `WAITING_RECONCILIATION`.
5. Add a balanced ledger entry and reconcile again; expect `DONE`.

### Production readiness

Open:

```text
/api/health
/status
```

Production is acceptable only when `productionReady=true` and every required core check is `PASS`.

## 6. Rollback

Disable execution without removing data:

```text
ORVANTA_WORKFLOW_RUNTIME_ENABLED=false
ORVANTA_OUTBOX_ENABLED=false
GOOGLE_INTEGRATIONS_ENABLED=false
```

Keep authentication, tenant RLS, audit, and reconciliation data enabled. Never roll back by disabling RLS or exposing the service-role key.
