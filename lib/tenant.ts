/**
 * Orvanta tenant boundary.
 *
 * Legacy modules may still use the deployment tenant from environment. New
 * company-OS routes must pass an authenticated tenant id explicitly so a
 * request can never select another company's data by changing a query string.
 */

export const DEFAULT_TENANT_ID = "golden-star";
const TENANT_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/i;

export function normalizeTenantId(value?: string | null): string {
  const tenant = value?.trim() || process.env.ORVANTA_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
  if (!TENANT_PATTERN.test(tenant)) throw new Error("Invalid tenant identifier.");
  return tenant;
}

export function getTenantId(): string {
  return normalizeTenantId(process.env.ORVANTA_TENANT_ID);
}

export function isMultiTenantEnabled(): boolean {
  return process.env.ORVANTA_MULTI_TENANT === "true";
}

export function assertTenantAccess(actorTenantId: string, requestedTenantId: string): string {
  const actor = normalizeTenantId(actorTenantId);
  const requested = normalizeTenantId(requestedTenantId);
  if (actor !== requested) throw new Error("Cross-tenant access denied.");
  return requested;
}

/** Stamp a row with either an explicit authenticated tenant or the deployment tenant. */
export function withTenant(row: Record<string, unknown>, tenantId?: string): Record<string, unknown> {
  if (!isMultiTenantEnabled() && !tenantId) return row;
  return { ...row, tenant_id: normalizeTenantId(tenantId) };
}
