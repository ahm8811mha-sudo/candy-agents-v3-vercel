# Personal owner access setup

The personal installation must not grant OWNER access to anonymous visitors.

Configure these server-side values in the hosting environment:

- `ORVANTA_PERSONAL_MODE=true`
- `ORVANTA_OWNER_ACCESS_KEY`: a long private code used only when pairing a device.
- `ORVANTA_OWNER_COOKIE_SECRET`: a separate long random value used to sign the HttpOnly device cookie.
- `API_SECRET_KEY`: trusted internal service calls.
- `CRON_SECRET`: scheduler calls.

The owner opens `/login`, enters the private device-pairing code once, and receives a signed HttpOnly cookie valid for up to one year. The code itself is not stored in the browser.

Rotating either the cookie-signing secret or the server access code invalidates or prevents future access. The header control can also lock the current device immediately.

Do not deploy personal mode without the access code and signing secret. Production readiness must remain false when the gate is not configured.
