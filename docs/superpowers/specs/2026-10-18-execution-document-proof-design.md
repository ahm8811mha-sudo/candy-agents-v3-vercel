# Execution proof by document — design

Status: proposed, awaiting the owner's answers to the questions at the end.
Plan: `docs/superpowers/plans/2026-10-18-execution-document-proof.md`. Where the
plan's "Decisions" section words a point differently (server-only policies in
4.1, sealing in 4.2, two new arguments in 4.7, the snapshot in 4.1a), the plan
holds the current call and gives the reason.
Author's calls are marked **[call]**; everything else is either the owner's
stated intent or a fact found in the repository, with where it was found.

---

## 1. Intent

A real-world step — a commercial registration, a paid government fee, a signed
contract — closes only when the owner confirms it with proof. That rule is
enforced by the database (`orvanta_update_task_status`, migration
`20260907122056_idea_foundation_redesign.sql`) and it is the core promise of
the system: *the work is not done because an agent wrote the paperwork.*

Today the proof is **ten characters of free text that nothing checks.** The
owner can type «تم التنفيذ» and close a commercial-registration task. The
promise is enforced at the door and not checked inside.

The proof should be the document itself: stored privately, fingerprinted, read
by the system, and its key facts shown to the owner *before* they confirm — so
the record says what actually happened, and can be checked later by anyone with
access.

### Why now

The pieces already exist and are half-connected (section 3). The owner adopted
a redesign whose project screens make the "confirm real execution" action
prominent, so the weakness of a text-only proof is now in front of them on
every real-world step.

---

## 2. Goals, non-goals, anti-goals

### Goals

1. When confirming a real-world step, the owner can attach the documents: PDF,
   JPEG, PNG or WEBP, government paperwork or not — a registration, a receipt, a
   bank letter, a signed contract.
2. The document is stored privately, scoped to the tenant, with a SHA-256
   fingerprint recorded at upload.
3. The system reads it and shows the key facts — document number, issuer,
   holder name, issue and expiry dates — with a confidence, **before** the
   owner presses confirm.
4. The confirmation record links the document, its fingerprint, and the facts
   *as the owner saw them*, frozen at that moment.
5. A government document attached as proof can, at the owner's choice, also
   enter Government Relations, so its expiry is tracked and its renewal is
   scheduled, without a second upload.
6. Up to 10 files per proof, 20 MB each. **[call]** — 20 MB covers a
   multi-page scanned PDF or a full-resolution phone photo, and stays well
   under the model's own input limits.

### Non-goals

- Not a general document library. Documents enter through a task's
  confirmation (and, as today, through Government Relations).
- Not a second document pipeline. This builds on the existing one.
- No change to who may confirm: owner or admin, in a human session, as today.

### Anti-goals — a failure even if every test passes

- **A document reachable without the owner's session.** No public bucket, no
  anonymous read policy, no long-lived or guessable link.
- **Extraction closing a task by itself.** The reading is advice to the owner.
  It never confirms anything. Only the owner's press of confirm does, through
  the existing database function.
- **A confirmation that outlives its document.** If the record says a document
  was attached, the document must exist and match the recorded fingerprint.
- **Sending owner documents to a model provider the owner has not agreed to.**
  See question 4.

---

## 3. What exists today — and what is broken

Found while exploring; each item names where.

### Already built, reusable

- **`lib/governmentRelationsV2.ts`** has a full document pipeline:
  - a private Supabase Storage bucket, `government-documents`, created on demand
    (`ensureBucket`), with tenant-scoped object paths;
  - a SHA-256 fingerprint of every file (`hashFile`), stored as `content_hash`;
  - extraction through the OpenAI Responses API with native PDF and image input
    (`analyzeWithOpenAI`), returning structured fields and a confidence;
  - a regex fallback for text files with Arabic patterns
    (`fallbackAnalysis`: «تاريخ الإصدار», «تاريخ الانتهاء», «الرقم الضريبي»);
  - per-type field lists: commercial registration, zakat and tax certificate,
    chamber subscription, municipal licence, work permit, investment licence;
  - a `NEEDS_REVIEW` status whenever fields are missing or confidence is low.
- **Production has `OPENAI_API_KEY` configured** — read from the live
  `/api/health` readiness gate `openai-key: PASS`, 2026-10-18.
- **The confirmation path** is one atomic database function that writes the
  task and the audit row together. The proof is stored as
  `metadata.proofNote` with `proofVersion: 2`.

### Broken or unknown — the design has to absorb these

1. **The document tables are not in the migrations.**
   `gov_documents`, `gov_document_files` and `gov_document_extractions` are
   created only in `database/schema.sql`. The columns the code writes —
   `tenant_id`, `storage_path`, `content_hash`, `analysis_status`,
   `automation_status`, among others — are added only by
   `docs/supabase-government-relations-v2.sql`, which is a document, not a
   migration. Neither runs on its own.

2. **`database/schema.sql` grants the anonymous role read access to every
   document.** It creates `for select to anon, authenticated using (true)` on
   `gov_documents`, `gov_document_files` and `gov_document_extractions`.
   Correction, checked after this was first written: this application has
   never sent the anonymous key to a browser. No client code reads it (its
   only reference is a server-side readiness check), git history shows it was
   only ever read in `lib/supabase.ts` on the server, and the live login
   bundle (10 chunks, about 619 KB) contains neither a key nor the project
   reference. So if that file was ever applied to production and the v2 file
   was not, the documents are readable by anyone holding the anonymous key
   from elsewhere (a Supabase anonymous key is designed to be public), not by
   every visitor of this site. Still a hole to close; smaller than first
   stated. The v2 file drops those policies, so the real state depends on
   which files were run by hand, in which order.

3. **Production has a document schema nobody here has seen.** The migration
   `202607150003_database_advisor_hardening.sql` was generated from production's
   own database advisor report. It creates indexes, with no existence check, on
   `gov_renewal_cases`, `gov_renewal_events`, `gov_document_field_evidence` and
   `gov_documents.current_renewal_case_id`. **None of these is defined anywhere
   in the repository or its git history** (verified with `git log --all -S`).
   So production almost certainly has the document tables, in a shape that
   includes tables this repository has never described — and
   `gov_document_field_evidence` likely holds text read from documents.

   That shape cannot be read from here: the database timed out on every attempt
   from the design session, and the `Production Verification` workflow — which
   would have checked — has **never run its checks**. Its 2026-10-12 run
   reported success but skipped every step, because its GitHub secrets are not
   configured.

   The migration chain cannot be replayed on an empty database either: the
   hardening migration would fail on the undefined tables. So "tables absent"
   is not a state that can be tested; "present, in an unseen shape" is the one
   to design for.

4. **Uploads above ~3.3 MB fail.** The pipeline receives the file as base64
   inside a JSON body. Vercel Functions reject request bodies over **4.5 MB**
   with `413 FUNCTION_PAYLOAD_TOO_LARGE` (source: vercel.com/docs/functions/
   limitations, "Request body size"), and base64 inflates a file by a third.
   A phone photo of a document routinely exceeds this.

---

## 4. Design

### 4.1 Close the anonymous path to every document table **[call]**

Ships first, independently of the proof feature, because it is a security fix
in its own right.

Because production holds document tables this repository cannot name (section
3, item 3), the migration does **not** work from a fixed list. It enumerates
every table whose name starts with `gov_` that actually exists in `public`, and
for each one:

- enables row level security;
- **drops every existing policy by enumeration** (the technique the v2 file
  already uses), which removes the anonymous `using (true)` policies whatever
  their names;
- recreates the tenant-scoped policies for `authenticated` on tables that carry
  `tenant_id`, and leaves the rest readable by `service_role` only;
- `revoke all … from anon`;
- grants `service_role`.

It also forces the storage bucket to `public = false`, on conflict and not only
on create.

The existing `supabase/tests/rls_regression.sql` already lists
`gov_documents` and `gov_document_extractions` as protected; it is extended to
assert that **no** `gov_` table grants anything to `anon`, so the check covers
the tables nobody has seen.

**This cannot be verified as shipped from this repository alone.** Applying it
proves nothing until something reads production's policies afterward. That
needs the owner (question 1).

### 4.1a Production's schema becomes visible

The `Production Verification` workflow gains a read-only step that writes the
list of `gov_` tables, their columns and their policies to the run summary. Once
its secrets are configured, the unseen shape becomes a fact, and every later
change is designed against it rather than guessed.

A workflow run that skipped its checks must no longer look like one that
passed: when the secrets are absent it raises a warning and writes "nothing was
verified" to the run summary.

### 4.2 A proof is its own record, never a government document **[call]**

Real-world steps are not only government paperwork. `lib/company/executionHonesty.ts`
treats bank accounts, payments, purchases, supplier contracts and paid
subscriptions as real-world too. The government pipeline cannot hold those: its
rows must carry a `document_type` from `gov_document_types`, its prompt only
knows Saudi government documents, and everything else falls into
`OTHER_GOVERNMENT_DOCUMENT`.

And a proof stored as a government document would be at the mercy of the
Government Relations screen, where the manager role — below owner and admin —
can `delete-document` (removing the stored files), `update-document` (swapping
the current file) and `preview-file`. A confirmation could then outlive its
document, which is anti-goal 3.

So a proof is its own record:

- **`execution_proofs`** — one per confirmation: tenant, task, the actor, the
  note, the facts as read, the facts as attested, and when.
- **`execution_proof_files`** — one row per file: storage path, size, type,
  SHA-256 fingerprint.
- Both are **append-only**. No role but the service role may update or delete
  them, and the application never does. Nothing in Government Relations can
  reach them.
- Files live in a **separate private bucket, `execution-proofs`**, so no code
  path written for government documents can touch them.

The fingerprinting, the size and type checks, and the way the model is called
are reused from `lib/governmentRelationsV2.ts`; its tables are not.

### 4.3 Several files per proof **[call]**

A contract photographed page by page, or a receipt with its invoice, is several
files. A proof holds **up to 10 files, 20 MB each**. Each file is fingerprinted.
Reading runs per file and the facts are merged, with the file each fact came
from kept beside it.

### 4.4 Upload straight to storage

The browser never sends a file through a function body:

1. The client asks the server for an upload slot. The server checks the owner
   session and returns a **short-lived signed upload URL** for a path under the
   tenant and the task. (`createSignedUploadUrl` and `uploadToSignedUrl` are in
   the type definitions of the installed `@supabase/supabase-js` 2.108.2.)
2. The browser uploads the file directly to storage with that URL.
3. The client tells the server the path. The server downloads the object,
   fingerprints it, checks type and size, and reads it.

The function bodies carry only paths and small JSON, so the 4.5 MB limit no
longer bounds a document. **[call]**

The Government Relations upload moves to the same flow, which removes its
~3.3 MB ceiling as a side effect.

### 4.5 Reading

The model call reuses the pattern of `analyzeWithOpenAI` with a prompt for
proofs, not government documents only. It asks for: what kind of document it
is, its number or reference, the issuer, the parties, the dates, and any amount
and currency.

The facts are **advice**. They are shown; they never change a task's state.

When no provider is configured, the owner has not allowed reading (question 4),
or reading fails, the files are still stored and fingerprinted, and the owner
sees «لم تُقرأ البيانات آلياً» with the files available to open. A missing
model never blocks a confirmation.

### 4.6 The owner checks, corrects, then confirms **[call]**

On a real-world step the owner:

1. attaches the files;
2. sees the facts, each with its confidence and the file it came from, with any
   disagreement flagged: a holder that is not `COMPANY_LEGAL_NAME`, a document
   already expired, or — when the task has approved funding — a paid amount
   that differs from it;
3. **corrects any fact the model misread.** Both versions are kept: the
   reading as `factsRead`, the owner's version as `factsAttested`. What is
   frozen into the confirmation is what the owner attested, because that is
   what they are confirming;
4. writes the note;
5. confirms.

A misread expiry date therefore never silently drives a renewal schedule: the
owner saw it and either kept or corrected it.

### 4.7 The confirmation stays one atomic call

`orvanta_update_task_status` gains one argument, the proof id. Inside the same
transaction it checks that the proof belongs to this tenant and this task, that
it has at least one file, and records in the task's metadata:

- `proofVersion: 3`
- `proofId`
- `proofFileSha256s` — read from the file rows, never from the client
- `proofFacts` — the attested facts, frozen

The audit row records the same. A text-only confirmation keeps working exactly
as today, as `proofVersion: 2`, unless question 3 makes a document mandatory for
that kind of step.

### 4.8 Seeing the proof later

A confirmed step shows its proof: the note, the attested facts, what the model
read where it differs, and an "open" action per file that fetches a
**short-lived signed download URL** after the session check. No document URL is
ever stored or rendered without that check.

### 4.9 Government Relations, by copy and by choice **[call]**

When a file is read as a government document with good confidence, the owner
is offered "also track it in Government Relations". Accepting creates a
**separate** government document with **its own copy** of the file, through
the existing `uploadAndAutomateGovernmentDocument`, so expiry tracking and
renewal start without a second upload.

The proof never depends on that copy. Deleting or replacing the government
document cannot touch the proof. Storing the file twice is the price of that
independence, and it is paid on purpose.

---

## 5. Constraints

- The repository is public. No secret, key or real document in it.
- Schema changes only through `supabase/migrations/`. `database/schema.sql` is
  never applied.
- The confirmation stays one atomic database call. No second write after it
  that could fail and leave a confirmed task pointing at nothing.
- Hobby plan: functions run at most 300 s. Reading a multi-page PDF runs inside
  one request and must stay within that.
- Owner access is a signed cookie, not Supabase Auth. Storage is reached only by
  the server with the service role; the browser holds nothing but the
  short-lived signed URLs.

---

## 6. Left to the builder

- Screen layout of the attach-and-review step, within the design law in
  `CLAUDE.md`.
- Exact Arabic copy for states and errors.
- How the extraction is surfaced while it runs (it can take several seconds).
- Test structure, provided the anti-goals in section 2 each have a test.
- Which facts to compare against company records beyond the legal name.

---

## 7. Questions only the owner can answer

These change what gets built. They are carried into the stress-test step and
put to the owner in one message. The first two block the work; the rest shape
it.

1. **May the system read production's schema?** Configure the three GitHub
   secrets the `Production Verification` workflow already expects
   (`PRODUCTION_DB_URL`, `PRODUCTION_SUPABASE_URL`,
   `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`), or provide a schema dump. Without
   one of them the security fix in 4.1 can be applied but never verified, and
   the unseen tables stay unseen.
2. **If anonymous read access turns out to have been live, do you want an
   exposure review?** Saudi Arabia's Personal Data Protection Law carries
   breach-notification duties. Whether a review is needed depends on whether
   the `schema.sql` policies ever reached production, which section 4.1a is
   designed to find out.
3. **Required or optional?** Should documents be *required* for some
   real-world steps — for example anything that names a registration, licence,
   contract or payment — or always optional, with the note alone still
   accepted?
4. **May documents leave the country for reading?** Reading uses OpenAI, a
   provider outside Saudi Arabia. A commercial registration carries personal
   data, the holder's name and identity. Is sending these documents to OpenAI
   acceptable, or should reading stay off until a provider you choose is
   configured? Proofs are stored and fingerprinted either way.
5. **Mismatch: warn or stop?** When a fact disagrees with the company's records
   — the holder is not the company, the document is expired, the paid amount
   differs from the approved funding — should the system warn and let you
   confirm, or refuse?
6. **Who may open a proof?** The owner only, or admins as well? (Today the
   manager role can open every government document; proofs are deliberately
   outside that screen.)
7. **How long are proofs kept?** Indefinitely, or deleted after a period?

---

## 8. Calls the author made, for the owner to check while reading

- 4.1 — the security migration works over every `gov_` table found, not a
  fixed list, because production holds tables this repository cannot name.
- 4.2 — a proof is its own append-only record in its own private bucket, never
  a government document, so nothing in Government Relations can delete it.
- 4.3 — up to 10 files per proof, 20 MB each.
- 4.4 — files go straight from the browser to storage; the Government Relations
  upload moves to the same flow and loses its ~3.3 MB ceiling.
- 4.6 — the owner can correct what the model read; both versions are kept, and
  the owner's version is what the confirmation freezes.
- 4.9 — Government Relations gets its own copy, only when the owner chooses.
