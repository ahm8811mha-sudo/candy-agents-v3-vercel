# ORVANTA Core Completion Runbook

## Database order

Apply and verify these migrations in sequence:

```text
1. database/schema.sql
2. docs/supabase-schema.sql
3. docs/supabase-multitenant.sql
4. docs/supabase-world-class-os-v2.sql
5. docs/supabase-core-completion.sql
6. docs/supabase-security-hardening.sql
7. docs/supabase-performance-indexes.sql
```

Use the v2 world-class migration on existing Orvanta databases because the production `opportunities.id` column is text. Run Supabase Security Advisor after all migrations and require a clean security result before enabling execution.

## Identity and tenant context

Every interactive Supabase user needs `tenant_id` and `role` in `app_metadata`. Supported roles are `ADMIN`, `OWNER`, `CEO`, `CFO`, `COO`, `CRO`, `CGO`, `MANAGER`, `EMPLOYEE`, and `VIEWER`.

Browser requests cannot override their JWT tenant. Tenant headers are accepted only for trusted system and scheduler requests.

## Production gates

Configure the variables documented in `.env.example`. The required readiness gates are authentication, a service-role persistence key, API and scheduler credentials, multi-tenant mode, confirmed core schema, confirmed RLS, durable workflows, outbox publishing, and mandatory reconciliation.

Do not expose service-role or internal scheduler credentials to browser code.

## Execution model

```text
POST /api/company-os/workflows
GET  /api/company-os/workflows
GET|POST /api/company-os/workflows/tick
GET|POST /api/company-os/outbox/publish
GET  /api/company-os/runtime/cron
POST /api/company-os/decisions/approve
GET  /api/company-os/health
GET|POST /api/company-os/knowledge
POST /api/company-os/reconcile
```

Creating a workflow immediately advances it until approval, completion, failure, or another safe stopping point. Completing the required approval quorum immediately resumes the affected workflow.

The Vercel Hobby-compatible recovery job calls `/api/company-os/runtime/cron` daily at 03:15 UTC. It drains several workflow cycles and then publishes the transactional outbox. On a Pro plan, the same endpoint can be scheduled more frequently.

## Required verification

### Tenant isolation

Create two test users with different tenant claims. Confirm each user can access only its own projects, decisions, actions, workflows, and reconciliation records. A conflicting tenant header must return HTTP 403.

### Workflow durability

Start the same workflow twice with one correlation ID and confirm the second request is reused without duplicate decision, project, budget, or action records. Restart or redeploy during a retryable step, then run the recovery endpoint and confirm the workflow resumes from persisted state.

### Approval behavior

A material workflow must stop at `WAITING_APPROVAL`. It must remain paused until quorum is complete. The quorum-completing response must include workflow progress and resume execution. A rejected decision must cancel its workflow.

### Outbox and reconciliation

Successful webhook delivery must be signed and marked published. Failed delivery must retry and eventually move to dead letter without republishing completed rows. External actions cannot become complete until their provider receipt and any required financial reference are reconciled.

### Production status

Check `/api/health` and `/status`. Production is acceptable only when `productionReady=true` and all required core checks pass.

## Rollback

Disable workflow, outbox, and external integration execution while keeping authentication, tenant RLS, audit records, workflow history, and reconciliation data intact.
