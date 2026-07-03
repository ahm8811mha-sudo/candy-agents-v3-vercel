import { NextResponse } from "next/server";
import { composeDigest, dispatchDigest } from "@/lib/company/digest";

export const dynamic = "force-dynamic";

/** GET: preview the daily digest (composed, not sent). */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, digest: composeDigest() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Digest failed" },
      { status: 500 }
    );
  }
}

/** POST: compose and dispatch the digest over the best available channel. */
export async function POST() {
  try {
    const result = await dispatchDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Digest dispatch failed" },
      { status: 500 }
    );
  }
}
