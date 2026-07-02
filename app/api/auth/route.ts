import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email, password, action } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "البريد الإلكتروني وكلمة المرور مطلوبان." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "نظام المصادقة غير متاح." },
        { status: 503 }
      );
    }

    if (action === "register") {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        user: { id: data.user.id, email: data.user.email },
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ ok: false, error: "بيانات الدخول غير صحيحة." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      token: data.session?.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "خطأ في المصادقة" },
      { status: 500 }
    );
  }
}
