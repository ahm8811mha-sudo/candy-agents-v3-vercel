# Orvanta

**Orvanta** is an AI Business Operating System built with Next.js, OpenAI, and durable server-side Supabase persistence.

Tagline:

```txt
AI Operating System for Business
```

The product direction is not “a chatbot with departments”. The target operating loop is:

```txt
Idea → Feasibility → Approval → Execution → KPI → Action Queue → Scaling / Hold / Kill
```

## Brand Identity

Orvanta uses an abstract **O/V monogram**:

- `O` = operating system, governance loop, business core.
- `V` = vision, velocity, value, venture.
- Blue → teal gradient = intelligence, trust, and operational clarity.

Core brand files:

```txt
public/orvanta-logo.svg
public/orvanta-mark.svg
components/OrvantaLogo.tsx
app/brand.css
app/orvanta-logo-final.css
app/icon.svg
```

The full logo is stored as production-safe vector paths so it renders consistently in Safari, PWA mode, and social previews without depending on external fonts or embedded bitmap images.

## Agent Flow

```txt
Orvanta AI System
├── Owner Decision Center
├── CEO Agent
├── Financial Department / Ledger
├── Marketing Department
├── Operations Department
├── Supply Chain / Procurement
├── Government Relations
├── CRM / Sales
└── Governance / Audit
```

The main screen runs the company flow:

1. User submits one company request or idea.
2. Finance reads the double-entry ledger and returns budget, ROI, and financial risk.
3. Marketing returns market analysis, target audience, strategy, and KPIs.
4. Operations returns execution plan, resources, timeline, and steps.
5. Supply Chain returns inventory, suppliers, logistics, and optimization.
6. CEO Advisor reviews all reports and returns the final decision.
7. Governance sends gated items to the unified decision center.
8. Once an `IDEA` is approved, the system creates an execution project, tasks, KPIs, business actions, memory, and audit trail.
9. The Action Queue shows what happened after approval and what is blocked by approval or integration.

Core files:

```txt
lib/aiCompany.ts
lib/companyExecutionSystem.ts
lib/businessBrain.ts
lib/accountingSystem.ts
lib/company/ledger.ts
lib/company/actionQueue.ts
lib/company/ideas.ts
lib/company/ideaExecution.ts
lib/company/governance.ts
lib/company/productionReadiness.ts
lib/integrations/googleWorkspace.ts
lib/integrations/companyActionExecutor.ts
components/OrvantaLogo.tsx
components/ActionQueuePanel.tsx
app/api/company/route.ts
app/api/company-execution/route.ts
app/api/company/actions/route.ts
app/api/company/actions/execute/route.ts
app/api/integrations/status/route.ts
app/api/approvals/decisions/route.ts
docs/OPERATING_MODEL.md
docs/CONSULTING_AUDIT_ACTION_PLAN.md
docs/IMPLEMENTATION_STATUS.md
docs/PROJECT_AUDIT_2026-07.md
docs/GOOGLE_WORKSPACE_INTEGRATION.md
```

## Environment

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>

AUTH_ENABLED=true
API_SECRET_KEY=<strong internal api secret>

GOOGLE_INTEGRATIONS_ENABLED=false
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

Optional Google Workspace defaults:

```env
GOOGLE_GMAIL_SENDER=owner@example.com
GOOGLE_DEFAULT_REVIEW_EMAIL=owner@example.com
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_NAME=Orvanta Action Queue
GOOGLE_SHEETS_TAB=Actions
GOOGLE_DRIVE_FOLDER_ID=
```

Important security rule:

- Server writes require `SUPABASE_SERVICE_ROLE_KEY`.
- Do not use `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for governance, approvals, ledger, audit, or execution writes.
- Keep `AUTH_ENABLED=true` in production.
- `/api/health` exposes production readiness checks. Production should not be considered ready unless `productionReady=true`.
- Google OAuth secrets and refresh tokens must remain server-only and must never use a `NEXT_PUBLIC_*` name.
- Keep `GOOGLE_INTEGRATIONS_ENABLED=false` until OAuth is configured and tested, then set it to `true`.
- For existing linked deployments where the flag is absent, complete OAuth credentials activate the connector automatically; an explicit `false` always remains a hard kill switch.

Without Supabase, the app still runs in memory/demo mode. That is acceptable for development only. Production needs Supabase persistence.

## Google Workspace Integrations

The first production integration layer connects governed Action Queue items to Gmail, Google Sheets, and Google Drive:

```txt
SALES_OUTREACH          → Gmail draft
EMAIL_SEND              → Gmail send
SUPPLIER_SHORTLIST      → Google Sheets append
MARKETING_CAMPAIGN_DRAFT → Google Drive artifact
```

Generate a user OAuth refresh token locally:

```bash
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." npm run google:oauth
```

Full configuration, scopes, safety behavior, and acceptance tests:

```txt
docs/GOOGLE_WORKSPACE_INTEGRATION.md
```

## Database

For the production company OS persistence layer, run:

```txt
docs/supabase-schema.sql
```

If older `database/*.sql` files were already applied to your Supabase project, run the hardening override after them:

```txt
database/production-hardening.sql
```

The legacy SQL files still exist for older app tables and local experiments:

```txt
database/schema.sql
database/inbox.sql
database/policies.sql
database/seed.sql
```

Do not expose sensitive company tables to public anon writes in production.

## Run Locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm run typecheck
npm run test
npm run build
```

Health endpoint:

```txt
/api/health
```

Integration readiness endpoint:

```txt
GET /api/integrations/status
```

Company API:

```txt
POST /api/company
{ "request": "ابغى ميزانية لإطلاق متجر الكتروني بميزانية 100,000 ريال" }
```

Execution API:

```txt
POST /api/company-execution
{ "request": "اعتماد مشروع متجر إلكتروني بميزانية 50,000 ريال وتحويله إلى مشروع ومهام" }
```

Decision center API:

```txt
GET /api/inbox
POST /api/approvals/decisions
{ "id": "apr-...", "decision": "APPROVED" }
```

Action Queue API:

```txt
GET /api/company/actions
POST /api/company/actions
{ "id": "<action-id>", "status": "RUNNING" }

POST /api/company/actions/execute
{ "id": "<action-id>" }
```

## Consulting Audit

The current project critique, risks, and 30/60/90-day roadmap are stored at:

```txt
docs/PROJECT_AUDIT_2026-07.md
docs/CONSULTING_AUDIT_ACTION_PLAN.md
docs/IMPLEMENTATION_STATUS.md
```

The highest-priority implemented fixes are:

```txt
Approved IDEA → Project + Tasks + KPIs + Business Actions + Business Memory + Audit Log
Business recommendation → confidence + assumptions + evidence + blockedBy
Manual transaction → balanced Ledger entry
Action → governed status transition
Global Orvanta identity → sidebar + topbar + mobile + PWA + error/loading states
Action Queue → Gmail + Sheets + Drive governed execution
```

## iOS App

An initial native SwiftUI app is included at:

```txt
ios/CandyAgents/CandyAgents.xcodeproj
```

The iOS app follows the intended product flow:

1. The business owner writes one request.
2. AI employees execute the request through `/api/agents/pipeline`.
3. The app returns one final delivery with optional employee details.

Open the project in Xcode, run the `CandyAgents` scheme, then paste the Vercel deployment root URL in the service URL field. If the field is empty, the app uses a local demo response so the experience can be tested before API setup.
