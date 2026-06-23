import { NextResponse } from "next/server";
import { listNotifications } from "@/lib/repository";

export async function GET() {
  const items = await listNotifications();
  return NextResponse.json({ ok: true, notifications: items });
}
