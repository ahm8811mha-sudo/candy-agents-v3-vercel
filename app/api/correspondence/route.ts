import { NextResponse } from "next/server";
import { canUseRealEmail, createDraft, hasCorrespondenceDb, listCorrespondence } from "@/lib/company/correspondence";

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
  const message = await createDraft(body);
  return NextResponse.json({ ok: true, message });
}
