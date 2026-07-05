# Orvanta Correspondence Email Setup

This document describes the production setup for the Correspondence Center.

## What is already implemented

- Correspondence service layer: `lib/company/correspondence.ts`
- API list/write route: `app/api/correspondence/route.ts`
- Receive endpoint for provider payloads: `app/api/correspondence/receive/route.ts`
- Supabase schema: `docs/correspondence-schema.sql`
- UI page: `app/correspondence-center/page.tsx`

## Required Vercel environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
CORRESPONDENCE_FROM_EMAIL=official@yourdomain.com
CORRESPONDENCE_REPLY_TO=info@yourdomain.com
```

## Supabase setup

1. Open Supabase SQL Editor.
2. Run `docs/correspondence-schema.sql`.
3. Confirm these tables exist:
   - `correspondence_messages`
   - `correspondence_attachments`
   - `correspondence_approvals`
   - `correspondence_contacts`
   - `correspondence_audit_log`

## Provider setup

Use Resend for the first production version.

1. Add your domain to Resend.
2. Verify DNS records.
3. Create an API key.
4. Add the API key to Vercel as `RESEND_API_KEY`.
5. Set `CORRESPONDENCE_FROM_EMAIL` to a verified sender on that domain.

## Receive endpoint

Configure the provider webhook or inbound route to post messages to:

```txt
https://your-vercel-domain.vercel.app/api/correspondence/receive
```

## Current flow

```txt
Incoming provider payload -> /api/correspondence/receive -> Supabase -> Correspondence Center Inbox
Outgoing message -> /api/correspondence action=send -> approval check -> Resend -> Supabase Sent/Failed
Draft -> /api/correspondence action=save -> Supabase Drafts
Approval -> /api/correspondence action=approve -> Supabase Approved
Archive -> /api/correspondence action=archive -> Supabase Archived
```

## Approval rule

Government correspondence requires approval before send. Other types can be sent directly unless `needsApproval` is set.

## Fallback behavior

If Supabase or Resend is not configured, the API returns demo/manual state and send attempts are marked as not configured rather than breaking the app.
