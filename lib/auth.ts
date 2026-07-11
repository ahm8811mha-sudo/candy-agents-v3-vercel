import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { DEFAULT_TENANT_ID } from "./tenant";

export const ACCESS_COOKIE = "orvanta_access_token";
export const REFRESH_COOKIE = "orvanta_refresh_token";

export type UserRole =
  | "ADMIN"
  | "OWNER"
  | "CEO"
  | "CFO"
  | "COO"
  | "CRO"
  | "CGO"
  | "MANAGER"
  | "EMPLOYEE"
  | "VIEWER";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tenantId: string;
  departmentId?: string;
  authMethod?: "SUPABASE" | "SYSTEM_KEY" | "CRON" | "BASIC_DEV";
};

const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 100,
  OWNER: 100,
  CEO: 90,
  CFO: 80,
  COO: 80,
  CRO: 80,
  CGO: 80,
  MANAGER: 60,
  EMPLOYEE: 40,
  VIEWER: 10,
};

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, value);
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isPersonalOwnerMode(): boolean {
  return process.env.ORVANTA_PERSONAL_MODE !== "false";
}

export function personalOwnerUser(): AuthUser {
  return {
    id: "private-owner",
    email: process.env.ORVANTA_OWNER_EMAIL?.trim() || "ahm8811mha@gmail.com",
    role: "OWNER",
    name: process.env.ORVANTA_OWNER_NAME?.trim() || "أحمد ناصر الأحمد",
    tenantId: process.env.ORVANTA_TENANT_ID?.trim() || DEFAULT_TENANT_ID,
    authMethod: "SYSTEM_KEY",
  };
}

function secureEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeTenant(value: unknown): string {
  const tenant = typeof value === "string" ? value.trim() : "";
  if (!tenant) return process.env.ORVANTA_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(tenant)) throw new Error("Invalid tenant identifier.");
  return tenant;
}

function parseBasicAuth(header: string): { email: string; password: string } | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    const email = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (email && password) return { email, password };
  } catch {
    // invalid base64
  }
  return null;
}

function systemTenant(req: NextRequest) {
  return normalizeTenant(req.headers.get("x-orvanta-tenant-id"));
}

export async function authenticateRequest(req: NextRequest): Promise<AuthUser | null> {
  const apiKey = req.headers.get("x-api-key");
  if (secureEqual(apiKey, process.env.API_SECRET_KEY)) {
    return {
      id: "system",
      email: "system@orvanta.local",
      role: "ADMIN",
      name: "Orvanta System",
      tenantId: systemTenant(req),
      authMethod: "SYSTEM_KEY",
    };
  }

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (secureEqual(token, process.env.CRON_SECRET)) {
      return {
        id: "cron",
        email: "cron@orvanta.local",
        role: "ADMIN",
        name: "Orvanta Scheduler",
        tenantId: systemTenant(req),
        authMethod: "CRON",
      };
    }
    const verified = await verifySupabaseToken(token);
    if (verified) return verified;
  }

  const cookieToken = req.cookies.get(ACCESS_COOKIE)?.value;
  if (cookieToken) {
    const user = await verifySupabaseToken(cookieToken);
    if (user) return user;
  }

  // The current installation is intentionally a private, single-user owner
  // workspace. Every internal browser request receives the same OWNER context;
  // no login, employee, company or invitation flow is part of this version.
  if (isPersonalOwnerMode()) return personalOwnerUser();

  // Refresh tokens are rotated only by /api/auth, which can also replace both
  // HttpOnly cookies. A generic API request must never consume a refresh token
  // without returning the replacement token to the browser.

  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_BASIC_AUTH === "true") {
    const basic = parseBasicAuth(authHeader);
    if (basic) return verifyCredentials(basic.email, basic.password);
  }

  return null;
}

export async function authUserFromSupabaseUser(dataUser: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): Promise<AuthUser> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Authentication service unavailable.");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, role, department_id")
    .eq("email", dataUser.email)
    .maybeSingle();

  const metadataRole = String(dataUser.app_metadata?.role || "").toUpperCase();
  const employeeRole = String(employee?.role || "").toUpperCase();
  const resolvedRole: UserRole = isUserRole(metadataRole)
    ? metadataRole
    : isUserRole(employeeRole)
      ? employeeRole
      : "VIEWER";
  const tenantId = normalizeTenant(dataUser.app_metadata?.tenant_id || dataUser.user_metadata?.tenant_id);

  return {
    id: employee?.id || dataUser.id,
    email: dataUser.email || "",
    role: resolvedRole,
    name: employee?.full_name || String(dataUser.user_metadata?.full_name || dataUser.email || ""),
    tenantId,
    departmentId: employee?.department_id,
    authMethod: "SUPABASE",
  };
}

async function verifySupabaseToken(token: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return authUserFromSupabaseUser(data.user);
}

async function verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const user = await authUserFromSupabaseUser(data.user);
  return { ...user, authMethod: "BASIC_DEV" };
}

export function requireAuth(user: AuthUser | null, minRole: UserRole = "VIEWER"): NextResponse | null {
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "غير مصرح. يرجى تسجيل الدخول." },
      { status: 401 }
    );
  }
  if (!hasPermission(user.role, minRole)) {
    return NextResponse.json(
      { ok: false, error: "لا تملك صلاحية كافية لهذا الإجراء." },
      { status: 403 }
    );
  }
  return null;
}

export function isAuthEnabled(): boolean {
  return !isPersonalOwnerMode() && process.env.AUTH_ENABLED === "true";
}
