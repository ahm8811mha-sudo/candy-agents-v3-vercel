/**
 * Roadmap #3 — Public API v1 gate (Stripe developer standard).
 *
 * External clients authenticate with `Authorization: Bearer <ORVANTA_API_KEY>`.
 * When the key isn't configured the API reports itself as disabled (503)
 * instead of silently being open — the platform's honest-degradation rule.
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export function isPublicApiEnabled(): boolean {
  return Boolean(process.env.ORVANTA_API_KEY);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Returns null when authorized, or the error response to send back. */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const configured = process.env.ORVANTA_API_KEY;
  if (!configured) {
    return NextResponse.json(
      { ok: false, error: "Public API is not enabled. Set ORVANTA_API_KEY to activate it." },
      { status: 503 }
    );
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, configured)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing API key." }, { status: 401 });
  }
  return null;
}
