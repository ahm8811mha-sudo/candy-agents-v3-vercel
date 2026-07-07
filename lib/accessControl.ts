import type { NextRequest } from "next/server";

export type AccessRole = "OWNER" | "ADMIN" | "CEO" | "STAFF";

export type AccessActor = {
  id: string;
  role: AccessRole;
  name: string;
};

function readSecret(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return bearer || req.headers.get("x-orvanta-access") || "";
}

export function accessIsConfigured() {
  return Boolean(process.env.ORVANTA_OWNER_SECRET || process.env.ORVANTA_ADMIN_SECRET || process.env.ORVANTA_CEO_SECRET);
}

export async function authenticateRequest(req: NextRequest): Promise<AccessActor | null> {
  const secret = readSecret(req).trim();
  if (!secret) return null;

  if (process.env.ORVANTA_OWNER_SECRET && secret === process.env.ORVANTA_OWNER_SECRET) {
    return { id: "owner", role: "OWNER", name: "Owner" };
  }
  if (process.env.ORVANTA_ADMIN_SECRET && secret === process.env.ORVANTA_ADMIN_SECRET) {
    return { id: "admin", role: "ADMIN", name: "Admin" };
  }
  if (process.env.ORVANTA_CEO_SECRET && secret === process.env.ORVANTA_CEO_SECRET) {
    return { id: "ceo", role: "CEO", name: "CEO" };
  }
  return null;
}

export function requireAccess(actor: AccessActor | null, allowed: AccessRole[]) {
  if (!actor) throw new Error("AUTH_REQUIRED");
  if (!allowed.includes(actor.role)) throw new Error("FORBIDDEN_ROLE");
  return actor;
}
