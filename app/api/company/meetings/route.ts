import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hydrateCompany } from "@/lib/company/hydrate";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";
import { buildDecisionDesk } from "@/lib/company/decisionDesk";
import { createMeetingMinutes } from "@/lib/executiveOffice";
import { getAgent } from "@/lib/company/agents";

export const dynamic = "force-dynamic";

/** GET: read-only. Meeting minutes and upcoming calendar events, plus the agenda of the daily decision meeting. */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  await Promise.all([hydrateCompany(), hydrateChairmanCommands()]).catch(() => undefined);
  const desk = buildDecisionDesk();
  const db = getSupabaseAdmin();
  let minutes: unknown[] = [];
  let events: unknown[] = [];
  let available = false;
  if (db) {
    const [minuteRows, eventRows] = await Promise.all([
      db.from("executive_meeting_minutes").select("*").order("created_at", { ascending: false }).limit(30),
      db.from("executive_calendar_events").select("*").gte("starts_at", new Date(Date.now() - 86_400_000).toISOString()).order("starts_at", { ascending: true }).limit(20),
    ]);
    if (!minuteRows.error) { minutes = minuteRows.data || []; available = true; }
    if (!eventRows.error) events = eventRows.data || [];
  }
  return NextResponse.json({
    ok: true,
    available,
    daily: { at: desk.digestAt, agenda: desk.cards.map((card) => ({ id: card.id, question: card.question, owner: card.ownerName })), waiting: desk.waiting, overdue: desk.overdue.length },
    minutes,
    events,
  }, { headers: { "cache-control": "no-store" } });
}

/** POST: record meeting minutes (internal record only; nothing is sent outside). */
export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (title.length < 3) return NextResponse.json({ ok: false, error: "عنوان الاجتماع قصير." }, { status: 400 });
    const attendees = Array.isArray(body.attendees) ? body.attendees.map((id: unknown) => getAgent(String(id))?.name || String(id)).slice(0, 12) : [];
    const minutes = await createMeetingMinutes({ title, attendees, decisions: String(body.decisions || "").trim() || "لم يُسجّل قرار.", actionItems: [] });
    return NextResponse.json({ ok: true, minutes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "تعذر حفظ المحضر." }, { status: 503 });
  }
}
