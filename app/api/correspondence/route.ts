import { NextResponse } from "next/server";
import {
  approveCorrespondence,
  archiveCorrespondence,
  canUseRealEmail,
  createDraft,
  hasCorrespondenceDb,
  listCorrespondence,
  sendCorrespondence,
} from "@/lib/company/correspondence";

export async function GET() {
  const messages = await listCorrespondence();
  return NextResponse.json({
    ok: true,
    messages,
    readiness: {
      database: hasCorrespondenceDb(),
      realEmail: canUseRealEmail(),
      provider: process.env.RESEND_API_KEY ? "RESEND" : "NOT_CONFIGURED",
      fromEmail: process.env.CORRESPONDENCE_FROM_EMAIL || null,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "save");

  if (action === "send") {
    const result = await sendCorrespondence(body);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "approve") {
    const message = await approveCorrespondence(String(body.id || ""), String(body.approvedBy || "Owner"));
    return NextResponse.json({ ok: Boolean(message), message });
  }

  if (action === "archive") {
    const message = await archiveCorrespondence(String(body.id || ""));
    return NextResponse.json({ ok: Boolean(message), message });
  }

  const message = await createDraft(body);
  return NextResponse.json({ ok: true, message });
}
