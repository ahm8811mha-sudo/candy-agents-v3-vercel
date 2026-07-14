# Company Brain V1

Company Brain V1 adds an evidence-based intelligence layer above Orvanta's operational system without replacing the audited workflow, accounting, approval, integration-receipt, or tenant boundaries.

## Implemented layers

- Enterprise Knowledge Graph: normalized nodes, typed edges, source references, confidence, and redaction before persistence.
- Feature Store: time-stamped entity features with provenance and confidence.
- Company Data Mart: daily facts materialized from operational source tables.
- Digital Twin: company and domain health, maturity, capacity, constraints, and source freshness.
- Decision Intelligence: ranked recommendations with rationale, confidence, alternatives, impact, and evidence.
- Prediction Engine: operational disruption, decision delay, and financial-data blind-spot predictions with probability, confidence, data quality, evidence, and limitations.
- Simulation Engine: governed what-if scenarios with sensitivity, cash impact, profit delta, break-even, and limitations.
- Autonomous Planner: goals converted into phases, tasks, timeline, budget, risks, KPIs, and approval checkpoints.
- Learning Engine: expected-versus-actual outcome events and feature updates.
- Executive BI Narrative: explains drivers, risks, recommended actions, confidence, and freshness rather than only listing metrics.
- Governed Skills Platform: versioned built-in skills, tenant installation, idempotent runs, approval gates, and trusted executors.
- Multi-company-ready schema: all company state is tenant-scoped, while the current product remains a protected personal installation.

## Real execution boundary

Government document upload and analysis already persist the source file and extraction attempt, classify the document, create follow-up work, identify missing fields, monitor expiry, and keep final government-portal submission behind a human checkpoint where OTP, CAPTCHA, payment, legal declaration, or final submission is required.

The skills platform does not run arbitrary marketplace code. Only registered server executors may run. External or high-risk skills must produce an execution receipt or remain behind approval/human checkpoints.

## Honest limits

- Predictions are evidence-based deterministic V1 models until sufficient historical outcomes exist for statistically validated models.
- The digital twin represents currently connected domains; missing source data lowers confidence and is shown explicitly.
- A data mart and feature store are implemented in PostgreSQL. This is not yet a petabyte-scale lakehouse.
- Multi-tenant primitives are present, but commercial onboarding remains disabled in the current personal product.
- Government portals cannot be fully autonomous where the authority requires human identity verification or legal confirmation.
