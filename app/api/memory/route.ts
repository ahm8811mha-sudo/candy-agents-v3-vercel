import { NextRequest, NextResponse } from "next/server";
import { getRecentMemories, searchMemories, analyzeDecisionPatterns } from "@/lib/agentMemory";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q");
    const action = req.nextUrl.searchParams.get("action");

    if (action === "patterns") {
      const patterns = await analyzeDecisionPatterns();
      return NextResponse.json({ ok: true, patterns });
    }

    if (query) {
      const results = await searchMemories(query);
      return NextResponse.json({ ok: true, memories: results });
    }

    const memories = await getRecentMemories();
    return NextResponse.json({ ok: true, memories });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "خطأ في الذاكرة" },
      { status: 500 }
    );
  }
}
