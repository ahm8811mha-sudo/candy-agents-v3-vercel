import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authenticateRequest,
  authUserFromSupabaseUser,
  type AuthUser,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant";

const secureCookie = process.env.NODE_ENV === "production";
const TRUSTED_DEVICE_COOKIE = "orvanta_trusted_device";
const DEFAULT_OWNER_SESSION_DAYS = 365;

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type SetupState = "FIRST_OWNER_SETUP" | "SETUP_IN_PROGRESS" | "READY" | "UNAVAILABLE";

type ProvisionInput = {
  userId: string;
  employeeId: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  email: string;
};

class AuthRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

function ownerTenantId() {
  return normalizeTenantId(process.env.ORVANTA_TENANT_ID || DEFAULT_TENANT_ID);
}

function ownerSessionDays() {
  const configured = Number(process.env.ORVANTA_OWNER_SESSION_DAYS || DEFAULT_OWNER_SESSION_DAYS);
  return Number.isFinite(configured) && configured >= 30 ? Math.min(configured, 365) : DEFAULT_OWNER_SESSION_DAYS;
}

function isPrivateOwner(user: AuthUser) {
  return user.authMethod === "SUPABASE" && user.role === "OWNER" && user.tenantId === ownerTenantId();
}

function setTrustedDeviceCookie(response: NextResponse, trustedDevice: boolean) {
  if (trustedDevice) {
    response.cookies.set(TRUSTED_DEVICE_COOKIE, "1", {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * ownerSessionDays(),
    });
    return;
  }

  response.cookies.set(TRUSTED_DEVICE_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function setSessionCookies(
  response: NextResponse,
  accessToken?: string | null,
  refreshToken?: string | null,
  expiresIn?: number | null
) {
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
      maxAge: 60 * 60 * 24 * ownerSessionDays(),
    });
  }

  setTrustedDeviceCookie(response, true);
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
  setTrustedDeviceCookie(response, false);
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
    trustedDevice: true,
    ownerOnly: true,
    registrationAvailable: false,
    setupState: "READY" satisfies SetupState,
    user: userPayload(user),
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeWorkspaceName(value: unknown, fallback: string) {
  const name = String(value || "").trim();
  return name.slice(0, 120) || fallback;
}

function validatePassword(password: string) {
  if (password.length < 10) throw new AuthRequestError("كلمة المرور يجب ألا تقل عن 10 أحرف.");
}

function validateRequired(email: string, password: string) {
  if (!email || !password) throw new AuthRequestError("البريد الإلكتروني وكلمة المرور مطلوبان.");
}

async function getSetupState(supabase: SupabaseAdmin): Promise<SetupState> {
  const rpc = await supabase.rpc("orvanta_owner_setup_state");
  const state = String(rpc.data || "").toUpperCase();
  if (!rpc.error && ["FIRST_OWNER_SETUP", "SETUP_IN_PROGRESS", "READY"].includes(state)) {
    return state as SetupState;
  }

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!users.error && users.data.users.length > 0) return "READY";

  const { data, error } = await supabase
    .from("auth_bootstrap_claims")
    .select("status,expires_at")
    .eq("id", "first-owner")
    .maybeSingle();

  if (error) return "UNAVAILABLE";
  if (!data || data.status !== "CLAIMED") return "FIRST_OWNER_SETUP";

  const expiresAt = new Date(String(data.expires_at || ""));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return "FIRST_OWNER_SETUP";
  return "SETUP_IN_PROGRESS";
}

async function claimFirstOwnerBootstrap(supabase: SupabaseAdmin, email: string) {
  const { data, error } = await supabase.rpc("claim_orvanta_first_owner", { p_email: email });
  if (error || typeof data !== "string" || !data) return null;
  return data;
}

async function completeFirstOwnerBootstrap(supabase: SupabaseAdmin, token: string, userId: string) {
  const { data, error } = await supabase.rpc("complete_orvanta_first_owner", {
    p_token: token,
    p_user_id: userId,
  });
  return !error && data === true;
}

async function releaseFirstOwnerBootstrap(supabase: SupabaseAdmin, token: string) {
  await supabase.rpc("release_orvanta_first_owner", { p_token: token });
}

async function provisionOwner(supabase: SupabaseAdmin, input: ProvisionInput) {
  const { data, error } = await supabase.rpc("provision_orvanta_workspace_user", {
    p_user_id: input.userId,
    p_employee_id: input.employeeId,
    p_workspace_id: input.workspaceId,
    p_workspace_name: input.workspaceName,
    p_workspace_mode: "FOUNDER",
    p_plan: "FOUNDER",
    p_name: input.name,
    p_email: input.email,
    p_role: "OWNER",
    p_create_workspace: true,
  });
  if (error || data !== true) throw new Error(error?.message || "تعذر تجهيز مساحة المالك.");
}

async function cleanupProvisionedOwner(supabase: SupabaseAdmin, userId: string, workspaceId: string) {
  await supabase.from("workspace_memberships").delete().eq("user_id", userId).eq("workspace_id", workspaceId);
  await supabase.from("employees").delete().eq("auth_user_id", userId);
  await supabase.from("orvanta_workspaces").delete().eq("id", workspaceId).eq("owner_user_id", userId);
  await supabase.auth.admin.deleteUser(userId);
}

async function createOwnerIdentity(
  supabase: SupabaseAdmin,
  input: { email: string; password: string; name: string; tenantId: string }
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      tenant_id: input.tenantId,
      role: "OWNER",
      workspace_mode: "FOUNDER",
      platform_owner: true,
      private_owner_only: true,
    },
    user_metadata: {
      full_name: input.name,
      tenant_id: input.tenantId,
      workspace_mode: "FOUNDER",
    },
  });
  if (error || !data.user) throw new AuthRequestError(error?.message || "تعذر إنشاء هوية المالك.", 400);
  return data.user;
}

async function privateSignInResponse(
  supabase: SupabaseAdmin,
  email: string,
  password: string,
  setupCompleted = false
) {
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      setupCompleted,
      requiresLogin: true,
      registrationAvailable: false,
      setupState: "READY" satisfies SetupState,
    }, { status: 201 });
  }

  const user = await authUserFromSupabaseUser(signedIn.data.user);
  if (!isPrivateOwner(user)) {
    const denied = NextResponse.json(
      { ok: false, error: "هذه النسخة خاصة بمالك Orvanta فقط." },
      { status: 403 }
    );
    clearSessionCookies(denied);
    return denied;
  }

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    setupCompleted,
    trustedDevice: true,
    ownerOnly: true,
    registrationAvailable: false,
    setupState: "READY" satisfies SetupState,
    user: userPayload(user),
  }, { status: setupCompleted ? 201 : 200 });
  setSessionCookies(
    response,
    signedIn.data.session.access_token,
    signedIn.data.session.refresh_token,
    signedIn.data.session.expires_in
  );
  return response;
}

async function unauthenticatedResponse(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const setupState = supabase ? await getSetupState(supabase) : "UNAVAILABLE";
  const response = NextResponse.json(
    {
      ok: false,
      authenticated: false,
      ownerOnly: true,
      registrationAvailable: setupState === "FIRST_OWNER_SETUP",
      setupState,
      accessModes: {
        owner: true,
        employee: false,
        licensedCompany: false,
        invitation: false,
      },
      policy: {
        owner: "حساب مالك واحد وجهاز موثوق لمدة تصل إلى سنة.",
        commercialAccess: "مؤجل إلى مرحلة الإطلاق التجاري.",
      },
    },
    { status: 401 }
  );
  clearSessionCookies(response);
  return response;
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (user && isPrivateOwner(user)) return sessionResponse(user, false);

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const supabase = getSupabaseAdmin();
  if (!refreshToken || !supabase) return unauthenticatedResponse(supabase);

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return unauthenticatedResponse(supabase);

  const refreshedUser = await authUserFromSupabaseUser(data.user);
  if (!isPrivateOwner(refreshedUser)) return unauthenticatedResponse(supabase);

  const response = sessionResponse(refreshedUser, true);
  setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "login");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json({ ok: false, error: "نظام المصادقة غير متاح." }, { status: 503 });
    }

    if (action === "login") {
      validateRequired(email, password);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        return NextResponse.json({ ok: false, error: "بيانات الدخول غير صحيحة." }, { status: 401 });
      }

      const user = await authUserFromSupabaseUser(data.user);
      if (!isPrivateOwner(user)) {
        const denied = NextResponse.json(
          { ok: false, error: "هذا الحساب غير مخول بدخول النسخة الخاصة." },
          { status: 403 }
        );
        clearSessionCookies(denied);
        return denied;
      }

      const response = sessionResponse(user, false);
      setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in);
      return response;
    }

    if (action === "register" || action === "register_owner") {
      validateRequired(email, password);
      validatePassword(password);

      const bootstrapToken = await claimFirstOwnerBootstrap(supabase, email);
      if (!bootstrapToken) {
        return NextResponse.json({
          ok: false,
          error: "تم إنشاء حساب المالك مسبقًا أو توجد عملية إعداد أخرى قيد التنفيذ.",
        }, { status: 403 });
      }

      const name = safeWorkspaceName(body.name, email.split("@")[0] || "مالك Orvanta");
      const tenantId = ownerTenantId();
      const workspaceName = safeWorkspaceName(body.workspaceName, "مساحة المالك الخاصة");
      let userId = "";

      try {
        const createdUser = await createOwnerIdentity(supabase, { email, password, name, tenantId });
        userId = createdUser.id;
        await provisionOwner(supabase, {
          userId,
          employeeId: `owner-${userId}`,
          workspaceId: tenantId,
          workspaceName,
          name,
          email,
        });

        const completed = await completeFirstOwnerBootstrap(supabase, bootstrapToken, userId);
        if (!completed) throw new Error("تعذر تثبيت إعداد حساب المالك.");
        return privateSignInResponse(supabase, email, password, true);
      } catch (error) {
        if (userId) await cleanupProvisionedOwner(supabase, userId, tenantId);
        await releaseFirstOwnerBootstrap(supabase, bootstrapToken);
        throw error;
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "هذه النسخة خاصة بالمالك فقط. تسجيل الشركات والموظفين والدعوات مؤجل إلى الإطلاق التجاري.",
      },
      { status: 403 }
    );
  } catch (error) {
    const status = error instanceof AuthRequestError ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "خطأ في المصادقة" },
      { status }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
