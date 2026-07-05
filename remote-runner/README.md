# Orvanta Remote Runner

This folder is reserved for the external runtime used by the Browser Agent.

Why external:
- Vercel serverless functions are not suitable for a long-running visible browser.
- Browser sessions need a separate service with memory, screenshots, and controlled lifecycle.

Target behavior:
- Start a visible browser session.
- Open the target URL.
- Capture screenshots for the Orvanta UI.
- Fill only ordinary business fields after the user starts the session.
- Stop at protected review points.
- Never store private sign-in data.

Environment variables:
- RUNNER_SECRET
- PORT
- ALLOWED_ORIGIN

Deployment targets:
- Railway
- Render
- Fly.io
- A small VPS

Next files in this folder define the service package and server entrypoint.
