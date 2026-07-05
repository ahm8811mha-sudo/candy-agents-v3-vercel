import { NextResponse } from "next/server";
import { createOperatorSession, listOperatorSessions, updateOperatorSession } from "@/lib/operatorSessions";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, sessions: listOperatorSessions() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");

    if (action === "create") {
      const session = createOperatorSession({
        title: body.title,
        targetUrl: body.targetUrl,
        serviceName: body.serviceName,
        request: body.request,
      });
      return NextResponse.json({ ok: true, session, sessions: listOperatorSessions() });
    }

    if (action === "update") {
      const session = updateOperatorSession(String(body.id || ""), {
        status: body.status,
        notes: body.notes,
        preparedFields: body.preparedFields,
        checklist: body.checklist,
      });
      return NextResponse.json({ ok: true, session, sessions: listOperatorSessions() });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Session action failed" }, { status: 500 });
  }
}
