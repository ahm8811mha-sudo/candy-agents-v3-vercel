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

The Chairman writes the order at the top of مساحة العمل, and again on `/commands`. The form has the text, an employee menu that defaults to تلقائي, a priority, and one submit button. After it is saved, the page names the employee and links to that command’s card. `/commands` lists every command from `GET /api/commands` and refreshes itself. Both pages require the owner session. The same `POST` body is sent.

Each command is written to `chairman_commands`. A later read on another instance loads that row, so `GET /api/commands` and `/api/bridge/agents/{id}/inbox` see it. If the table is missing, the command stays in the current process only.

`GET /api/commands` and the inbox page show the owner, the current step, blockers, and the result. Money goes through the spend chain. External sends stay blocked until the Chairman approves them. Rayyan tracks each command until it closes with evidence.

## Open-command poll

`GET /api/bridge/commands?since=2026-10-26T00:00:00.000Z`

Authorized only by `AGENT_BRIDGE_KEY`. One dispatcher can poll this instead of every employee inbox. The response lists open commands whose `updatedAt` or `createdAt` is at or after `since`:

```json
{ "ok": true, "since": "2026-10-26T00:00:00.000Z", "commands": [{ "id": "cmd-example", "subject": "خالد: جهّز مقارنة موردين", "status": "IN_PROGRESS", "ownerAgentId": "khalid", "updatedAt": "2026-10-26T08:00:00.000Z" }] }
```

Closed commands are left out. A missing or unparseable `since` is 400. The call does not write, does not approve spend, and does not send anything outside the company.

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
