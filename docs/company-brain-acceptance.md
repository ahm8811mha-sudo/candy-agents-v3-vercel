# Company Brain acceptance gates

The Company Brain layer is considered production-ready only when every gate below passes.

## Real execution
- Government documents can be ingested, classified, persisted, linked to entities, converted into tasks, and monitored for expiry.
- External actions never report success without an integration attempt and receipt.
- Unsupported government submission remains a human checkpoint rather than simulated execution.

## Knowledge graph and memory
- Decisions, projects, suppliers, customers, employees, KPIs, documents, workflows, and integration receipts can become graph nodes.
- Relationships are tenant-scoped and deduplicated.
- Sensitive values are redacted before memory ingestion.
- Facts retain source type, source id, confidence, and observed timestamp.

## Decision intelligence
- Recommendations include rationale, confidence, evidence references, risks, alternatives, and required approvals.
- Recommendations do not auto-execute high-risk actions.
- Outcome feedback updates recommendation quality metrics.

## Prediction and simulation
- Forecasts expose assumptions and confidence intervals.
- Simulations are versioned and reproducible from stored inputs.
- Digital-twin scenarios never mutate production state.

## Autonomous planning
- A goal can produce projects, tasks, milestones, budget, risks, KPIs, dependencies, and approval checkpoints.
- Plan activation is separate from plan generation.
- Activated plans use the existing durable workflow runtime.

## Data platform
- Warehouse facts and dimensions are tenant-scoped.
- Features are versioned, timestamped, and traceable to source data.
- No analytical model may read another tenant's facts.

## Skills platform
- Skills declare permissions, input/output schemas, risk level, and execution mode.
- Skills cannot bypass policy, approval, audit, idempotency, or receipt requirements.
- Untrusted skills are disabled by default.

## UX
- Company Brain is available from the existing primary navigation without creating a second product shell.
- Recommendations, scenarios, plans, and narrative reports use calm, evidence-first cards.
- Empty states clearly distinguish unavailable data from zero values.
