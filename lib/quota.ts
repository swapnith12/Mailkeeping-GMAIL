import { redis } from "@/lib/redis";

// How many scans a free account gets per day. Adjust as you tune the product.
const DAILY_SCAN_LIMIT = 3;
const SECONDS_IN_A_DAY = 24 * 60 * 60;

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Enforces the free-tier scan quota, keyed on googleSub (the stable Google
 * account id) rather than a session/cookie — this is what survives a
 * cookie clear or browser switch, closing the cheap bypass we discussed.
 *
 * One counter key per account per UTC day; it auto-expires via Redis TTL,
 * so there's nothing to clean up and no separate "reset" job needed.
 */
export async function checkAndConsumeScanQuota(googleSub: string): Promise<QuotaResult> {
  const key = `quota:scan:${googleSub}:${todayUtc()}`;

  const used = await redis.incr(key);
  if (used === 1) {
    // Only set the expiry on the first increment of the day — otherwise
    // every subsequent scan would push the expiry further out.
    await redis.expire(key, SECONDS_IN_A_DAY);
  }

  return { allowed: used <= DAILY_SCAN_LIMIT, used, limit: DAILY_SCAN_LIMIT };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
