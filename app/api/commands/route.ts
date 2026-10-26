import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import {
  hydrateChairmanCommands,
  issueChairmanCommand,
  listChairmanCommands,
  publicCommandStatus,
} from "@/lib/company/chairmanCommands";

export const dynamic = "force-dynamic";

/** The Chairman's command board: who owns each order, the current step, blockers, and the result. */
export async function GET() {
  await hydrateChairmanCommands();
  return NextResponse.json({ ok: true, commands: listChairmanCommands().map(publicCommandStatus) });
}

/** An order from the Chairman becomes tracked work for the responsible employee. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const command = String(body.command ?? body.text ?? "").trim();
    if (command.length < 3) return NextResponse.json({ ok: false, message: "الأمر قصير." }, { status: 400 });
    const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority) ? body.priority : "HIGH";
    const issued = await issueChairmanCommand(command, { priority });
    return NextResponse.json({ ok: true, command: publicCommandStatus(issued) });
  } catch (error) {
    await logError("CHAIRMAN_COMMAND_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "تعذر تسجيل الأمر." }, { status: 500 });
  }
}
