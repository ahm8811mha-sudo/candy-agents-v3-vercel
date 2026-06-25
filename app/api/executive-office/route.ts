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
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getExecutiveOffice();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Executive office failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Executive action failed" },
      { status: 500 }
    );
  }
}
