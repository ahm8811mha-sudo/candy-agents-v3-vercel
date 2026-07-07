import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireAccess } from "@/lib/accessControl";
import { runSafeExecution } from "@/lib/safeExecution";

export async function POST(req: NextRequest) {
  try {
    const actor = await authenticateRequest(req);
    requireAccess(actor, ["OWNER", "ADMIN"]);

    const body = await req.json();
    const result = await runSafeExecution(String(body?.request || ""), actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN_ROLE" ? 403 : message.includes("وضع القراءة فقط") ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
