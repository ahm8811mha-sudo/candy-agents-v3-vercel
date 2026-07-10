import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { DEFAULT_TENANT_ID } from "./tenant";

export type UserRole = "ADMIN" | "CEO" | "CFO" | "MANAGER" | "EMPLOYEE" | "VIEWER";

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
  CEO: 90,
  CFO: 80,
  MANAGER: 60,
  EMPLOYEE: 40,
  VIEWER: 10,
};

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
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
    return verifySupabaseToken(token);
  }

  // Basic authentication is deliberately restricted to explicit local/dev use.
  // It must never be part of the production user journey.
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_BASIC_AUTH === "true") {
    const basic = parseBasicAuth(authHeader);
    if (basic) return verifyCredentials(basic.email, basic.password);
  }

  return null;
}

async function verifySupabaseToken(token: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, role, department_id")
    .eq("email", data.user.email)
    .maybeSingle();

  const metadataRole = String(data.user.app_metadata?.role || "").toUpperCase() as UserRole;
  const role = employee?.role as UserRole | undefined;
  const resolvedRole = role && ROLE_HIERARCHY[role] ? role : ROLE_HIERARCHY[metadataRole] ? metadataRole : "VIEWER";
  const tenantId = normalizeTenant(data.user.app_metadata?.tenant_id || data.user.user_metadata?.tenant_id);

  return {
    id: employee?.id || data.user.id,
    email: data.user.email || "",
    role: resolvedRole,
    name: employee?.full_name || data.user.user_metadata?.full_name || data.user.email || "",
    tenantId,
    departmentId: employee?.department_id,
    authMethod: "SUPABASE",
  };
}

async function verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, role, department_id")
    .eq("email", data.user.email)
    .maybeSingle();

  return {
    id: employee?.id || data.user.id,
    email: data.user.email || "",
    role: (employee?.role as UserRole) || "VIEWER",
    name: employee?.full_name || data.user.email || "",
    tenantId: normalizeTenant(data.user.app_metadata?.tenant_id || data.user.user_metadata?.tenant_id),
    departmentId: employee?.department_id,
    authMethod: "BASIC_DEV",
  };
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
  return process.env.AUTH_ENABLED === "true";
}
