# Personal owner access setup

The personal installation must not grant OWNER access to anonymous visitors.

Configure these server-side values in the hosting environment:

- `ORVANTA_PERSONAL_MODE=true`
- `ORVANTA_OWNER_ACCESS_KEY`: a long private code used only when pairing a device.
- `ORVANTA_OWNER_COOKIE_SECRET`: a separate long random value used to sign the HttpOnly device cookie.
- `API_SECRET_KEY`: trusted internal service calls.
- `CRON_SECRET`: scheduler calls.

The owner opens `/login`, enters the private device-pairing code once, and receives a signed HttpOnly cookie valid for up to one year. The code itself is not stored in the browser.

Changing the server access code changes what is accepted for future logins after deployment. Existing signed device cookies remain valid until they expire, the device is locked, or the cookie-signing secret is rotated. The header control can lock the current device immediately.

Do not deploy personal mode without the access code and signing secret. Production readiness must remain false when the gate is not configured.

## Changing a code in Vercel

1. In the `candy-agents-v3-vercel` project, update `ORVANTA_OWNER_ACCESS_KEY` as a server-side environment variable. Enter the exact code without surrounding quotes or whitespace.
2. Select the environment used by the deployment. Production and Preview have separate settings; check for branch-specific Preview overrides. Configure the separate `ORVANTA_OWNER_COOKIE_SECRET` in each environment where owner login is used.
3. Create a new deployment containing the login fix and the updated environment values. Updating an environment variable does not update deployments that already exist.
4. Open the new deployment's URL or its current branch/production alias. An older deployment-specific URL continues to serve the older code and environment snapshot.

Login accepts any nonempty configured string of up to 128 characters when it matches exactly (after trimming the submitted form value). A configured code shorter than 12 characters still raises a nonblocking strength warning in system readiness. That warning must not prevent the owner from signing in to change the code.
