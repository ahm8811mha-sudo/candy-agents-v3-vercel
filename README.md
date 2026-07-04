# Candy Agents

AI Business Operating System built with Next.js, OpenAI, and durable server-side Supabase persistence.

The product direction is not “a chatbot with departments”. The target operating loop is:

```txt
Idea → Feasibility → Approval → Execution → KPI → Scaling / Hold / Kill
```

## Agent Flow

```txt
AI System
├── Owner Decision Center
├── CEO Agent
├── Financial Department
├── Marketing Department
├── Operations Department
├── Supply Chain / Procurement
├── Government Relations
├── CRM / Sales
└── Governance / Audit
```

The main screen runs the company flow:

1. User submits one company request or idea.
2. Finance returns budget, cost allocation, ROI, and financial risk.
3. Marketing returns market analysis, target audience, strategy, and KPIs.
4. Operations returns execution plan, resources, timeline, and steps.
5. Supply Chain returns inventory, suppliers, logistics, and optimization.
6. CEO Advisor reviews all reports and returns the final decision.
7. Governance sends gated items to the unified decision center.
8. Once an `IDEA` is approved, the system creates an execution project, tasks, KPIs, business actions, memory, and audit trail.

Core files:

```txt
lib/aiCompany.ts
lib/companyExecutionSystem.ts
lib/company/ideas.ts
lib/company/ideaExecution.ts
lib/company/governance.ts
app/api/company/route.ts
app/api/company-execution/route.ts
app/api/approvals/decisions/route.ts
docs/OPERATING_MODEL.md
docs/CONSULTING_AUDIT_ACTION_PLAN.md
```

## Environment

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>

AUTH_ENABLED=true
API_SECRET_KEY=<strong internal api secret>
```

Important security rule:

- Server writes require `SUPABASE_SERVICE_ROLE_KEY`.
- Do not use `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for governance, approvals, ledger, audit, or execution writes.
- Keep `AUTH_ENABLED=true` in production.

Without Supabase, the app still runs in memory/demo mode. That is acceptable for development only. Production needs Supabase persistence.

## Database

For the production company OS persistence layer, run:

```txt
docs/supabase-schema.sql
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

## Consulting Audit

The full consulting-level critique and action plan is stored at:

```txt
docs/CONSULTING_AUDIT_ACTION_PLAN.md
```

The highest-priority implemented fix is:

```txt
Approved IDEA → Project + Tasks + KPIs + Business Actions + Business Memory + Audit Log
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
