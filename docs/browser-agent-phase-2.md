# Browser Agent Phase 2 and 3

Implemented in this batch:

## Orvanta app
- Persistent session store: `lib/operatorSessions.ts`
- Session API: `app/api/operator-sessions/route.ts`
- Runner proxy API: `app/api/browser-runner/route.ts`
- Operator UI: `components/OperatorSessionPanel.tsx`
- Government Relations integration: `components/GovernmentRelationsConsole.tsx`
- Supabase schema: `docs/supabase-operator-sessions.sql`

## Remote runner
- Package: `remote-runner/package.json`
- Service entrypoint: `remote-runner/server.js`
- Dockerfile: `remote-runner/Dockerfile`

## How it works
1. Create an operator session in Government Relations.
2. Save prepared field values and checklist items.
3. Send the session to the remote runner.
4. The remote runner opens the target URL in Chromium.
5. Orvanta can refresh and display a browser screenshot.

## Required environment variables in Orvanta
- `BROWSER_RUNNER_URL=https://your-runner-host`
- `BROWSER_RUNNER_SECRET=your-shared-secret` if configured on the runner

## Required environment variables in remote runner
- `PORT=8787`
- `RUNNER_SECRET=your-shared-secret` optional but recommended
- `HEADLESS=false` for visible browser on a desktop/VPS, or default headless mode for hosted workers

## What remains intentionally manual
- Any protected identity review.
- Any final official commitment.
- Any payment or final filing step.

## Current limitation
The runner currently supports opening the page and returning screenshots. Controlled field writing and click actions should be added only with explicit review gates and field allowlists.
