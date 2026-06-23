import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "export",
    message: "Google Sheets export layer is installed. Add environment variables in Vercel before enabling write sync."
  });
}
