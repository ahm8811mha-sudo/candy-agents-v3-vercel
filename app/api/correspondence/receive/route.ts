import { NextResponse } from "next/server";
import { createInbound } from "@/lib/company/correspondence";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const data = (body.data || body.email || body) as Record<string, unknown>;
  const message = await createInbound({
    fromEmail: String(data.from || "unknown@example.com"),
    subject: String(data.subject || "مخاطبة واردة"),
    bodyText: String(data.text || data.html || ""),
    contactType: "COMPANY",
    priority: "NORMAL",
  });
  return NextResponse.json({ ok: true, message });
}
