# ORVANTA Government Relations V2

## Purpose

Government Relations is an operating center, not a document folder. Every uploaded government document must become a governed record with an original file, analysis, extracted facts, risks, tasks, and an owner checkpoint.

## Upload contract

1. Authenticate the user and resolve the tenant from the server request context.
2. Validate type and size. PDF, image, and text formats are supported up to 8 MB.
3. Save the original file in the private `government-documents` bucket under a tenant-scoped path.
4. Record file metadata and a SHA-256 content hash in `gov_document_files`.
5. Analyze PDF/image documents with the OpenAI Responses API. The configured model is `OPENAI_DOCUMENT_MODEL`, defaulting to `gpt-4.1-mini`.
6. Persist every extraction attempt, engine, model, latency, confidence, and error.
7. Store the extracted facts in `gov_documents` and set explicit analysis and automation states.
8. Generate follow-up work for Majed, the fixed Government Relations operator.

## Generated work

A successful upload creates or updates:

- A company task assigned to Majed.
- A renewal/compliance task.
- A prepared work session containing the official portal URL and safe copyable fields.
- An external work queue item in `WAITING_OWNER` state.
- A notification and an operational alert when the document is expired, urgent, high risk, or incomplete.
- A company event for audit and downstream processing.

## Safety boundary

Majed may:

- Review the document and extracted data.
- Check official requirements and fees.
- Open the official portal.
- Prepare and fill non-sensitive fields.
- Produce a checklist and recommendation.

Majed must stop before:

- Nafath authentication.
- Password entry.
- OTP or verification-code entry.
- Payment approval.
- Final submission or binding official change.

The owner completes those steps personally. Passwords, OTP values, national-login credentials, and Nafath secrets must never be written in notes or stored by ORVANTA.

## Failure behavior

- The original document and extraction record are persisted before automation proceeds.
- If AI analysis fails, the system records the error, uses a safe rules fallback, and creates a human-review task instead of silently reporting success.
- A stored document is not invalidated by an event-delivery failure.
- An automation component may be marked `PARTIAL`; the dashboard exposes which operation failed.

## API

```text
GET  /api/government-relations
POST /api/government-relations  multipart upload-document
POST /api/government-relations  reanalyze-document
POST /api/government-relations  preview-file
```

All routes require company context. Reads require `VIEWER`; mutations require `MANAGER` or a higher role.

## Database migration

Apply:

```text
docs/supabase-government-relations-v2.sql
```

The migration adds explicit analysis/automation fields, tenant isolation for file and extraction tables, content hashes, performance indexes, and tenant RLS policies.

## Acceptance checks

- A scanned PDF is stored and analyzed without requiring manually entered text.
- The dashboard shows the stored file, extracted fields, confidence, missing fields, risks, and next actions.
- Reanalysis uses the original private file.
- Preview uses a short-lived signed URL and writes an access log.
- The document, file, extraction, tasks, work session, and external queue all carry the same tenant.
- A user from another tenant cannot read, preview, reanalyze, or modify the record.
- No action proceeds past the owner checkpoint automatically.
