import { runCompanyExecution } from "@/lib/companyExecutionSystem";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, AI_RATE_LIMIT } from "@/lib/rateLimit";
import { accessIsConfigured, authenticateRequest, requireAccess } from "@/lib/accessControl";
import { requireSupabaseForWrite } from "@/lib/supabase";
import { logActivity } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get("x-forwarded-for") || "anonymous";

  try {
    if (!accessIsConfigured()) {
      return NextResponse.json(
        { ok: false, error: "لم يتم ضبط مفاتيح صلاحيات Orvanta في Vercel." },
        { status: 503 }
      );
    }

    const actor = await authenticateRequest(req);
    requireAccess(actor, ["OWNER", "ADMIN"]);
    requireSupabaseForWrite();

    const { allowed, remaining } = checkRateLimit(`exec:${clientIp}`, AI_RATE_LIMIT);
    if (!allowed) {
      await logActivity({
        actorId: actor.id,
        action: "COMPANY_EXECUTION_RATE_LIMITED",
        entityType: "company_execution",
        metadata: { clientIp },
      });
      return NextResponse.json(
        { ok: false, error: "تم تجاوز الحد المسموح من الطلبات. حاول مجدداً بعد دقيقة." },
        { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
      );
    }

    const { request } = await req.json();
    await logActivity({
      actorId: actor.id,
      action: "COMPANY_EXECUTION_REQUESTED",
      entityType: "company_execution",
      metadata: { role: actor.role, request: String(request || "").slice(0, 500), clientIp },
    });

    const result = await runCompanyExecution(request, actor);

    await logActivity({
      actorId: actor.id,
      action: "COMPANY_EXECUTION_COMPLETED",
      entityType: "project",
      entityId: result.project?.id,
      metadata: {
        role: actor.role,
        saved: result.saved,
        requestedBudget: result.intelligence.requestedBudget,
        approval: result.intelligence.approval,
      },
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Company execution system failed";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN_ROLE" ? 403 : message.includes("وضع القراءة فقط") ? 503 : 500;

    await logActivity({
      actorId: "anonymous",
      action: "COMPANY_EXECUTION_REJECTED",
      entityType: "company_execution",
      metadata: { error: message, clientIp },
    });

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
