import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authenticateRequest,
  authUserFromSupabaseUser,
  hasPermission,
  type AuthUser,
  type UserRole,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeTenantId } from "@/lib/tenant";

const secureCookie = process.env.NODE_ENV === "production";

function setSessionCookies(response: NextResponse, accessToken?: string | null, refreshToken?: string | null, expiresIn?: number | null) {
  if (accessToken) {
    response.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, Number(expiresIn || 3600)),
    });
  }
  if (refreshToken) {
    response.cookies.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
}

function sessionResponse(user: AuthUser, refreshed = false) {
  return NextResponse.json({
    ok: true,
    authenticated: true,
    refreshed,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
    },
  });
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (user) return sessionResponse(user);

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const supabase = getSupabaseAdmin();
  if (!refreshToken || !supabase) {
    const response = NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    const response = NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }

  const refreshedUser = await authUserFromSupabaseUser(data.user);
  const response = sessionResponse(refreshedUser, true);
  setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const action = String(body.action || "login");

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
      const caller = await authenticateRequest(req);
      const publicDevRegistration = process.env.NODE_ENV !== "production" && process.env.ALLOW_PUBLIC_REGISTRATION === "true";
      if (!publicDevRegistration && (!caller || !hasPermission(caller.role, "ADMIN"))) {
        return NextResponse.json(
          { ok: false, error: "إنشاء المستخدمين متاح فقط لمدير النظام." },
          { status: 403 }
        );
      }

      const tenantId = normalizeTenantId(String(body.tenantId || caller?.tenantId || ""));
      const requestedRole = String(body.role || "VIEWER").toUpperCase() as UserRole;
      const allowedRoles: UserRole[] = ["ADMIN", "OWNER", "CEO", "CFO", "COO", "CRO", "CGO", "MANAGER", "EMPLOYEE", "VIEWER"];
      const role = allowedRoles.includes(requestedRole) ? requestedRole : "VIEWER";
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { tenant_id: tenantId, role },
        user_metadata: { full_name: String(body.name || email) },
      });

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        user: { id: data.user.id, email: data.user.email, tenantId, role },
      }, { status: 201 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      return NextResponse.json({ ok: false, error: "بيانات الدخول غير صحيحة." }, { status: 401 });
    }

    const user = await authUserFromSupabaseUser(data.user);
    const response = sessionResponse(user);
    setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "خطأ في المصادقة" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
