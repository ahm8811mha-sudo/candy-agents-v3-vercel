import { NextResponse } from "next/server";
import {
  archiveCorrespondence,
  canUseRealEmail,
  createDraft,
  currentEmailProvider,
  emailReadiness,
  hasCorrespondenceDb,
  listCorrespondence,
  sendCorrespondence,
  syncGmailInbox,
} from "@/lib/company/correspondence";
import { assignCorrespondenceTask, listCorrespondenceTasks } from "@/lib/company/correspondenceTasks";

export async function GET() {
  const messages = await listCorrespondence();
  const tasks = await listCorrespondenceTasks();
  const gmail = emailReadiness();
  return NextResponse.json({
    ok: true,
    messages,
    tasks,
    readiness: {
      database: hasCorrespondenceDb(),
      realEmail: canUseRealEmail(),
      provider: currentEmailProvider(),
      fromEmail: process.env.GMAIL_SENDER_EMAIL || process.env.CORRESPONDENCE_FROM_EMAIL || null,
      gmailReady: gmail.ready,
      missingGmailKeys: gmail.missing,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "save");

  if (action === "sync") {
    const result = await syncGmailInbox();
    const messages = await listCorrespondence();
    const tasks = await listCorrespondenceTasks();
    return NextResponse.json({ ok: true, ...result, messages, tasks });
  }

  if (action === "assignTask") {
    try {
      const task = await assignCorrespondenceTask({
        messageId: String(body.messageId || ""),
        agentId: String(body.agentId || ""),
        instruction: String(body.instruction || ""),
      });
      const tasks = await listCorrespondenceTasks();
      return NextResponse.json({ ok: true, task, tasks });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "ASSIGN_FAILED" },
        { status: 400 }
      );
    }
  }

  if (action === "send") {
    const result = await sendCorrespondence({ ...body, needsApproval: false });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "archive") {
    const message = await archiveCorrespondence(String(body.id || ""));
    return NextResponse.json({ ok: Boolean(message), message });
  }

  const message = await createDraft({ ...body, needsApproval: false });
  return NextResponse.json({ ok: true, message });
}
