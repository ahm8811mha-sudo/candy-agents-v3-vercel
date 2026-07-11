import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasPermission, isAuthEnabled, type AuthUser, type UserRole } from "../auth";
import { DEFAULT_TENANT_ID } from "../tenant";

export type CompanyRequestContext = {
  requestId: string;
  correlationId: string;
  tenantId: string;
  actor: AuthUser;
  systemCall: boolean;
};

export type ContextResult =
  | { ok: true; context: CompanyRequestContext }
  | { ok: false; response: NextResponse };

function requestedTenant(req: NextRequest) {
  return req.headers.get("x-orvanta-tenant-id")?.trim() || "";
}

export async function requireCompanyContext(
  req: NextRequest,
  minRole: UserRole = "VIEWER"
): Promise<ContextResult> {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const correlationId = req.headers.get("x-correlation-id")?.trim() || requestId;
  const actor = await authenticateRequest(req);

  if (!actor) {
    if (!isAuthEnabled() && process.env.NODE_ENV !== "production") {
      const tenantId = requestedTenant(req) || process.env.ORVANTA_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
      return {
        ok: true,
        context: {
          requestId,
          correlationId,
          tenantId,
          actor: {
            id: "development-owner",
            email: "owner@localhost",
            role: "ADMIN",
            name: "Development Owner",
            tenantId,
            authMethod: "SYSTEM_KEY",
          },
          systemCall: true,
        },
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", error: "يلزم تسجيل الدخول لتنفيذ هذا الإجراء.", requestId },
        { status: 401 }
      ),
    };
  }

  if (!hasPermission(actor.role, minRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "INSUFFICIENT_ROLE", error: "لا تملك الصلاحية المطلوبة.", requestId },
        { status: 403 }
      ),
    };
  }

  const headerTenant = requestedTenant(req);
  const systemCall = actor.authMethod === "SYSTEM_KEY" || actor.authMethod === "CRON";
  if (headerTenant && !systemCall && headerTenant !== actor.tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "TENANT_MISMATCH", error: "لا يمكن الوصول إلى بيانات شركة أخرى.", requestId },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      requestId,
      correlationId,
      tenantId: headerTenant || actor.tenantId,
      actor,
      systemCall,
    },
  };
}

export function contextHeaders(context: CompanyRequestContext) {
  return {
    "x-request-id": context.requestId,
    "x-correlation-id": context.correlationId,
  };
}
