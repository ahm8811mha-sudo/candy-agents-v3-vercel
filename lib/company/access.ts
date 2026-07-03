/**
 * F2 — Authority enforcement for governed decisions (docs/ROADMAP.md).
 *
 * Maps the financial authority matrix (§5) onto auth roles and decides — in the
 * API, not just the UI — whether a given role may sign off a given tier.
 * When auth is disabled the system runs in single-owner mode (the implicit
 * owner may approve anything), preserving current behavior; when AUTH_ENABLED
 * is set, tier limits are enforced with a 403.
 */

import type { UserRole } from "../auth";
import { hasPermission, isAuthEnabled } from "../auth";

/** Minimum role required to sign off each tier. */
const TIER_MIN_ROLE: Record<string, UserRole> = {
  T0: "MANAGER",
  T1: "CEO",
  T2: "ADMIN", // the owner
  T3: "ADMIN", // the owner (+ feasibility, enforced upstream)
};

export function minRoleForTier(tier: string): UserRole {
  return TIER_MIN_ROLE[tier] || "ADMIN";
}

export function canApproveTier(role: UserRole, tier: string): boolean {
  return hasPermission(role, minRoleForTier(tier));
}

export type AccessDecision = { allowed: boolean; reason: string; requiredRole: UserRole };

/**
 * The single decision point used by the approval API.
 * - Single-owner mode (auth off): always allowed.
 * - Auth on: the role must clear the tier's minimum.
 */
export function canSignOff(role: UserRole | null, tier: string): AccessDecision {
  const requiredRole = minRoleForTier(tier);
  if (!isAuthEnabled()) {
    return { allowed: true, reason: "وضع المالك الفردي (المصادقة غير مفعّلة).", requiredRole };
  }
  if (!role) {
    return { allowed: false, reason: "يلزم تسجيل الدخول لاعتماد هذا القرار.", requiredRole };
  }
  if (!canApproveTier(role, tier)) {
    return { allowed: false, reason: `هذه الفئة (${tier}) تتطلب صلاحية ${requiredRole} على الأقل.`, requiredRole };
  }
  return { allowed: true, reason: "مصرّح.", requiredRole };
}
