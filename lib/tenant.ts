/**
 * Roadmap #2 — Multi-tenant groundwork.
 *
 * Orvanta is the platform; each company running on it is a tenant. Golden Star
 * is tenant zero. Until ORVANTA_MULTI_TENANT=true (after running
 * docs/supabase-multitenant.sql) everything behaves exactly as before; once
 * enabled, every persisted row is stamped with the tenant id and every hydrate
 * reads only this tenant's rows.
 */

export const DEFAULT_TENANT_ID = "golden-star";

export function getTenantId(): string {
  return process.env.ORVANTA_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
}

export function isMultiTenantEnabled(): boolean {
  return process.env.ORVANTA_MULTI_TENANT === "true";
}

/** Stamp a row with the tenant id when multi-tenancy is on (pure, testable). */
export function withTenant(row: Record<string, unknown>): Record<string, unknown> {
  return isMultiTenantEnabled() ? { ...row, tenant_id: getTenantId() } : row;
}
