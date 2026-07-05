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

export async function GET() {
  const messages = await listCorrespondence();
  const gmail = emailReadiness();
  return NextResponse.json({
    ok: true,
    messages,
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
    return NextResponse.json({ ok: true, ...result, messages });
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
