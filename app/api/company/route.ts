import { runCompanySystem } from "@/lib/aiCompany";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { request } = await req.json();
    const cleanRequest = String(request || "").trim();

    if (!cleanRequest) {
      return NextResponse.json({ ok: false, error: "اكتب الطلب المطلوب تنفيذه." }, { status: 400 });
    }

    const result = await runCompanySystem(cleanRequest);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "System failed" }, { status: 500 });
  }
}
