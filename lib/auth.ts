import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase";

export type UserRole = "ADMIN" | "CEO" | "CFO" | "MANAGER" | "EMPLOYEE" | "VIEWER";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  departmentId?: string;
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

function parseBasicAuth(header: string): { email: string; password: string } | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const [email, password] = decoded.split(":");
    if (email && password) return { email, password };
  } catch {
    // invalid base64
  }
  return null;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthUser | null> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey && apiKey === process.env.API_SECRET_KEY) {
    return {
      id: "system",
      email: "system@candy-agents.local",
      role: "ADMIN",
      name: "System",
    };
  }

  const authHeader = req.headers.get("authorization") || "";

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifySupabaseToken(token);
  }

  const basic = parseBasicAuth(authHeader);
  if (basic) {
    return verifyCredentials(basic.email, basic.password);
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
    .single();

  return {
    id: employee?.id || data.user.id,
    email: data.user.email || "",
    role: (employee?.role as UserRole) || "VIEWER",
    name: employee?.full_name || data.user.email || "",
    departmentId: employee?.department_id,
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
    .single();

  return {
    id: employee?.id || data.user.id,
    email: data.user.email || "",
    role: (employee?.role as UserRole) || "VIEWER",
    name: employee?.full_name || data.user.email || "",
    departmentId: employee?.department_id,
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
  return Boolean(process.env.AUTH_ENABLED === "true");
}
