# Company Brain security model

## Data boundaries
- Every node, edge, fact, feature, snapshot, recommendation, scenario, plan, skill, and execution record is tenant-scoped.
- Service-role access is limited to server-side repositories and workers.
- Browser clients do not receive service-role credentials.

## Sensitive data
- Passwords, secrets, tokens, authorization headers, cookies, OTPs, session values, and private credentials are redacted before memory ingestion.
- Free-text evidence is stored only when required and is linked to an explicit source.
- Deletion and retention policies must apply to derived facts as well as source records.

## Decision controls
- Confidence is not authorization.
- High-risk recommendations require approval before plan activation or execution.
- Recommendations store evidence, alternatives, risks, and policy outcome.

## Skill controls
- Skills declare permissions and risk level.
- Skills run through the same policy, approval, audit, idempotency, and receipt controls as first-party capabilities.
- Marketplace publication is disabled until signing and review workflows are implemented.

## Model governance
- Prediction and simulation outputs retain model/version identifiers, assumptions, input hashes, observed timestamps, and evaluation results.
- Digital-twin and simulation writes are isolated from operational state.
- Outcome feedback cannot rewrite historical evidence; it creates new learning observations.
