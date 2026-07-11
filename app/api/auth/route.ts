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

function userPayload(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    departmentId: user.departmentId,
  };
}

function sessionResponse(user: AuthUser, refreshed = false) {
  return NextResponse.json({
    ok: true,
    authenticated: true,
    refreshed,
    registrationAvailable: false,
    user: userPayload(user),
  });
}

async function isFirstOwnerRegistrationAvailable(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return false;
  return data.users.length === 0;
}

async function unauthenticatedResponse(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const registrationAvailable = supabase ? await isFirstOwnerRegistrationAvailable(supabase) : false;
  const response = NextResponse.json(
    { ok: false, authenticated: false, registrationAvailable },
    { status: 401 }
  );
  clearSessionCookies(response);
  return response;
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (user) return sessionResponse(user);

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const supabase = getSupabaseAdmin();
  if (!refreshToken || !supabase) return unauthenticatedResponse(supabase);

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return unauthenticatedResponse(supabase);

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
      if (password.length < 10) {
        return NextResponse.json(
          { ok: false, error: "كلمة المرور يجب ألا تقل عن 10 أحرف." },
          { status: 400 }
        );
      }

      const firstOwnerSetup = await isFirstOwnerRegistrationAvailable(supabase);
      const caller = await authenticateRequest(req);
      const publicDevRegistration = process.env.NODE_ENV !== "production" && process.env.ALLOW_PUBLIC_REGISTRATION === "true";
      if (!firstOwnerSetup && !publicDevRegistration && (!caller || !hasPermission(caller.role, "ADMIN"))) {
        return NextResponse.json(
          { ok: false, error: "انتهى إعداد حساب المالك الأول. إنشاء المستخدمين الجدد متاح فقط لمدير النظام." },
          { status: 403 }
        );
      }

      const name = String(body.name || email.split("@")[0] || "مالك Orvanta").trim();
      const tenantId = firstOwnerSetup
        ? normalizeTenantId(process.env.ORVANTA_TENANT_ID || "golden-star")
        : normalizeTenantId(String(body.tenantId || caller?.tenantId || ""));
      const requestedRole = String(body.role || "VIEWER").toUpperCase() as UserRole;
      const allowedRoles: UserRole[] = ["ADMIN", "OWNER", "CEO", "CFO", "COO", "CRO", "CGO", "MANAGER", "EMPLOYEE", "VIEWER"];
      const role: UserRole = firstOwnerSetup
        ? "OWNER"
        : allowedRoles.includes(requestedRole)
          ? requestedRole
          : "VIEWER";

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { tenant_id: tenantId, role },
        user_metadata: { full_name: name, tenant_id: tenantId },
      });

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

      if (firstOwnerSetup) {
        const employeeId = `owner-${data.user.id}`;
        const { error: employeeError } = await supabase.from("employees").upsert({
          id: employeeId,
          auth_user_id: data.user.id,
          tenant_id: tenantId,
          full_name: name,
          email,
          role: "OWNER",
          job_title: "مالك الشركة",
          status: "ACTIVE",
          joined_at: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        }, { onConflict: "email" });

        if (employeeError) {
          await supabase.auth.admin.deleteUser(data.user.id);
          return NextResponse.json(
            { ok: false, error: `تعذر إكمال ملف المالك: ${employeeError.message}` },
            { status: 500 }
          );
        }

        const signedIn = await supabase.auth.signInWithPassword({ email, password });
        if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
          return NextResponse.json({
            ok: true,
            authenticated: false,
            setupCompleted: true,
            requiresLogin: true,
            registrationAvailable: false,
          }, { status: 201 });
        }

        const user = await authUserFromSupabaseUser(signedIn.data.user);
        const response = NextResponse.json({
          ok: true,
          authenticated: true,
          setupCompleted: true,
          registrationAvailable: false,
          user: userPayload(user),
        }, { status: 201 });
        setSessionCookies(
          response,
          signedIn.data.session.access_token,
          signedIn.data.session.refresh_token,
          signedIn.data.session.expires_in
        );
        return response;
      }

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
