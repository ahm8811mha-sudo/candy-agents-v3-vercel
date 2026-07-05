import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function runnerUrl() {
  return process.env.BROWSER_RUNNER_URL || "";
}

function runnerHeaders() {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.BROWSER_RUNNER_SECRET) headers["x-runner-secret"] = process.env.BROWSER_RUNNER_SECRET;
  return headers;
}

export async function GET() {
  const base = runnerUrl();
  if (!base) return NextResponse.json({ ok: true, configured: false, message: "BROWSER_RUNNER_URL is not configured" });
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store", headers: runnerHeaders() });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, configured: true, runner: json });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: error instanceof Error ? error.message : "Runner unavailable" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const base = runnerUrl();
  if (!base) return NextResponse.json({ ok: false, error: "BROWSER_RUNNER_URL is not configured" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");
    const sessionId = body.sessionId ? String(body.sessionId) : "";
    let path = "/sessions";
    let method = "POST";
    if (action === "get" && sessionId) {
      path = `/sessions/${sessionId}`;
      method = "GET";
    }
    if (action === "command" && sessionId) {
      path = `/sessions/${sessionId}/command`;
      method = "POST";
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers: runnerHeaders(),
      body: method === "POST" ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, runner: json }, { status: res.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Runner request failed" }, { status: 502 });
  }
}
