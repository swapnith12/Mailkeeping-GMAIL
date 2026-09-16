import { redis } from "@/lib/redis";
import type { Category } from "@/lib/types";
import type { GmailMessageSummary } from "@/lib/gmail";
import type { SuggestedEvent } from "@/lib/types";

/**
 * Caches the *result* of classifying a message (category + any agent
 * suggestions), not the message content itself — the point is to skip
 * repeat Gmail metadata fetches and repeat Gemini calls for a message
 * we've already scanned, not to build an email store.
 *
 * Keyed on (googleSub, messageId) rather than messageId alone: Gmail
 * message IDs are already account-scoped, but keying explicitly means a
 * cache bug can never leak one account's classification into another's.
 *
 * TTL, not "forever": an email's content is immutable once sent, so in
 * principle the classification never goes stale — but the model, the
 * category set, or the classification prompt might change, and a TTL
 * bounds how long a scan can serve a decision made under an old prompt.
 * 6 hours means a user re-scanning the same inbox twice in a day pays for
 * Gmail/Gemini calls once, not twice. It also keeps Upstash's free-tier
 * command budget from being dominated by scan-cache writes that never age
 * out.
 */
const CACHE_TTL_SECONDS = 6 * 60 * 60;

export interface CachedScanResult extends GmailMessageSummary {
  category: Category;
  suggestedEvent?: SuggestedEvent | null;
  recommendedDelete?: boolean;
}

const cacheKey = (googleSub: string, id: string) => `cache:scan:${googleSub}:${id}`;

/**
 * Looks up cached results for a batch of message IDs in one round trip.
 * Returns only the hits — callers treat everything else as a cache miss.
 *
 * A cache outage degrades to "everything's a miss" rather than failing
 * the scan: Upstash is a managed dependency outside this app's control,
 * and the fallback (re-fetch and re-classify) is exactly what would
 * happen anyway before this cache layer existed.
 */
export async function getCachedScanResults(
  googleSub: string,
  ids: string[]
): Promise<Map<string, CachedScanResult>> {
  const hits = new Map<string, CachedScanResult>();
  if (ids.length === 0) return hits;

  try {
    const pipeline = redis.pipeline();
    for (const id of ids) pipeline.get(cacheKey(googleSub, id));
    // Upstash's client deserializes each JSON response for you — these
    // come back as the objects we stored, no manual JSON.parse needed.
    const results = await pipeline.exec<(CachedScanResult | null)[]>();
    results.forEach((value, i) => {
      if (value) hits.set(ids[i], value);
    });
  } catch (err) {
    console.error("Scan cache read failed, treating as a full miss:", err);
  }

  return hits;
}

/** Writes freshly-classified results back to the cache, one pipeline call. */
export async function setCachedScanResults(googleSub: string, items: CachedScanResult[]): Promise<void> {
  if (items.length === 0) return;

  try {
    const pipeline = redis.pipeline();
    for (const item of items) {
      pipeline.set(cacheKey(googleSub, item.id), item, { ex: CACHE_TTL_SECONDS });
    }
    await pipeline.exec();
  } catch (err) {
    // Not caching this batch just means the next scan redoes the work —
    // not worth failing a scan that already succeeded over.
    console.error("Scan cache write failed (non-fatal):", err);
  }
}

/**
 * Drops a single message's cached result. Called after a successful
 * delete so a trashed message can't reappear from cache in a scan that
 * runs before Gmail's own listing catches up.
 */
export async function invalidateCachedScanResult(googleSub: string, id: string): Promise<void> {
  try {
    await redis.del(cacheKey(googleSub, id));
  } catch (err) {
    // Best-effort — worst case a trashed email briefly still shows up
    // from a stale cache entry until its TTL expires.
    console.error("Scan cache invalidation failed (non-fatal):", err);
  }
}
