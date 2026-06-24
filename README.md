# Candy Agents

AI Business Operating System built with Next.js, OpenAI, and optional Supabase logging.

## Agent Flow

```txt
AI System
├── Financial Department
├── Marketing Department
├── Operations Department
├── Supply Chain Department
└── CEO Advisor
```

The main screen now runs the company flow:

1. User submits one company request.
2. Accounting returns budget, cost allocation, ROI, and financial risk.
3. Marketing returns market analysis, target audience, strategy, and KPIs.
4. Operations returns execution plan, resources, timeline, and steps.
5. Supply Chain returns inventory, suppliers, logistics, and optimization.
6. CEO Advisor reviews all reports and returns the final decision.

Core files:

```txt
lib/aiCompany.ts
app/api/company/route.ts
database/schema.sql
```

## Environment

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Supabase is optional. Without it, the app still runs and uses local demo data. With Supabase configured, agent runs are stored in `ai_logs` and the company inbox.

## Database

Run the SQL files in this order:

```txt
database/schema.sql
database/inbox.sql
database/policies.sql
database/seed.sql
```

The schema includes explicit `grant` statements for the agent log tables because newer Supabase projects may not expose new public tables through the Data API by default.

## Run Locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm run typecheck
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
