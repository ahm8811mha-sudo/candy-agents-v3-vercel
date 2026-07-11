# ORVANTA World-Class Implementation Matrix

This matrix maps every transformation area to concrete code, current status, and the next production gate.

| # | Transformation area | Runtime delivered | Next scale gate |
|---|---|---|---|
| 1 | Brutal project audit | `STRATEGIC_AUDIT` and the Arabic transformation document | Re-run quarterly against product metrics, incidents and customer outcomes |
| 2 | Company operating model | Ten-stage canonical lifecycle plus the durable `idea-to-investment` workflow | Migrate remaining lead, procurement, campaign and incident lifecycles |
| 3 | Organizational structure | Owner, AI Executive Board, engines, workflow workers and complete executive auth roles | Bind every legacy action to one accountable engine and KPI |
| 4 | Governance | Executable LOW/MEDIUM/HIGH/CRITICAL policy engine, tenant context, evidence controls and separation of duties | Add tenant-configurable policy versions and formal policy change approval |
| 5 | AI Board | Board cadence, decision packets, quorum voting, rejection and workflow wake/cancel behavior | Persist full board sessions and run an independent challenge model with evals |
| 6 | Company memory | Temporal node/edge service, decision links and lessons repository | Add document ingestion, embeddings, retrieval and outcome-based learning jobs |
| 7 | Infrastructure | Durable workflows, event store, atomic outbox, retries, signed delivery, dead letter and telemetry | Add warehouse/read models, load testing and tested disaster recovery |
| 8 | Finance engine | Budget reservation, balanced-journal checks and mandatory execution reconciliation | Route every legacy finance module through the authoritative ledger |
| 9 | Product experience | `/control-room`, secure `/login`, session control and live Company Health API | Replace duplicated legacy dashboards with role-specific operational read models |
| 10 | Apple-level design | Decision-first navigation, Arabic login and transparent execution states | Consolidate CSS/tokens and complete accessibility testing |
| 11 | Performance | Explicit p75/p95 targets, correlation telemetry, latency/error metrics and AI cost records | Add real-user monitoring, budgets and automated regression gates |
| 12 | Competitive moat | Technical/data/workflow/governance/knowledge/regional moat encoded in blueprint | Produce proprietary outcome datasets and vertical operating packs |
| 13 | Business model | Core/Growth/Enterprise/AI usage/Marketplace model | Validate willingness to pay and instrument unit economics |
| 14 | Global roadmap | Five-phase roadmap and a tracked master epic | Convert later phases into funded releases with owners and dates |

## Core runtime files

```text
lib/company-os/context.ts
lib/company-os/policy.ts
lib/company-os/workflowRuntime.ts
lib/company-os/outboxPublisher.ts
lib/company-os/reconciliation.ts
lib/company-os/knowledgeService.ts
lib/company-os/telemetry.ts
lib/company-os/companyHealth.ts
app/api/company-os/*
app/login/page.tsx
docs/CORE_COMPLETION_RUNBOOK.md
docs/supabase-world-class-os-v2.sql
docs/supabase-core-completion.sql
docs/supabase-security-hardening.sql
```

## Production-compatible migration order

```text
1. database/schema.sql (verify existing operational schema)
2. docs/supabase-schema.sql
3. docs/supabase-multitenant.sql
4. docs/supabase-world-class-os-v2.sql
5. docs/supabase-core-completion.sql
6. docs/supabase-security-hardening.sql
```

The v2 migration preserves the existing production `opportunities.id TEXT` contract. The final hardening migration removes permissive legacy policies, enforces JWT tenant claims, moves pgvector out of `public`, and restricts authoritative event writes to the service role.

## Non-negotiable release gates

- No material action without an authenticated actor, tenant and policy decision.
- No action marked complete without external evidence and reconciliation.
- No financial result sourced from a department report when it conflicts with the ledger.
- No model allowed to both recommend and solely approve a material decision.
- No workflow considered durable until it survives process restart and resumes idempotently.
- No production claim until Supabase Security Advisor is clear and cross-tenant tests pass.
- No enterprise launch without a backup restore test, incident runbook and measured RPO/RTO.
