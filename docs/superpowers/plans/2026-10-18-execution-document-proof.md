# Execution Proof by Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real-world step closes with its documents attached, fingerprinted, read, checked by the owner, and sealed into the confirmation in one database transaction.

**Architecture:** Files go from the browser straight to a private Storage bucket through short-lived signed upload URLs. The server downloads each file, checks its real type and size, fingerprints it, optionally reads it with a model, and stores one immutable row per file under a draft proof. `orvanta_update_task_status` seals the proof and freezes the owner's attested facts and the server-side fingerprints into the task in the same transaction that closes it.

**Tech Stack:** Next.js 16 route handlers, `@supabase/supabase-js` 2.108.2 (service role, server only), Postgres 17 (`supabase/migrations/`), OpenAI Responses API through `fetch`, zod, vitest + Testing Library, Playwright for the browser check.

**Spec:** `docs/superpowers/specs/2026-10-18-execution-document-proof-design.md`

## Global Constraints

- Repository is public: no secret, key, real document or production value in code, tests or fixtures.
- Schema only through new files in `supabase/migrations/`; never apply `database/schema.sql`.
- Every new suite in `supabase/tests/` ends with `rollback;` (Production Verification refuses any that does not).
- Up to **10 files per proof, 20 MB (20 971 520 bytes) each**; types **PDF, JPEG, PNG, WEBP** only.
- Bucket `execution-proofs`, `public = false`, never readable by `anon` or `authenticated`.
- Fingerprint is SHA-256, lowercase hex, computed by the server from the stored bytes, never taken from the client.
- The confirmation is one call to `orvanta_update_task_status`; nothing writes after it.
- A text-only confirmation keeps working exactly as today (`proofVersion: 2`).
- Only a human `OWNER` or `ADMIN` session (`systemCall === false`) may start, attach, open or confirm a proof.
- Download links are signed for **60 seconds** and created only after the session check; no document URL is stored.
- Reading never changes a task's state; a missing or failed reading never blocks a confirmation.
- Vercel Hobby: a function runs at most 300 s; request bodies stay small JSON (the 4.5 MB body limit must never bound a document).
- Arabic copy follows `CLAUDE.md`: no em dashes; every field has a visible label; phone controls ≥ 44 px, phone inputs 16 px.

## Decisions this plan makes that the spec left open or worded differently

Each is a deliberate call, listed so the owner can overrule it.

1. **Server-only policies, not tenant policies (spec 4.1).** The app never uses Supabase Auth; owner access is a signed cookie and every query runs as `service_role`. The repository's own pattern for such tables is the deny-all `server_only_no_client_access` policy (`202607150003_database_advisor_hardening.sql:61-82`). Task 3 applies that pattern to every `gov_%` table instead of writing `authenticated` tenant policies nobody would use.
2. **Sealed, not merely append-only (spec 4.2).** A draft proof can be discarded until it is confirmed; once `confirmed_at` is set, a trigger refuses every update and delete, from every role including `service_role`. File rows are never updated at all. This is stronger than "only the service role may change them", which would have let the application's own role edit a sealed proof.
3. **Two new arguments, not one (spec 4.7).** `p_proof_id` and `p_attested_facts`, so the owner's corrected facts are written by the same transaction that seals the proof.
4. **Reading is off by default.** It runs only when `ORVANTA_PROOF_READING=openai` and `OPENAI_API_KEY` are both set. Until the owner answers spec question 4, no document leaves the country.
5. **Defaults for the open owner questions:** documents optional (Q3); a mismatch warns and does not block (Q5); owner and admin may open a proof (Q6); proofs are kept indefinitely (Q7, sealed rows cannot be deleted without a new migration).
6. **The schema snapshot prints structure, not security findings (spec 4.1a).** Workflow summaries of a public repository are public. The snapshot lists `gov_%` tables and columns; whether any is readable anonymously is asserted by a regression suite that fails the run, and is never printed as a list an attacker could read before it is fixed.
7. **The document-access assertions get their own suite** (`supabase/tests/document_access_regression.sql`) instead of extending `rls_regression.sql`, because that suite requires 40 unrelated tables and cannot run on the local harness.

## Review Focus

1. **Double confirm.** A double click or a second tab confirms with the same proof: the second call fails with `PROOF_ALREADY_SEALED`, the API answers 409 with Arabic copy, and the task's metadata is written once. Pinned in Task 5 and Task 10.
2. **The same file attached twice.** Same bytes, same proof: refused with 409 "already attached", not stored twice. Pinned in Task 4 (unique constraint) and Task 8.
3. **A file that lies about its type.** Declared `image/png`, bytes are a PDF, an HTML page or an executable: the sniffed type decides; unknown bytes are refused with 415 and the object is removed. Pinned in Task 6 and Task 8.
4. **Arabic-Indic digits and Hijri dates in what the model read.** `١٤٤٧/٠٣/١٢` must not be taken for a Gregorian date and flagged "expired"; `٤٬٥٠٠٫٠٠` must compare equal to `4500`. Pinned in Task 7.
5. **An abandoned draft.** The owner attaches two files, closes the tab, comes back: starting again on the same task resumes the open draft with its files instead of creating a second one. Pinned in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `.github/workflows/production-verification.yml` | Warns when it verified nothing; prints the `gov_%` structure snapshot; runs the new suites |
| `scripts/sql/gov-structure-snapshot.sql` | Read-only query: `gov_%` tables and columns |
| `scripts/sql-local-check.sh` | Throwaway Postgres: bootstrap, apply listed migrations, run listed suites |
| `supabase/tests/local/bootstrap.sql` | Supabase roles, `storage`/`auth` stubs, the slice of `tasks`/`audit_log`/`company_approvals` the RPC touches, permissive `gov_%` stubs mirroring `database/schema.sql` |
| `supabase/tests/local/chain.txt`, `suites.txt` | What the harness applies and runs, in order |
| `.github/workflows/ci.yml` | New `sql-local` job running the harness on `postgres:17` |
| `supabase/migrations/20261018000100_close_anonymous_document_access.sql` | Every `gov_%` table server-only; bucket forced private |
| `supabase/migrations/20261018000200_execution_proofs.sql` | Proof tables, seal trigger, private bucket |
| `supabase/migrations/20261018000300_task_status_with_proof.sql` | `orvanta_update_task_status` with `p_proof_id`, `p_attested_facts` |
| `supabase/tests/document_access_regression.sql` | No `gov_%` table reachable by `anon`/`authenticated`; bucket private |
| `supabase/tests/execution_proofs_regression.sql` | Seal, limits, v2 and v3 confirmation paths |
| `lib/executionProofs/rules.ts` | Limits, type sniffing, object paths, `ProofError` (pure) |
| `lib/ai/openai.ts` (exists) | Bounded, ledger-recorded OpenAI calls (`callOpenAIResponses`, `callOpenAIChat`) |
| `lib/executionProofs/reading.ts` | Prompt, normalisation, merge, comparison with company records |
| `lib/executionProofs/store.ts` | Drafts, upload slots, registration, views, signed downloads, copy to Government Relations |
| `app/api/tasks/proof/route.ts` | Owner-only HTTP surface for the store |
| `app/api/tasks/status/route.ts` | Accepts `proofId` and `attestedFacts` |
| `lib/executionProofs/client.ts` | Browser: upload one file to its signed URL |
| `components/ExecutionProofForm.tsx` | Attach, review, correct, note, confirm |
| `components/ExecutionProofView.tsx` | A sealed proof on a confirmed step |
| `components/ProjectsBoard.tsx`, `components/ActionQueuePanel.tsx` | Replace their duplicated confirm forms with the two components |
| `app/api/government-relations/route.ts`, `components/GovernmentRelationsConsole.tsx`, `lib/governmentRelationsV2.ts` | Government upload through a signed URL (Task 14) |

---

### Task 1: Production Verification stops looking green when it checked nothing

Done in `e81cb9b`: test red then green; YAML parses; the snapshot query ran read-only on a throwaway Postgres 16 and listed only `gov_` tables.

**Files:**
- Modify: `.github/workflows/production-verification.yml:48-57`
- Create: `scripts/sql/gov-structure-snapshot.sql`
- Test: `__tests__/productionVerificationWorkflow.test.ts`

**Interfaces:**
- Produces: a workflow step `Snapshot the document schema`, and the test file Tasks 3 and 4 extend when they add their `run_suite` lines. Ships on its own: it depends on no other task.

- [ ] **Step 1: Write the failing test** (plain text checks; the file is YAML and the repo has no YAML parser dependency)

```ts
const wf = readFileSync(".github/workflows/production-verification.yml", "utf8");
const snapshot = readFileSync("scripts/sql/gov-structure-snapshot.sql", "utf8");
it("warns and says nothing was verified when secrets are missing", () => {
  expect(wf).toMatch(/::warning::/);
  expect(wf).toMatch(/Nothing was verified[^\n]*>> "\$GITHUB_STEP_SUMMARY"/);
});
it("snapshots gov_ structure read-only into the summary", () => {
  expect(wf).toContain("scripts/sql/gov-structure-snapshot.sql");
  expect(snapshot).toMatch(/^begin transaction read only;/m);
  expect(snapshot.trim()).toMatch(/rollback;$/);
  expect(snapshot).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  expect(snapshot).not.toMatch(/pg_policies|role_table_grants/); // decision 6
});
```

- [ ] **Step 2: Run** `npx vitest run __tests__/productionVerificationWorkflow.test.ts`. Expected: FAIL (file missing, no warning).
- [ ] **Step 3: Implement.** In the "Detect" step's else branch replace `::notice::` with `::warning::` and append `echo "### Nothing was verified" >> "$GITHUB_STEP_SUMMARY"` plus one line naming the three missing secrets. Add the snapshot step after the rollback-only check, guarded by `configured == 'true'`, writing a fenced block: `psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 -A -F ' | ' -f scripts/sql/gov-structure-snapshot.sql`. The SQL selects `table_name, column_name, data_type, is_nullable` from `information_schema.columns` where `table_schema='public' and table_name like 'gov\_%'`, ordered.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `ci: say so when production verification checked nothing; snapshot the document schema`.

### Task 2: A local Postgres harness for the migrations this plan adds

**Files:**
- Create: `scripts/sql-local-check.sh`, `supabase/tests/local/bootstrap.sql`, `supabase/tests/local/chain.txt`, `supabase/tests/local/suites.txt`
- Modify: `.github/workflows/ci.yml` (new job `sql-local`)

**Interfaces:**
- Produces: `PGURL=… scripts/sql-local-check.sh` exits 0 only if every migration in `chain.txt` and every suite in `suites.txt` runs with `ON_ERROR_STOP=1`. Without `PGURL` it creates a cluster with `/usr/lib/postgresql/*/bin/initdb` in `mktemp -d`, starts it on port 54329, and stops and deletes it on exit (`trap`).

- [ ] **Step 1: Write `bootstrap.sql`.** Roles `anon`, `authenticated`, `service_role` (`nologin`); schemas `auth`, `storage`; `auth.jwt()` returning `null::jsonb`; `storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[])`. Tables with exactly the columns `20260907122056_idea_foundation_redesign.sql:136-173` touches: `public.tasks(id, tenant_id, title, status, progress_percent, metadata jsonb, updated_at, completed_at, archived_at)`, `public.audit_log(id, tenant_id, actor, role, action, entity_type, entity_id, detail, created_at, metadata jsonb)`, `public.company_approvals(id, tenant_id, type, status, amount numeric, metadata jsonb)`. Permissive stubs for `gov_documents`, `gov_document_files`, `gov_document_extractions`, `gov_document_field_evidence` (all with `tenant_id`) and `gov_renewal_events` (no `tenant_id`), each with `grant select … to anon, authenticated` and a policy `for select to anon, authenticated using (true)`, as `database/schema.sql` creates them. Insert bucket `government-documents` with `public = true`.
- [ ] **Step 2: Write `chain.txt`** listing `supabase/migrations/20260719000100_task_execution_proof_gate.sql` (the real guard trigger) and, as Tasks 3-5 land, their migrations. `suites.txt` starts empty.
- [ ] **Step 3: Run** `scripts/sql-local-check.sh`. Expected: exit 0, "applied 1 migration, ran 0 suites".
- [ ] **Step 4: Add the CI job** `sql-local`: `services.postgres` image `postgres:17` with `POSTGRES_PASSWORD: postgres`, health check `pg_isready`; steps checkout, `sudo apt-get install -y postgresql-client`, `PGURL=postgresql://postgres:postgres@localhost:5432/postgres scripts/sql-local-check.sh`.
- [ ] **Step 5: Commit** `test: a throwaway Postgres harness for new migrations`.

### Task 3: No document table is reachable without the server

**Files:**
- Create: `supabase/migrations/20261018000100_close_anonymous_document_access.sql`, `supabase/tests/document_access_regression.sql`
- Modify: `supabase/tests/local/chain.txt`, `supabase/tests/local/suites.txt`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: suite `document_access_regression.sql` (read-only, ends `rollback;`), run by Production Verification (Task 1) and Database Security (runs every suite).

- [ ] **Step 1: Write the failing suite.** One `do $$` block per invariant, each `raise exception` with the offending names:
  - every `public` table `like 'gov\_%'` has `relrowsecurity`;
  - no row in `information_schema.role_table_grants` for those tables with `grantee in ('anon','authenticated')`;
  - no row in `pg_policies` for those tables except `policyname = 'server_only_no_client_access'` whose `qual` is `false`;
  - `storage.buckets` row `government-documents`, if present, has `public = false`.
- [ ] **Step 2: Add the suite to `suites.txt`, run the harness.** Expected: FAIL naming all five stub tables and the bucket.
- [ ] **Step 3: Write the migration.** Loop over `pg_class` joined to `pg_namespace` where `nspname='public' and relkind in ('r','p') and relname like 'gov\_%'`; for each: `enable row level security`; drop every policy found in `pg_policies` for it (by enumeration, whatever its name); `revoke all … from anon, authenticated`; `grant all … to service_role`; `create policy server_only_no_client_access … for all to anon, authenticated using (false) with check (false)` (copy `202607150003_database_advisor_hardening.sql:65-81`). Then `update storage.buckets set public = false where id = 'government-documents'` guarded by `to_regclass('storage.buckets') is not null`. End with `notify pgrst, 'reload schema';`. Add it to `chain.txt` before the suites run.
- [ ] **Step 4: Run the harness.** Expected: PASS. Re-run it once more: the migration is idempotent, PASS again.
- [ ] **Step 5: Run it in production verification.** Add `expect(wf).toContain("run_suite document_access supabase/tests/document_access_regression.sql")` to `__tests__/productionVerificationWorkflow.test.ts`, see it fail, add the `run_suite` line after `rls` in `production-verification.yml`, see it pass.
- [ ] **Step 6: Commit** `security: close anonymous access to every gov_ table and its bucket`.

### Task 4: Proof tables that seal themselves

**Files:**
- Create: `supabase/migrations/20261018000200_execution_proofs.sql`, `supabase/tests/execution_proofs_regression.sql`
- Modify: `supabase/tests/local/chain.txt`, `suites.txt`

**Interfaces:**
- Produces (used by Tasks 5 and 8):

```sql
create table public.execution_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  task_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  facts_read jsonb,                 -- snapshot taken at sealing
  facts_attested jsonb,
  note text,
  confirmed_by text,
  confirmed_at timestamptz,
  constraint execution_proofs_sealed_complete check (
    (confirmed_at is null and confirmed_by is null)
    or (confirmed_at is not null and confirmed_by is not null
        and facts_attested is not null and length(trim(coalesce(note,''))) >= 10))
);
create unique index execution_proofs_one_open_draft on public.execution_proofs (tenant_id, task_id) where confirmed_at is null;

create table public.execution_proof_files (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.execution_proofs(id) on delete restrict,
  tenant_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  reading jsonb not null,
  created_at timestamptz not null default now(),
  unique (proof_id, sha256)
);
```

- [ ] **Step 1: Write the failing suite** (test tenant `orvanta-test-proofs`, ends `rollback;`). Each case in its own `begin … exception when others then … end` block that raises if the expected error did not occur:
  - insert a draft, a file; a second unsealed draft for the same task fails (one open draft);
  - an eleventh file fails with `PROOF_FILE_LIMIT`;
  - the same `sha256` twice in one proof fails;
  - `update execution_proof_files` fails with `PROOF_FILE_IMMUTABLE`;
  - after `update execution_proofs set confirmed_at=now(), confirmed_by='t', facts_attested='{}', note='0123456789'`: a further update fails with `PROOF_SEALED`, a delete fails with `PROOF_SEALED`, inserting a file fails with `PROOF_SEALED`, deleting a file fails with `PROOF_SEALED`;
  - a draft with no confirmation can be deleted (with its files);
  - `anon` and `authenticated` hold no grant on either table; bucket `execution-proofs` exists with `public = false`, `file_size_limit = 20971520` and exactly the four types.
- [ ] **Step 2: Add to `suites.txt`, run the harness.** Expected: FAIL (tables missing).
- [ ] **Step 3: Write the migration:** the two tables above; RLS on both; `revoke all from anon, authenticated`; `grant all to service_role`; the `server_only_no_client_access` policy on both; indexes on `execution_proofs(tenant_id, task_id)` and `execution_proof_files(proof_id)`. Triggers (`security definer`, `set search_path = ''`): before update/delete on `execution_proofs` raise `PROOF_SEALED` when `old.confirmed_at is not null`, and raise `PROOF_IDENTITY_IMMUTABLE` when an update changes `id`, `tenant_id`, `task_id`, `created_by` or `created_at`; before update on `execution_proof_files` always raise `PROOF_FILE_IMMUTABLE`; before insert/delete on `execution_proof_files` raise `PROOF_SEALED` when the parent is confirmed, and before insert raise `PROOF_FILE_LIMIT` when the parent already has 10 files. Bucket: `insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('execution-proofs','execution-proofs',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types`.
- [ ] **Step 4: Run the harness.** Expected: PASS.
- [ ] **Step 5: Run it in production verification**, the same way as Task 3 Step 5, with `run_suite execution_proofs supabase/tests/execution_proofs_regression.sql`.
- [ ] **Step 6: Commit** `feat(db): execution proofs that seal on confirmation`.

### Task 5: The confirmation seals the proof in the same transaction

**Files:**
- Create: `supabase/migrations/20261018000300_task_status_with_proof.sql`
- Modify: `supabase/tests/execution_proofs_regression.sql`, `supabase/tests/local/chain.txt`

**Interfaces:**
- Produces: `public.orvanta_update_task_status(p_tenant_id text, p_id text, p_status text, p_progress integer, p_actor text, p_actor_role text, p_confirm_real boolean default false, p_proof_note text default null, p_proof_id uuid default null, p_attested_facts jsonb default null) returns jsonb`. New errors: `PROOF_REQUIRES_CONFIRMATION`, `PROOF_NOT_FOUND`, `PROOF_ALREADY_SEALED`, `PROOF_HAS_NO_FILES`.

- [ ] **Step 1: Extend the suite** (the 8-argument body is copied into the harness through the new migration, so v2 behaviour is tested too):
  - v2: owner confirms a `REAL_WORLD` task with a 10-char note and no proof → `DONE`, `metadata->>'proofVersion' = '2'`, no `proofId`;
  - v3: draft with two files → confirm with `p_proof_id` and `p_attested_facts '{"reference":"1010"}'` → `proofVersion = 3`, `proofId` equals the draft id, `proofFileSha256s` equals the two file hashes ordered by `created_at, id`, `proofFacts = p_attested_facts`; the proof row has `confirmed_at`, `confirmed_by`, `facts_attested`, `note`, and `facts_read` equal to the files' readings ordered the same way; the audit row's metadata carries `proofId` and `proofFileSha256s`;
  - the same proof again → `PROOF_ALREADY_SEALED`; task metadata unchanged;
  - a proof of another task, or another tenant → `PROOF_NOT_FOUND`;
  - a draft with no files → `PROOF_HAS_NO_FILES`;
  - `p_proof_id` with `p_confirm_real = false` → `PROOF_REQUIRES_CONFIRMATION`;
  - moving a v3-confirmed task back to `IN_PROGRESS` strips `proofId`, `proofFileSha256s`, `proofFacts` with the existing keys; the sealed proof row is untouched.
- [ ] **Step 2: Run the harness.** Expected: FAIL (function has 8 arguments).
- [ ] **Step 3: Write the migration.** `drop function if exists public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text);` then create the 10-argument function: the existing body verbatim, plus, when `p_proof_id is not null`: require `p_confirm_real`; `select … for update` the proof where `id`, `tenant_id`, `task_id` match, else `PROOF_NOT_FOUND`; `confirmed_at is not null` → `PROOF_ALREADY_SEALED`; aggregate `jsonb_agg(sha256 order by created_at, id)` and `jsonb_agg(reading order by created_at, id)` from its files, none → `PROOF_HAS_NO_FILES`; update the proof (`facts_read`, `facts_attested = coalesce(p_attested_facts,'{}')`, `note = trim(p_proof_note)`, `confirmed_by = p_actor`, `confirmed_at = now()`); merge `proofVersion 3, proofId, proofFileSha256s, proofFacts` into the metadata instead of `proofVersion 2`; add `proofId` and `proofFileSha256s` to the audit metadata; add the three keys to the existing strip list. `revoke all … from public, anon, authenticated; grant execute … to service_role;` on the new signature; `notify pgrst, 'reload schema';`.
- [ ] **Step 4: Run the harness.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): seal the proof inside the confirmation`.

### Task 6: Proof rules

**Files:**
- Create: `lib/executionProofs/rules.ts`
- Test: `__tests__/executionProofRules.test.ts`

**Interfaces:**
- Produces:

```ts
export const PROOF_BUCKET = "execution-proofs";
export const MAX_PROOF_FILES = 10;
export const MAX_PROOF_FILE_BYTES = 20 * 1024 * 1024;
export type ProofMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export class ProofError extends Error { constructor(public code: ProofErrorCode, public status: 400|403|404|409|413|415|503, message: string) }
export type ProofErrorCode = "INVALID_INPUT"|"FORBIDDEN"|"NOT_FOUND"|"SEALED"|"FILE_LIMIT"|"DUPLICATE_FILE"|"TOO_LARGE"|"UNSUPPORTED_TYPE"|"NOT_CONFIGURED";
export function sniffProofMime(bytes: Uint8Array): ProofMime | null;
export function checkDeclaredFile(input: { fileName: string; mimeType: string; sizeBytes: number }): void; // throws ProofError
export function proofObjectPath(tenantId: string, taskId: string, proofId: string, fileName: string, nonce: string): string;
export function isPathOfProof(path: string, tenantId: string, taskId: string, proofId: string): boolean;
```

- [ ] **Step 1: Write the failing tests.** `sniffProofMime`: `%PDF-` → pdf; `89 50 4E 47 0D 0A 1A 0A` → png; `FF D8 FF` → jpeg; `RIFF????WEBP` → webp; `<!doctype html>`, `MZ`, empty → `null`. `checkDeclaredFile`: 20 971 520 bytes passes, 20 971 521 throws `TOO_LARGE` 413; 0 bytes throws `INVALID_INPUT`; `text/plain` throws `UNSUPPORTED_TYPE` 415. `proofObjectPath("Golden Star","task/1","p1","عقد التأسيس.PDF","n1")` is `golden-star/task-1/p1/n1-عقد-التأسيس.pdf`; `isPathOfProof` is false for `golden-star/task-1/p2/…`, for `../` and for a path in another tenant.
- [ ] **Step 2: Run** `npx vitest run __tests__/executionProofRules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `rules.ts`. Path segments reuse the sanitising rules of `safeTenantPart` / `sanitizeFileName` in `lib/governmentRelationsV2.ts:121-129` (move them to `rules.ts` and import them back there).
- [ ] **Step 4: Run.** Expected: PASS; `npx vitest run` whole suite still green.
- [ ] **Step 5: Commit** `feat: proof file rules`.

### Task 7: Reading a proof, and checking it against the company

**Files:**
- Create: `lib/executionProofs/reading.ts`
- Test: `__tests__/executionProofReading.test.ts`

**Interfaces:**
- Consumes (exists since `c518527`, tested in `__tests__/openaiCalls.test.ts`): `callOpenAIResponses({ agentName, model, content: ResponsesInput, timeoutMs }): Promise<{ text, inputTokens, outputTokens, latencyMs }>` from `lib/ai/openai.ts`. It throws on an HTTP or network error and records every call in the usage ledger. Government document reading already uses it.
- Produces:

```ts
// lib/executionProofs/reading.ts
export type ProofFactKey = "documentKind" | "reference" | "issuer" | "parties" | "issueDate" | "expiryDate" | "amount" | "currency";
export type ProofReading = {
  status: "READ" | "NOT_READ" | "FAILED"; engine: "openai" | "none"; model: string | null; latencyMs: number; error: string | null;
  governmentType: string | null; // one of DOCUMENT_TYPES in governmentRelationsV2, when it is one
  facts: Partial<Record<ProofFactKey, { value: string; confidence: number }>>;
};
export type MergedFacts = Partial<Record<ProofFactKey, { value: string; confidence: number; fileId: string }>>;
export type AttestedFacts = Partial<Record<ProofFactKey, string>>;
export type ProofFlag = { code: "HOLDER_NOT_COMPANY" | "EXPIRED" | "AMOUNT_DIFFERS"; fact: ProofFactKey };
export function proofReadingEnabled(env?: NodeJS.ProcessEnv): boolean;
export async function readProofFile(file: { bytes: Uint8Array; mime: ProofMime; fileName: string }): Promise<ProofReading>;
export function mergeReadings(files: Array<{ id: string; reading: ProofReading }>): MergedFacts;
export function compareWithCompany(facts: AttestedFacts, company: { legalName: string | null; approvedFundingSAR: number | null; today: string }): ProofFlag[];
```

- [ ] **Step 1: Write the failing tests** (mock `global.fetch`):
  - `proofReadingEnabled({})` false; `{ OPENAI_API_KEY: "x" }` false; `{ ORVANTA_PROOF_READING: "openai", OPENAI_API_KEY: "x" }` true.
  - `readProofFile` when disabled returns `status: "NOT_READ"`, `engine: "none"` and never calls fetch; when fetch rejects returns `status: "FAILED"` with the message; a model answer is normalised: confidence clamped to 0..1, Arabic-Indic digits converted (`"١٠١٠٢٣"` → `"101023"`, `"٤٬٥٠٠٫٠٠"` → `"4500.00"`), dates kept only as `YYYY-MM-DD` Gregorian (`"1447-03-12"` with a Hijri marker or year < 1900 is dropped from `issueDate`/`expiryDate`, never guessed).
  - `mergeReadings` keeps, per key, the highest-confidence non-empty value and its file id.
  - `compareWithCompany`: holder "شركة النجمه الذهبيه" vs legal name "شركة النجمة الذهبية" → no flag (hamza, ta marbuta, ya, tatweel, diacritics normalised); a different name → `HOLDER_NOT_COMPANY`; `legalName: null` → no holder flag; `expiryDate` before `today` → `EXPIRED`; amount `4500` vs funding `4500.4` → none, vs `5000` → `AMOUNT_DIFFERS` (tolerance 1%); currency other than SAR with funding set → `AMOUNT_DIFFERS`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.** `readProofFile` calls `callOpenAIResponses`, parses the answer with `extractJsonBlock` from `lib/aiStructured.ts`, and builds the content like `analyzeWithOpenAI` (`input_file` for PDF, `input_image` for images, base64 data URL), model `process.env.OPENAI_DOCUMENT_MODEL || "gpt-4.1-mini"`, `timeoutMs: 55_000`, `agentName: "execution-proof"`. The prompt asks, in Arabic, for JSON with the eight keys each as `{ "value", "confidence" }` plus `governmentType`, only what is visible, no national ID numbers, no guessing.
- [ ] **Step 4: Run** the file and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: read proofs and compare them with company records`.

### Task 8: The proof store

**Files:**
- Create: `lib/executionProofs/store.ts`
- Test: `__tests__/executionProofStore.test.ts` (an in-memory fake of the Supabase client: `from().select/insert/delete/eq/is/maybeSingle`, `storage.from().createSignedUploadUrl/download/remove/createSignedUrl`, `storage.getBucket/updateBucket`)

**Interfaces:**
- Consumes: Task 6 rules, Task 7 reading.
- Produces:

```ts
export type ProofActor = { tenantId: string; actorId: string; actorRole: string; systemCall: boolean };
export type ProofFileView = { id: string; fileName: string; mimeType: ProofMime; sizeBytes: number; sha256: string; reading: ProofReading };
export type ProofView = { id: string; taskId: string; sealed: boolean; note: string | null; confirmedAt: string | null;
  files: ProofFileView[]; merged: MergedFacts; attested: AttestedFacts | null; flags: ProofFlag[] };
export async function startProof(actor: ProofActor, taskId: string): Promise<ProofView>;            // resumes the open draft
export async function createUploadSlot(actor: ProofActor, proofId: string, file: { fileName: string; mimeType: string; sizeBytes: number }):
  Promise<{ path: string; token: string; signedUrl: string }>;
export async function registerProofFile(actor: ProofActor, proofId: string, path: string): Promise<ProofView>;
export async function getProof(actor: ProofActor, proofId: string): Promise<ProofView>;
export async function openProofFile(actor: ProofActor, fileId: string): Promise<{ url: string; expiresInSeconds: 60 }>;
```

- [ ] **Step 1: Write the failing tests:**
  - every function throws `ProofError("FORBIDDEN", 403)` for `systemCall: true` and for roles other than `OWNER`/`ADMIN`, before touching the client;
  - `startProof` refuses a task of another tenant (`NOT_FOUND`), a task already `DONE` (`SEALED`), a task that is neither `REAL_WORLD` nor `requiresFunding` (`INVALID_INPUT`); called twice for the same task it returns the same draft with its files (Review Focus 5);
  - `createUploadSlot` refuses a sealed proof, an eleventh file, a declared size over the limit, a declared type outside the four; on success the path satisfies `isPathOfProof` and the bucket was ensured private (`updateBucket` called with `public: false` when `getBucket` reports `public: true`);
  - `registerProofFile` refuses a path outside the proof (`isPathOfProof` false) without downloading; refuses downloaded bytes over the limit (`TOO_LARGE`) or with an unknown signature (`UNSUPPORTED_TYPE`) and removes the object in both cases (Review Focus 3); stores `mime_type` from the sniffed signature, not the declaration; computes `sha256` from the downloaded bytes; maps the unique violation on `(proof_id, sha256)` to `DUPLICATE_FILE` 409 and removes the new object (Review Focus 2); when reading is disabled stores `reading.status = "NOT_READ"`;
  - `getProof` returns `flags` from `compareWithCompany(merged values, …)` with `legalName = process.env.COMPANY_LEGAL_NAME || null` and `approvedFundingSAR` = sum of `company_approvals.amount` where `type='BUDGET'`, `status='APPROVED'`, `metadata->>taskId = taskId`, `metadata->>kind = 'TASK_FUNDING'`; for a sealed proof it uses `facts_attested`;
  - `openProofFile` refuses a file of another tenant and calls `createSignedUrl(path, 60)`.
  - anti-goal 2: across a whole start, slot, register, get sequence with reading enabled, the fake client's `rpc` and any `from("tasks")` write are never called;
  - anti-goal 3: no function in the store ever calls `storage.remove` on a path that already has an `execution_proof_files` row, nor `delete`/`update` on either proof table.
- [ ] **Step 2: Run** `npx vitest run __tests__/executionProofStore.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `getSupabaseAdmin()`; `null` → `ProofError("NOT_CONFIGURED", 503)`. `nonce` for the path is `randomUUID()`. Registration order: download, check, hash, read, insert; any failure after download removes the object.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: execution proof store`.

### Task 9: The proof API

**Files:**
- Create: `app/api/tasks/proof/route.ts`
- Test: `__tests__/task-proof-files-route.test.ts` (mock `requireCompanyContext` and `@/lib/executionProofs/store` the way `__tests__/task-proof-route.test.ts:3-6` does)

**Interfaces:**
- Consumes: Task 8.
- Produces: `POST /api/tasks/proof` with zod-discriminated bodies `{action:"start",taskId}`, `{action:"slot",proofId,fileName,mimeType,sizeBytes}`, `{action:"register",proofId,path}`, `{action:"open",fileId}`, `{action:"copy-to-government",fileId}` (Task 13); `GET /api/tasks/proof?proofId=`. Success `{ ok: true, … }`; failure `{ ok: false, code, message }` with `ProofError.status`. `export const maxDuration = 300;`

- [ ] **Step 1: Write the failing tests:** unauthenticated → the context's own response; a system key → 403 and the store is not called; an invalid body (unknown action, `sizeBytes` not an integer, `proofId` not a UUID) → 400; each action calls its store function with `{ tenantId, actorId, actorRole, systemCall }` from the context; `ProofError("SEALED",409)` → 409 with its Arabic message; an unexpected error → 500 with a generic Arabic message and no stack.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with `requireCompanyContext(req, "EMPLOYEE")` then the store (which enforces owner/admin).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: owner-only proof API`.

### Task 10: Confirming with a proof

**Files:**
- Modify: `app/api/tasks/status/route.ts:6-35`
- Test: `__tests__/task-proof-route.test.ts` (extend)

**Interfaces:**
- Consumes: Task 5 function signature.
- Produces: request body gains `proofId?: string (uuid)` and `attestedFacts?: AttestedFacts` (each value trimmed, ≤ 300 chars, keys limited to `ProofFactKey`).

- [ ] **Step 1: Write the failing tests:** `proofId` is passed as `p_proof_id` and `attestedFacts` as `p_attested_facts`; without them both are `null` (v2 unchanged); `attestedFacts` without `proofId`, or `proofId` without `confirmReal`, → 400 before the RPC; an unknown fact key → 400; RPC error `PROOF_ALREADY_SEALED` → 409 "سُجّل هذا الإثبات من قبل." (Review Focus 1); `PROOF_NOT_FOUND` → 404; `PROOF_HAS_NO_FILES` → 400.
- [ ] **Step 2: Run** `npx vitest run __tests__/task-proof-route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS, the five existing cases still pass.
- [ ] **Step 5: Commit** `feat: confirm a real-world step with its proof`.

### Task 11: Attach, review, correct, confirm

**Files:**
- Create: `lib/executionProofs/client.ts`, `components/ExecutionProofForm.tsx`
- Modify: `components/ProjectsBoard.tsx:151-175,350-366`, `components/ActionQueuePanel.tsx:220-240,440-455` (both replace their own form with the component)
- Test: `__tests__/executionProofClient.test.ts`, `components/ExecutionProofForm.test.tsx`

**Interfaces:**
- Consumes: Tasks 9 and 10 endpoints.
- Produces:

```ts
// lib/executionProofs/client.ts
export async function uploadToProofSlot(slot: { signedUrl: string }, file: File): Promise<void>; // throws Error with Arabic message on non-2xx
// components/ExecutionProofForm.tsx
export default function ExecutionProofForm(props: { taskId: string; onConfirmed: () => void | Promise<void> }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests.**
  - `uploadToProofSlot` sends `PUT` to `signedUrl` with a `FormData` holding `cacheControl: "3600"` and the file under the empty field name, header `x-upsert: false`, and `apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY` only when that variable is set (this mirrors `uploadToSignedUrl` in `@supabase/storage-js` 2.108.2). Today no client code reads that key and it is not in any browser bundle; setting it would put it there for the first time, so it is set only if Task 15 Step 3 shows the upload is refused without it, and only after Task 15 Step 4 shows `document_access` passing in production.
  - `ExecutionProofForm`: the note field has a visible label; with no files and a 10-char note, Confirm posts `{ id, confirmReal: true, proofNote }` with no `proofId` (v2 path); choosing two files calls start once, slot and upload and register per file, and lists both with their size; a file over 20 MB or of another type is refused in the browser with Arabic copy and never uploaded; when a reading has `status: "NOT_READ"` the text «لم تُقرأ البيانات آلياً» shows; each read fact shows an editable field labelled with its name, its confidence and its file name; editing a fact sends it in `attestedFacts` alongside `proofId`; a flag renders as a warning and does not disable Confirm (decision 5); Confirm is disabled while any file is uploading; a 409 shows the server's message.
- [ ] **Step 2: Run** both. Expected: FAIL.
- [ ] **Step 3: Implement.** Files accept `application/pdf,image/jpeg,image/png,image/webp`. Layout and copy follow `CLAUDE.md`: no tinted chips around metadata, no icon tiles, labels on every field, 44 px controls and 16 px inputs on phones (the rules in `app/workspace.css` already give that to `.field-label` children and `.btn-sm`).
- [ ] **Step 4: Run** the two tests and the full suite. Expected: PASS.
- [ ] **Step 5: Browser check.** `npm run build`, `next start` with a local owner code, confirm the server logs the expected Next.js version, then at 390×844 and 1440×900: open a real-world step, attach a PDF and a PNG. Without Supabase the start call answers 503 and the form shows its Arabic error and still allows a text-only confirmation attempt; record that as the local evidence. The full upload path is verified in Task 15.
- [ ] **Step 6: Commit** `feat: attach and review documents before confirming`.

### Task 12: A confirmed step shows its proof

**Files:**
- Create: `components/ExecutionProofView.tsx`
- Modify: `components/ProjectsBoard.tsx` (render it under a task whose `metadata.proofVersion === 3`)
- Test: `components/ExecutionProofView.test.tsx`

**Interfaces:**
- Consumes: `GET /api/tasks/proof?proofId=`, `POST {action:"open"}`.
- Produces: `export default function ExecutionProofView(props: { proofId: string }): JSX.Element;`

- [ ] **Step 1: Write the failing test:** renders the note, each attested fact, and beside a fact the model read differently the read value marked as such; each file shows its name, size and the first 12 characters of its SHA-256; "فتح" posts `open` and calls `window.open(url, "_blank", "noopener")` with the returned URL; no `href` to storage is ever rendered before the click.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: show the sealed proof on a confirmed step`.

### Task 13: Track a proof in Government Relations, by choice

**Files:**
- Modify: `lib/executionProofs/store.ts` (add `copyProofFileToGovernment`), `app/api/tasks/proof/route.ts`, `components/ExecutionProofView.tsx`
- Test: extend `__tests__/executionProofStore.test.ts`, `components/ExecutionProofView.test.tsx`

**Interfaces:**
- Produces: `export async function copyProofFileToGovernment(actor: ProofActor, fileId: string): Promise<{ documentId: string }>;`

- [ ] **Step 1: Write the failing tests:** offered only for a sealed proof's file whose `reading.governmentType` is set and confidence of `documentKind` ≥ 0.7; otherwise `INVALID_INPUT`; it downloads the proof's bytes and calls `uploadAndAutomateGovernmentDocument` with `fileBase64` of them, `documentType = governmentType`, and the attested `issuer`; the proof's rows and object are untouched afterwards (no delete, no update called on `execution_*`); a government upload failure surfaces its message and leaves the proof as it was. The view shows "تتبّعها في العلاقات الحكومية" only on eligible files.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Files above the government pipeline's own 8 MB limit (`governmentRelationsV2.ts:74`) are refused with that limit stated, until Task 14 raises it.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: copy a proof into Government Relations on request`.

### Task 14: Government Relations uploads through a signed URL

Ships separately; the proof feature does not depend on it.

**Files:**
- Modify: `lib/governmentRelationsV2.ts` (`MAX_FILE_BYTES` 20 MB; `createGovernmentUploadSlot(context, file)`; `uploadAndAutomateGovernmentDocument` accepts `{ storagePath }` as an alternative to `fileBase64`, downloads and sniffs like Task 8), `app/api/government-relations/route.ts` (`action: "upload-slot"`; `upload-document` with `storagePath`), `components/GovernmentRelationsConsole.tsx:186` (slot → `uploadToProofSlot`-style PUT → register)
- Test: `__tests__/governmentUploadSlot.test.ts`

- [ ] **Step 1: Write the failing tests:** a slot path is under `safeTenantPart(tenantId)/` in `government-documents`; registration refuses a path of another tenant; a 12 MB PDF passes; the multipart path keeps working for files ≤ 3 MB (backward compatible).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, reusing `sniffProofMime` and `isPathOfProof`-style prefix checks from Task 6.
- [ ] **Step 4: Run** the tests and the full suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat: government documents upload straight to storage`.

### Task 15: Release verification

Nothing here is code. Each step is evidence, recorded in the PR.

- [ ] **Step 1:** Full gate locally: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:smoke`, `npm audit --omit=dev --audit-level=high`, `scripts/sql-local-check.sh`. Expected: all exit 0.
- [ ] **Step 2:** Apply the three migrations to staging through the `Database Security` workflow. Expected: every suite in `supabase/tests/` passes, including the two new ones.
- [ ] **Step 3:** On a Vercel preview wired to staging, at 390×844 and 1440×900 with a real pointer: attach a 15 MB scanned PDF and a phone photo to a real-world step, see both fingerprinted, correct one fact, confirm. Then: the task shows `proofVersion 3`; the proof view opens each file through a 60-second link; the same confirm sent again answers 409; the storage object URL without a token answers 400/404. If the upload PUT is refused for lack of an `apikey` header, setting `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships the anonymous key to browsers for the first time: do it on the preview only, and on production only after Step 4 shows `document_access` passing there.
- [ ] **Step 4 (needs owner question 1):** once the three `PRODUCTION_*` secrets exist, dispatch `Production Verification`. Expected: the snapshot lists the real `gov_%` tables; `document_access` and `execution_proofs` suites pass. If `document_access` fails before the Task 3 migration is applied to production, that is the finding owner question 2 is about; report it to the owner privately, not in a public issue.
- [ ] **Step 5 (needs owner question 4):** only after the owner allows it, set `ORVANTA_PROOF_READING=openai` in Vercel and repeat Step 3 to see facts read.
