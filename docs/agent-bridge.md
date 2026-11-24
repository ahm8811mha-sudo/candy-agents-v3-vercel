# Agent bridge and Chairman digest

Outside assistants (one Grok Bot per employee) act as that employee on live data. The site stays the only place for commands and approvals. These routes do not send email, WhatsApp, or any webhook. The outbox is unchanged.

Production is behind Vercel Deployment Protection. Callers also send `x-vercel-protection-bypass`. This repository does not set that value.

## Environment variables

Set these in Vercel. Do not commit them.

| Name | Who it admits |
|---|---|
| `AGENT_BRIDGE_KEY` | Every `/api/bridge/agents` route, `GET /api/bridge/commands`, and the Chairman digest |
| `AGENT_BRIDGE_KEY_SARA` (optional, one per employee, upper case id) | Only that employee's routes. Not the command poll, not the digest, and not another employee |
| `CHAIRMAN_DIGEST_KEY` (optional) | `GET /api/bridge/chairman/digest` only |

Header names: `x-agent-bridge-key` and `x-chairman-digest-key`. A wrong key is rejected. The owner cookie alone is not enough for these routes.

## Roster

`GET /api/bridge/agents`

```json
{ "ok": true, "agents": [{ "id": "sara", "name": "سارة", "title": "مديرة المبيعات وعلاقات العملاء", "spendApproval": "none" }] }
```

A per-agent key returns only that agent. The owner is not a bridge employee and cannot approve spend from here.

## Workspace and inbox

`GET /api/bridge/agents/sara/workspace`

`GET /api/bridge/agents/sara/inbox`

Both return that employee's open commands, the spend requests waiting on her, and her bridge messages. The workspace also returns a short summary of tasks and commitments when the database is available.

## Messages

`POST /api/bridge/agents/sara/messages`

```json
{ "direction": "note", "body": "تم تحديث عرض السعر الداخلي.", "author": "sara" }
```

`direction` is `inbound`, `outbound`, or `note`. The message is stored for that employee and listed by `GET` on the same path.

## Actions

`POST /api/bridge/agents/abdulrahman/actions`

Move a command or a spend request as that employee. `owner_decision` is always refused.

```json
{
  "kind": "spend",
  "approvalId": "apr-example",
  "action": "finance_review",
  "result": "مشروط",
  "note": "السيولة تكفي إذا تأخر الشراء أسبوعاً واحداً."
}
```

```json
{
  "kind": "command",
  "commandId": "cmd-example",
  "action": "progress",
  "note": "أُنجزت خطوة التجهيز الداخلي."
}
```

Spend order: department, then Abdulrahman (`موافق` / `مشروط` / `غير موافق`), then Hares (`سليم` / `مشروط` / `موقوف`), then Sultan's recommendation (`موافقة` / `رفض` / `تعديل`), then the Chairman in the site. `موقوف` stops the request. No employee can approve an amount above 0 SAR.

## Commands inside the site

`POST /api/commands` with the owner session:

```json
{ "command": "جهزي عرض سعر للعميل الحالي بدون إرسال", "assignee": "automatic" }
```

`assignee` is optional. Omit it, or send `automatic`, and the text is routed by name first (`خالد: …`, `يا سارة …`, or `@sara`) and then by subject. A real employee id such as `khalid` overrides the text. `owner` is not an assignee.

The Chairman writes the order at the top of مكتبي, and again on `/commands`. The form has the text, an employee menu that defaults to تلقائي, a priority, and one submit button. After it is saved, the page names the employee and links to that command’s card. `/commands` lists every command from `GET /api/commands` and refreshes itself. Both pages require the owner session. The same `POST` body is sent.

Each command is written to `chairman_commands`. A later read on another instance loads that row, so `GET /api/commands` and `/api/bridge/agents/{id}/inbox` see it. If the table is missing, the command stays in the current process only.

`GET /api/commands` and the inbox page show the owner, the current step, blockers, and the result. Money goes through the spend chain. External sends stay blocked until the Chairman approves them. Rayyan tracks each command until it closes with evidence.

## Open-command poll

`GET /api/bridge/commands?since=2026-10-26T00:00:00.000Z`

Authorized only by `AGENT_BRIDGE_KEY`. One dispatcher can poll this instead of every employee inbox. The response lists open commands whose `updatedAt` or `createdAt` is at or after `since`:

```json
{ "ok": true, "since": "2026-10-26T00:00:00.000Z", "commands": [{ "id": "cmd-example", "subject": "خالد: جهّز مقارنة موردين", "status": "IN_PROGRESS", "ownerAgentId": "khalid", "updatedAt": "2026-10-26T08:00:00.000Z" }] }
```

Closed commands are left out by default (the same as `status=open`). Add `status=all` (or `includeClosed=1`) to also list commands closed at or after `since`, or `status=closed` for only those closed commands. Closed rows add `currentStep`, `createdAt`, `closedAt` and `resultReport`. The default response shape is unchanged.

`progress`, `note`, `evidence`, `close` and `block` actions are idempotent: the same employee sending the same action, step, note and evidence within two minutes gets the command back unchanged, with no new history entry. Repeats already in a command's visible history are collapsed on read; the append-only work-events log keeps every call.

A missing or unparseable `since` is 400. The call does not write, does not approve spend, and does not send anything outside the company.

## Chairman digest

`GET /api/bridge/chairman/digest?since=2026-10-26T00:00:00.000Z`

Authorized by `AGENT_BRIDGE_KEY` or `CHAIRMAN_DIGEST_KEY`. The response is compact JSON:

- `memos`: every completed spend memo waiting for the Chairman now (`id`, `subject`, `amountSAR`, `sultanRecommendation`, `approvePath`). This list is not filtered by `since`, so a poll window cannot skip one.
- `commands`: closed, blocked, awaiting the Chairman, in the spend chain, or overdue, when `updatedAt` or the due time is at or after `since`.
- `alerts`: a governance stop (`موقوف`) or a command blocker that names governance or risk.

The call does not write. It does not include secrets.

`approvePath` is `/inbox?decision=<id>`.

## Existing pending decisions

Pending and deferred items with an amount above 0 and no review chain are read as waiting on Abdulrahman's finance review and flagged `needs chain review`. They are not deleted, not auto-approved, and not shown to the Chairman as ready. The migration writes that flag onto `company_approvals.metadata.spendChain` for rows that are still pending or deferred. Non-financial pending decisions stay as they are. Already approved or rejected rows are not rewritten.

## November 2026 additions (backward compatible)

- Messages accept `commandId`; a linked message is stored in `agent_bridge_messages` and recorded on the command (`note`, or `progress` with `advance: true`). `GET .../messages?commandId=` filters.
- Command actions add `note` and `assign` (Rayyan or Sultan only, with `assignee`).
- Spend actions add `resubmit_department` for an item returned to the department; stops carry `reasonCode` (`duplicate`, `missing_numbers`, `no_budget`, `authority`, `legal`, `risk`, `other`).
- The Chairman digest adds `decisionCards` (at most 7), `overdue` (every overdue command, always) and `desk`; alerts are grouped with `count`. Existing fields are unchanged.
- Decisions are never taken through the bridge. `POST /api/commands` with `action: "decide"` needs the owner session and rejects system keys.

## Project steps (since PR "project steps flow")

- `GET /api/bridge/agents/{id}/steps`: the project steps this employee owns and can work on now (also listed as `projectSteps` in `workspace` and `inbox`).
- `POST /api/bridge/agents/{id}/steps` `{ "action": "deliver" | "progress", "taskId", "output", "sources": [] }`: hand in the deliverable. Internal steps close at 100%; real-world steps stop at REVIEW (60%) until the Chairman confirms with proof. Spend steps (`WAITING_FUNDING`) refuse delivery until the Chairman decides.
- Master key only: `GET /api/bridge/projects[?projectId=&outputs=1]` (every project, its steps, stuck and overdue counts); `POST /api/bridge/projects` with `{ "action": "sweep" }`, `{ "action": "reactivate", "projectId" }` or `{ "action": "spend_step", "projectId", "title", "detail", "amountSAR", "preparingAgentId" }`.
- Master key: `{ "action": "add_step", "projectId", "title", "agentId", "dueDate?": "YYYY-MM-DD", "description?", "executionKind?": "INTERNAL"|"REAL_WORLD", "priority?" }` adds a no-spend step owned by that employee (status TODO, never merged as a duplicate, owner notified in their bridge messages). Same title in the same project re-routes the existing step instead of duplicating. `{ "action": "update_step", "taskId", "agentId?", "executionKind?", "dueDate?" }` re-routes or reschedules a step.
- `sultan` and `diwan` (Rayyan) also get `teamSteps` in `inbox` and `workspace`: every project's open steps with owner, status and due date.
- Rules: a step that spends nothing never waits for approval and is routed to its owner; only spend steps go through department → Abdulrahman + Hares → Sultan → Chairman. Overdue steps are escalated to Sultan once a day. The Chairman digest carries `projectSteps` totals.

## Stuck spend requests (24 Nov 2026)

Incident: a 5,000 SAR opportunity-radar request waited 28 days for a department memo. Its holder was the vague «القسم المعني», so no employee queue showed it.

- Every in-chain request now has a named holder: the preparing employee, else the pipeline owner (Rased for opportunity and idea requests, otherwise Sultan). `GET /api/bridge/agents/{id}/inbox` lists it under that employee.
- Each stage may hold a request 48 hours. After that it is overdue: the office alerts counter and the holder's «متأخر» counter list it, and its card says how long it has waited.
- `GET /api/bridge/chairman/digest` adds `spendInChain`: every request still in the chain (not filtered by `since`) with `holder`, `stage`, `since`, `overdue`, `overdueHours` and the `actionPath` to act on it. A dispatcher must process this list, not only commands.
- The daily desk cron escalates an overdue request at most once a day: a bridge note to the holder and to Sultan, and from the second escalation to Rayyan. The escalation is recorded on `spendChain.escalation`; every move records `spendChain.stageEnteredAt`. Nothing is approved, sent outside, or spent.
- `/spend/{id}` is the full file. When the chain is complete (or a reviewer stopped it), the Chairman approves, rejects with a reason, returns with a note, or defers a week from the file itself.

## Spend queue for the dispatcher routine (25 Nov 2026)

`GET /api/bridge/chairman/digest?view=spend` (header `x-chairman-digest-key` or the master `x-agent-bridge-key`; no `since` needed) returns:

- `counts: { open, stuck }`, `slaHours` (48)
- `stuckSpend[]`: late requests first: idle in a reviewer's stage past 48h, or waiting on the Chairman more than 48h
- `spendQueue[]`: every open spend request

Each item has `id, subject, amountSAR, stage, holder, holderName, createdAt, ageHours, stageSince, stageAgeHours, stuck, overdueHours, returned, escalations, lastEscalatedAt, projectId, fileHref, actionPath`. For every `stuckSpend` item the routine nudges `holder` through `actionPath` (null when the holder is the Chairman: never decide for him). The full digest also carries `spendQueue` and `stuckSpend`.

## Opportunity radar respects the Chairman (25 Nov 2026)

- While the CR is suspended (a rejection that says so, or a COMMERCIAL_REGISTRATION document in SUSPENDED/EXPIRED/CANCELLED, until an ACTIVE CR document is newer) the radar raises no paid request.
- After a rejection of the same idea it waits 30 days; `POST /api/enterprise-os {action:"radar", request, evidence}` with real new evidence (30+ chars) may resubmit inside the window (not while the CR is suspended).
- A held run writes an `OPPORTUNITY_RADAR_HELD` audit row and returns `{ skipped: true, held: true, code, reason, until }`.
- Every radar request is linked to its own project (status `PROPOSED`, then `ACTIVE` or `REJECTED` with the decision). Backfill: `POST /api/bridge/projects {"action":"link_radar_projects"}` (master key, idempotent).
