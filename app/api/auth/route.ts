import { createHash, randomBytes } from "node:crypto";
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
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant";

const secureCookie = process.env.NODE_ENV === "production";
const TRUSTED_DEVICE_COOKIE = "orvanta_trusted_device";
const DEFAULT_OWNER_SESSION_DAYS = 180;

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type SetupState = "FIRST_OWNER_SETUP" | "SETUP_IN_PROGRESS" | "READY" | "UNAVAILABLE";
type WorkspaceMode = "FOUNDER" | "COMPANY";

type ProvisionInput = {
  userId: string;
  employeeId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceMode: WorkspaceMode;
  plan: string;
  name: string;
  email: string;
  role: UserRole;
  createWorkspace: boolean;
};

type ClaimedAccess = {
  id: string;
  claimToken: string;
  workspaceId: string;
  workspaceName: string;
  plan?: string;
  role?: UserRole;
};

function ownerSessionDays() {
  const configured = Number(process.env.ORVANTA_OWNER_SESSION_DAYS || DEFAULT_OWNER_SESSION_DAYS);
  return Number.isFinite(configured) && configured >= 30 ? Math.min(configured, 365) : DEFAULT_OWNER_SESSION_DAYS;
}

function setSessionCookies(
  response: NextResponse,
  accessToken?: string | null,
  refreshToken?: string | null,
  expiresIn?: number | null,
  trustedDevice = false
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

  const refreshDays = trustedDevice ? ownerSessionDays() : 30;
  if (refreshToken) {
    response.cookies.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * refreshDays,
    });
  }

  if (trustedDevice) {
    response.cookies.set(TRUSTED_DEVICE_COOKIE, "1", {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * ownerSessionDays(),
    });
  } else {
    response.cookies.set(TRUSTED_DEVICE_COOKIE, "", {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(TRUSTED_DEVICE_COOKIE, "", { httpOnly: true, secure: secureCookie, sameSite: "lax", path: "/", maxAge: 0 });
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

function sessionResponse(user: AuthUser, refreshed = false, trustedDevice = false) {
  return NextResponse.json({
    ok: true,
    authenticated: true,
    refreshed,
    trustedDevice,
    registrationAvailable: false,
    setupState: "READY" satisfies SetupState,
    user: userPayload(user),
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCode(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function hashCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asClaim(value: unknown): ClaimedAccess | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = String(record.id || "");
  const claimToken = String(record.claimToken || "");
  const workspaceId = String(record.workspaceId || "");
  const workspaceName = String(record.workspaceName || "");
  if (!id || !claimToken || !workspaceId || !workspaceName) return null;
  return {
    id,
    claimToken,
    workspaceId,
    workspaceName,
    plan: record.plan ? String(record.plan) : undefined,
    role: record.role ? String(record.role).toUpperCase() as UserRole : undefined,
  };
}

function safeWorkspaceName(value: unknown, fallback: string) {
  const name = String(value || "").trim();
  return name.slice(0, 120) || fallback;
}

function slugifyWorkspace(value: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = ascii || "company";
  return normalizeTenantId(`${base}-${randomBytes(3).toString("hex")}`);
}

function randomAccessCode(prefix: string) {
  return `${prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

async function hasAuthUsers(supabase: SupabaseAdmin) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return true;
  return data.users.length > 0;
}

async function getSetupState(supabase: SupabaseAdmin): Promise<SetupState> {
  if (await hasAuthUsers(supabase)) return "READY";

  const { data, error } = await supabase
    .from("auth_bootstrap_claims")
    .select("status,expires_at")
    .eq("id", "first-owner")
    .maybeSingle();

  if (error) return "UNAVAILABLE";
  if (!data) return "FIRST_OWNER_SETUP";
  if (data.status === "COMPLETED") return "READY";

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

async function provisionWorkspaceUser(supabase: SupabaseAdmin, input: ProvisionInput) {
  const { data, error } = await supabase.rpc("provision_orvanta_workspace_user", {
    p_user_id: input.userId,
    p_employee_id: input.employeeId,
    p_workspace_id: input.workspaceId,
    p_workspace_name: input.workspaceName,
    p_workspace_mode: input.workspaceMode,
    p_plan: input.plan,
    p_name: input.name,
    p_email: input.email,
    p_role: input.role,
    p_create_workspace: input.createWorkspace,
  });
  if (error || data !== true) throw new Error(error?.message || "تعذر تجهيز مساحة العمل.");
}

async function cleanupProvisionedUser(
  supabase: SupabaseAdmin,
  userId: string,
  workspaceId: string,
  createWorkspace: boolean
) {
  await supabase.from("workspace_memberships").delete().eq("user_id", userId).eq("workspace_id", workspaceId);
  await supabase.from("employees").delete().eq("auth_user_id", userId);
  if (createWorkspace) {
    await supabase.from("orvanta_workspaces").delete().eq("id", workspaceId).eq("owner_user_id", userId);
  }
  await supabase.auth.admin.deleteUser(userId);
}

async function createAuthIdentity(
  supabase: SupabaseAdmin,
  input: {
    email: string;
    password: string;
    name: string;
    tenantId: string;
    role: UserRole;
    workspaceMode: WorkspaceMode;
    platformOwner?: boolean;
  }
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      tenant_id: input.tenantId,
      role: input.role,
      workspace_mode: input.workspaceMode,
      platform_owner: Boolean(input.platformOwner),
    },
    user_metadata: {
      full_name: input.name,
      tenant_id: input.tenantId,
      workspace_mode: input.workspaceMode,
    },
  });
  if (error || !data.user) throw new Error(error?.message || "تعذر إنشاء هوية المستخدم.");
  return data.user;
}

async function signInResponse(
  supabase: SupabaseAdmin,
  email: string,
  password: string,
  trustedDevice: boolean,
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
  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    setupCompleted,
    trustedDevice,
    registrationAvailable: false,
    setupState: "READY" satisfies SetupState,
    user: userPayload(user),
  }, { status: setupCompleted ? 201 : 200 });
  setSessionCookies(
    response,
    signedIn.data.session.access_token,
    signedIn.data.session.refresh_token,
    signedIn.data.session.expires_in,
    trustedDevice
  );
  return response;
}

async function unauthenticatedResponse(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const setupState = supabase ? await getSetupState(supabase) : "UNAVAILABLE";
  const registrationAvailable = setupState === "FIRST_OWNER_SETUP";
  const response = NextResponse.json(
    {
      ok: false,
      authenticated: false,
      registrationAvailable,
      setupState,
      accessModes: {
        owner: true,
        employee: true,
        licensedCompany: true,
        invitation: true,
      },
      policy: {
        owner: "إعداد واحد ثم دخول تلقائي على الجهاز الموثوق.",
        employee: "دخول بحساب أنشأه مالك الشركة.",
        licensedCompany: "إنشاء مساحة شركة جديدة برمز تفعيل مرخّص.",
        invitation: "الانضمام إلى شركة قائمة برمز دعوة.",
      },
    },
    { status: 401 }
  );
  clearSessionCookies(response);
  return response;
}

function validatePassword(password: string) {
  if (password.length < 10) throw new Error("كلمة المرور يجب ألا تقل عن 10 أحرف.");
}

function validateRequired(email: string, password: string) {
  if (!email || !password) throw new Error("البريد الإلكتروني وكلمة المرور مطلوبان.");
}

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  const trustedDevice = req.cookies.get(TRUSTED_DEVICE_COOKIE)?.value === "1";
  if (user) return sessionResponse(user, false, trustedDevice);

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  const supabase = getSupabaseAdmin();
  if (!refreshToken || !supabase) return unauthenticatedResponse(supabase);

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return unauthenticatedResponse(supabase);

  const refreshedUser = await authUserFromSupabaseUser(data.user);
  const response = sessionResponse(refreshedUser, true, trustedDevice);
  setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in, trustedDevice);
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "login");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const trustedDevice = Boolean(body.rememberDevice);
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
      const response = sessionResponse(user, false, trustedDevice);
      setSessionCookies(response, data.session.access_token, data.session.refresh_token, data.session.expires_in, trustedDevice);
      return response;
    }

    if (action === "register" || action === "register_owner") {
      validateRequired(email, password);
      validatePassword(password);

      const bootstrapToken = await claimFirstOwnerBootstrap(supabase, email);
      if (!bootstrapToken) {
        return NextResponse.json({
          ok: false,
          error: "تم إنشاء مالك النظام مسبقًا أو توجد عملية إعداد أخرى قيد التنفيذ.",
        }, { status: 403 });
      }

      const name = safeWorkspaceName(body.name, email.split("@")[0] || "مالك Orvanta");
      const tenantId = normalizeTenantId(process.env.ORVANTA_TENANT_ID || DEFAULT_TENANT_ID);
      const workspaceName = safeWorkspaceName(body.workspaceName, "مساحة مؤسس Orvanta");
      let userId = "";

      try {
        const user = await createAuthIdentity(supabase, {
          email,
          password,
          name,
          tenantId,
          role: "OWNER",
          workspaceMode: "FOUNDER",
          platformOwner: true,
        });
        userId = user.id;
        await provisionWorkspaceUser(supabase, {
          userId,
          employeeId: `owner-${userId}`,
          workspaceId: tenantId,
          workspaceName,
          workspaceMode: "FOUNDER",
          plan: "FOUNDER",
          name,
          email,
          role: "OWNER",
          createWorkspace: true,
        });

        const completed = await completeFirstOwnerBootstrap(supabase, bootstrapToken, userId);
        if (!completed) throw new Error("تعذر تثبيت إعداد المالك الأول.");
        return signInResponse(supabase, email, password, true, true);
      } catch (error) {
        if (userId) await cleanupProvisionedUser(supabase, userId, tenantId, true);
        await releaseFirstOwnerBootstrap(supabase, bootstrapToken);
        throw error;
      }
    }

    if (action === "register_company") {
      validateRequired(email, password);
      validatePassword(password);
      const activationCode = normalizeCode(body.activationCode);
      if (!activationCode) {
        return NextResponse.json({ ok: false, error: "رمز تفعيل الشركة مطلوب." }, { status: 400 });
      }

      const { data, error } = await supabase.rpc("claim_orvanta_activation_code", {
        p_code_hash: hashCode(activationCode),
        p_email: email,
      });
      const claim = !error ? asClaim(data) : null;
      if (!claim) {
        return NextResponse.json({ ok: false, error: "رمز التفعيل غير صالح أو مستخدم أو منتهي." }, { status: 403 });
      }

      const name = safeWorkspaceName(body.name, email.split("@")[0] || "مالك الشركة");
      const companyName = safeWorkspaceName(body.companyName, claim.workspaceName);
      const tenantId = normalizeTenantId(claim.workspaceId);
      let userId = "";

      try {
        const user = await createAuthIdentity(supabase, {
          email,
          password,
          name,
          tenantId,
          role: "OWNER",
          workspaceMode: "COMPANY",
        });
        userId = user.id;
        await provisionWorkspaceUser(supabase, {
          userId,
          employeeId: `owner-${userId}`,
          workspaceId: tenantId,
          workspaceName: companyName,
          workspaceMode: "COMPANY",
          plan: claim.plan || "COMPANY",
          name,
          email,
          role: "OWNER",
          createWorkspace: true,
        });

        const completed = await supabase.rpc("complete_orvanta_activation_code", {
          p_id: claim.id,
          p_claim_token: claim.claimToken,
          p_user_id: userId,
        });
        if (completed.error || completed.data !== true) throw new Error("تعذر تثبيت ترخيص مساحة الشركة.");
        return signInResponse(supabase, email, password, trustedDevice, true);
      } catch (error) {
        if (userId) await cleanupProvisionedUser(supabase, userId, tenantId, true);
        await supabase.rpc("release_orvanta_activation_code", {
          p_id: claim.id,
          p_claim_token: claim.claimToken,
        });
        throw error;
      }
    }

    if (action === "join_company") {
      validateRequired(email, password);
      validatePassword(password);
      const inviteCode = normalizeCode(body.inviteCode);
      if (!inviteCode) {
        return NextResponse.json({ ok: false, error: "رمز الدعوة مطلوب." }, { status: 400 });
      }

      const { data, error } = await supabase.rpc("claim_orvanta_workspace_invite", {
        p_code_hash: hashCode(inviteCode),
        p_email: email,
      });
      const claim = !error ? asClaim(data) : null;
      if (!claim) {
        return NextResponse.json({ ok: false, error: "رمز الدعوة غير صالح أو لا يطابق البريد أو انتهت صلاحيته." }, { status: 403 });
      }

      const role = claim.role || "EMPLOYEE";
      const name = safeWorkspaceName(body.name, email.split("@")[0] || "عضو فريق");
      const tenantId = normalizeTenantId(claim.workspaceId);
      let userId = "";

      try {
        const user = await createAuthIdentity(supabase, {
          email,
          password,
          name,
          tenantId,
          role,
          workspaceMode: "COMPANY",
        });
        userId = user.id;
        await provisionWorkspaceUser(supabase, {
          userId,
          employeeId: `member-${userId}`,
          workspaceId: tenantId,
          workspaceName: claim.workspaceName,
          workspaceMode: "COMPANY",
          plan: "COMPANY",
          name,
          email,
          role,
          createWorkspace: false,
        });

        const completed = await supabase.rpc("complete_orvanta_workspace_invite", {
          p_id: claim.id,
          p_claim_token: claim.claimToken,
          p_user_id: userId,
        });
        if (completed.error || completed.data !== true) throw new Error("تعذر تثبيت عضوية الشركة.");
        return signInResponse(supabase, email, password, trustedDevice, true);
      } catch (error) {
        if (userId) await cleanupProvisionedUser(supabase, userId, tenantId, false);
        await supabase.rpc("release_orvanta_workspace_invite", {
          p_id: claim.id,
          p_claim_token: claim.claimToken,
        });
        throw error;
      }
    }

    if (action === "issue_company_activation") {
      const caller = await authenticateRequest(req);
      if (!caller || caller.tenantId !== normalizeTenantId(process.env.ORVANTA_TENANT_ID || DEFAULT_TENANT_ID) || !hasPermission(caller.role, "OWNER")) {
        return NextResponse.json({ ok: false, error: "هذه العملية متاحة لمالك منصة Orvanta فقط." }, { status: 403 });
      }

      const companyName = safeWorkspaceName(body.companyName, "شركة جديدة");
      const workspaceId = slugifyWorkspace(String(body.workspaceId || companyName));
      const code = randomAccessCode("ORV");
      const expiresDays = Math.max(1, Math.min(90, Number(body.expiresDays || 30)));
      const { error } = await supabase.from("workspace_activation_codes").insert({
        code_hash: hashCode(code),
        workspace_id: workspaceId,
        workspace_name: companyName,
        plan: String(body.plan || "COMPANY").slice(0, 40),
        status: "ACTIVE",
        expires_at: new Date(Date.now() + expiresDays * 86_400_000).toISOString(),
        created_by_user_id: caller.id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, code, workspaceId, companyName, expiresDays }, { status: 201 });
    }

    if (action === "issue_employee_invite") {
      const caller = await authenticateRequest(req);
      if (!caller || !hasPermission(caller.role, "MANAGER")) {
        return NextResponse.json({ ok: false, error: "لا تملك صلاحية إصدار دعوة موظف." }, { status: 403 });
      }

      const invitedEmail = normalizeEmail(body.invitedEmail);
      const requestedRole = String(body.role || "EMPLOYEE").toUpperCase() as UserRole;
      const allowedRoles: UserRole[] = ["CEO", "CFO", "COO", "CRO", "CGO", "MANAGER", "EMPLOYEE", "VIEWER"];
      const role = allowedRoles.includes(requestedRole) ? requestedRole : "EMPLOYEE";
      const code = randomAccessCode("TEAM");
      const expiresDays = Math.max(1, Math.min(30, Number(body.expiresDays || 14)));
      const { error } = await supabase.from("workspace_invites").insert({
        workspace_id: caller.tenantId,
        code_hash: hashCode(code),
        email: invitedEmail || null,
        role,
        status: "ACTIVE",
        expires_at: new Date(Date.now() + expiresDays * 86_400_000).toISOString(),
        created_by_user_id: caller.id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, code, email: invitedEmail || null, role, expiresDays }, { status: 201 });
    }

    return NextResponse.json({ ok: false, error: "عملية المصادقة غير معروفة." }, { status: 400 });
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
