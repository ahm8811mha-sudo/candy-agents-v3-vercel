# Model calls audit, 2026-10-18

Every place the system calls a language model, what each costs, how it fails,
and what was fixed. Read from the code at `fd0dcff`; fixes in `c518527`.

## Call map

| Call site | Provider | Reached by | Bounded | In the cost ledger | Output checked |
|---|---|---|---|---|---|
| `lib/ai.ts` `runAgentRaw` (all agents, idea studies, planning) | Gemini, Claude or OpenAI, one chosen by `AI_PROVIDER` or the first key present | UI actions, daily loop | **now 45 s** (was none) | yes | yes, when called through `runAgentStructured` (zod) |
| `lib/governmentRelationsV2.ts` document reading | OpenAI Responses | document upload, re-analysis | 55 s | **now yes** (was no) | normalised field by field |
| `lib/governmentRelations.ts` v1 document reading | OpenAI chat | `update-document` | **now 45 s** (was none) | **now yes** (was no) | normalised field by field |
| `lib/governmentRelations.ts` regulatory monitor | OpenAI chat, JSON mode | daily cron, only when a page's hash changed, once per hash | 45 s | **now yes** (was no) | impact level whitelisted |
| `lib/aiCompany.ts` five-department report | OpenAI chat | `/api/company`, `/api/agents/pipeline`; no screen calls them | no | no | no |
| `lib/aiFinanceDecision.ts`, `lib/accountingSystem.ts` | OpenAI chat | `FinanceDashboard`, which no page mounts | no | no | no |

Volume is low by construction: the daily loop creates at most one idea a day
and studies only that one; a study that succeeded is never re-run
(`lib/company/ideas.ts:209`); the regulatory monitor calls the model only
for a changed page. All non-public `/api/*` routes need the owner session
(`proxy.ts`), so cost is bounded by the owner's own use.

## Fixed in `c518527`

1. **[P1] No timeout on agent calls.** Gemini and Claude `fetch` had no
   signal; the OpenAI client's default is 10 minutes per attempt with two
   retries (`node_modules/openai` 6.45.0, `DEFAULT_TIMEOUT = 600000`). A
   Vercel Hobby function stops at 300 s, so a stalled provider used the whole
   budget, the owner saw a bare 504, and the ledger recorded nothing because
   the `catch` never ran. Each call now ends at 45 s, OpenAI retries once, a
   timeout is answered in Arabic and recorded as a failed call.
2. **[P1] Three live calls invisible to the cost ledger.** Document reading
   (v1, v2) and the regulatory monitor used raw `fetch`. They now go through
   `lib/ai/openai.ts`, which bounds and records each call. A test fails if a
   raw provider URL comes back into those files.
3. **[P1] The government route could stop mid-write.** `maxDuration = 60`
   while one document read may take 55 s left 5 s for the storage upload,
   the extraction rows and the follow-up tasks. It is 300 s, as four other
   routes here already are.
4. **[P2] Gemini key in the URL.** Moved to the `x-goog-api-key` header, so
   it stays out of proxy logs and error traces.

## Open findings

**[P2] A canned answer can be saved as if it were real.**
`lib/aiCompany.ts:119-146`, `lib/aiFinanceDecision.ts:11-37`,
`lib/accountingSystem.ts:11-37` return fixed text when the key is missing or
the call fails, with no flag saying so, and `runCompanySystem` stores it in
`company_logs`. `lib/aiStructured.ts` already does this right (`demo: true`,
never fabricates). These paths have no screen today; retire them, or route
them through `runAgentStructured` before anything shows them.

**[P2] `/api/ai-health` reports one instance, not the system.**
`aiUsageSummary()` reads an in-memory buffer that empties on every cold start
and differs per instance. The durable record is `ai_usage_log`. Either label
the figure "since this instance started" or sum `ai_usage_log` for the
period.

**[P2] Output budget of 900 tokens for a three-report Arabic study.**
`lib/ai.ts` caps Gemini and OpenAI at 900 output tokens; the feasibility
study asks for three reports and a summary in Arabic JSON, with
`retryOnParseError: false`. A truncated answer fails validation and the
owner sees "تعذر الحصول على دراسة النموذج". Check `ai_usage_log` for
`feasibility_agent` rows whose `output_tokens` sit at 900 before raising it;
if they do, raise the cap for that agent only.

**[P3] Default Claude model is a 2024 identifier.**
`claude-3-5-haiku-latest` is used only when `ANTHROPIC_API_KEY` is set and
no Gemini key or `AI_PROVIDER` is. Set `ANTHROPIC_MODEL` explicitly if Claude
is ever the provider, and update the price table with it.

**[P3] Prices for Gemini 3.x are inferred by family.** The ledger matches
`gemini.*flash` to 2.5-era prices. Fine for order of magnitude; not for a
bill.

**[P3] The regulatory monitor reads untrusted page text.** A changed
official page goes into the prompt. The output is advisory (a notice for the
owner), JSON-only and the impact level is whitelisted, so the worst a
hostile page can do is mislabel its own change. Keep it advisory.

**[P3] Failed calls are recorded with model "unknown"** in `lib/ai.ts`,
which hides which model failed. Record the configured model instead.

## What is done well

- `runAgentStructured` validates every governed answer with zod, never turns
  the demo text into data, and repairs once.
- The feasibility study clamps an `APPROVE` to `CONDITIONAL` when the input
  is not ready for a decision (`lib/company/ideas.ts:220`).
- The usage ledger records provider, model, tokens, cost and whether the
  answer was real; every live call now reaches it.
- Model output never changes a real-world task's state; the owner's
  confirmation does, through the database.
