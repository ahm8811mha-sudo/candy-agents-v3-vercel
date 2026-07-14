/**
 * Request rate limiting.
 *
 * `checkRateLimitShared` is the limiter API routes should use: when Upstash
 * Redis is configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) the
 * counter is shared across all serverless instances; otherwise it degrades to
 * the in-memory per-instance window below. The sync `checkRateLimit` is kept
 * for legacy callers and tests.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** "shared" = Upstash-backed across instances; "instance" = this process only. */
  scope: "shared" | "instance";
};

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  const key = identifier;
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function isSharedRateLimitConfigured(): boolean {
  return Boolean(upstashConfig());
}

/**
 * Fixed-window counter in Upstash via REST pipeline: INCR + set the TTL only
 * when the key is fresh. One round-trip, atomic enough for request limiting.
 */
async function upstashIncrement(
  key: string,
  windowMs: number
): Promise<{ count: number; ttlMs: number } | null> {
  const config = upstashConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs), "NX"],
        ["PTTL", key],
      ]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const count = Number(data?.[0]?.result);
    const ttl = Number(data?.[2]?.result);
    if (!Number.isFinite(count)) return null;
    return { count, ttlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs };
  } catch {
    return null; // network trouble → caller falls back to the local window
  }
}

/**
 * Shared limiter for API routes. Fails open on Upstash trouble by falling
 * back to the per-instance window — availability beats strictness here.
 */
export async function checkRateLimitShared(
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const shared = await upstashIncrement(`orvanta:rl:${identifier}`, config.windowMs);
  if (shared) {
    const resetAt = Date.now() + shared.ttlMs;
    return {
      allowed: shared.count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - shared.count),
      resetAt,
      scope: "shared",
    };
  }

  const local = checkRateLimit(identifier, config);
  return { ...local, scope: "instance" };
}

export const AI_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 10 };
export const GENERAL_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 };

/** Test helper. */
export function _clearRateLimitStore(): void {
  store.clear();
}
