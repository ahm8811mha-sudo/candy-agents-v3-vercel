import {
  createExecutiveItem,
  createExecutiveCalendarEvent,
  createMeetingMinutes,
  generateExecutiveBrief,
  getExecutiveOffice,
  runExecutiveRadar,
  runExecutiveRequest,
  updateExecutiveItem,
} from "@/lib/executiveOffice";
import { getDeploymentContext } from "@/lib/deployment";
import { getSupabaseEnvironmentReadiness, probeSupabaseConnection } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function unavailableDatabaseResponse() {
  const readiness = getSupabaseEnvironmentReadiness();
  const connection = readiness.configured ? await probeSupabaseConnection() : null;
  if (readiness.configured && connection?.ready) return null;

  const deployment = getDeploymentContext();
  const code = connection?.status === "AUTH_REJECTED"
    ? "SUPABASE_AUTH_REJECTED"
    : connection?.status === "SCHEMA_UNAVAILABLE"
      ? "SUPABASE_SCHEMA_UNAVAILABLE"
      : connection?.status === "UNAVAILABLE"
        ? "SUPABASE_UNAVAILABLE"
        : "SUPABASE_NOT_CONFIGURED";
  const error = deployment.isPreview
    ? "هذه نسخة معاينة معزولة ولا تحتوي على اتصال قاعدة البيانات. افتح النسخة الإنتاجية لعرض بيانات المكتب التنفيذي الفعلية."
    : connection?.status === "AUTH_REJECTED"
      ? "رفض Supabase مفتاح الخادم في هذا النشر. استبدل SUPABASE_SECRET_KEY بمفتاح Secret صالح للمشروع المرتبط ثم أعد النشر."
      : connection?.status === "SCHEMA_UNAVAILABLE"
        ? "اتصال Supabase صالح لكن مخطط المكتب التنفيذي غير مكتمل. طبّق سلسلة migrations المعتمدة."
        : connection?.status === "UNAVAILABLE"
          ? "تعذر الوصول إلى Supabase مؤقتاً. أعد المحاولة وتحقق من حالة الخدمة إن استمر العطل."
          : "قاعدة البيانات غير مهيأة لهذا النشر. راجع متغيرات Supabase في إعدادات البيئة.";

  return NextResponse.json(
    {
      ok: false,
      code,
      configured: false,
      connectionStatus: connection?.status || "NOT_CONFIGURED",
      error,
      deployment,
      missingEnvironmentVariables: readiness.missingEnvironmentVariables,
    },
    { status: 503 }
  );
}

function executiveFailure(error: unknown, fallback: string) {
  console.error("[orvanta:executive-office] request failed", error);
  return NextResponse.json(
    { ok: false, code: "EXECUTIVE_OFFICE_UNAVAILABLE", error: fallback },
    { status: 500 }
  );
}

export async function GET() {
  const unavailable = await unavailableDatabaseResponse();
  if (unavailable) return unavailable;

  try {
    const data = await getExecutiveOffice();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return executiveFailure(error, "تعذر تحميل بيانات المكتب التنفيذي حالياً.");
  }
}

export async function POST(req: Request) {
  const unavailable = await unavailableDatabaseResponse();
  if (unavailable) return unavailable;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "create-item") {
      const result = await createExecutiveItem(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "update-item") {
      const result = await updateExecutiveItem(String(body.id || ""), String(body.status || "DONE"));
      return NextResponse.json({ ok: true, result });
    }

    if (action === "execute") {
      const result = await runExecutiveRequest(String(body.request || ""));
      return NextResponse.json({ ok: true, result });
    }

    if (action === "calendar-event") {
      const result = await createExecutiveCalendarEvent(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "meeting-minutes") {
      const result = await createMeetingMinutes(body.data);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "daily-brief") {
      const result = await generateExecutiveBrief(String(body.briefType || "MORNING"));
      return NextResponse.json({ ok: true, result });
    }

    if (action === "radar") {
      const result = await runExecutiveRadar();
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Invalid executive action" }, { status: 400 });
  } catch (error) {
    return executiveFailure(error, "تعذر تنفيذ أمر المكتب التنفيذي حالياً.");
  }
}
