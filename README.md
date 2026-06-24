# Candy Agents

AI Business Operating System built with Next.js, OpenAI, and optional Supabase logging.

## Agent Flow

```txt
AI System
├── Market Analyst Agent
├── Opportunity Agent
├── Decision Agent
└── Execution Agent
```

The main screen runs the full chain:

1. Market Analyst Agent analyzes trends, demand, competition, and initial opportunities.
2. Opportunity Agent ranks the top 3 opportunities by profitability, cost, risk, and speed.
3. Decision Agent chooses one executive decision for the provided budget.
4. Execution Agent turns the decision into tasks, roles, timeline, checkpoints, and KPIs.

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
