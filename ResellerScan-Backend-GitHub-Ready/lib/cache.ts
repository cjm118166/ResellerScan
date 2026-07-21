// Lightweight in-process TTL cache and fixed-window rate limiter.
// Suitable for a small Vercel deployment. Swap for Upstash/Redis when you need
// consistency across serverless instances.

type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

/** Response schema version — part of the cache key so shape changes never collide. */
export const RESPONSE_VERSION = "v3";
export const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

const MAX_CACHE_ENTRIES = 1_000;
const MAX_RATE_ENTRIES = 5_000;
let operationCount = 0;

function pruneExpiredState(now = Date.now()): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }

  for (const [key, entry] of rateStore) {
    if (now - entry.windowStart >= entry.windowMs) rateStore.delete(key);
  }

  while (store.size > MAX_CACHE_ENTRIES) {
    const oldest = store.keys().next().value as string | undefined;
    if (!oldest) break;
    store.delete(oldest);
  }

  while (rateStore.size > MAX_RATE_ENTRIES) {
    const oldest = rateStore.keys().next().value as string | undefined;
    if (!oldest) break;
    rateStore.delete(oldest);
  }
}

function occasionallyPrune(): void {
  operationCount += 1;
  if (operationCount % 100 === 0) pruneExpiredState();
}

export function getCached<T>(key: string): T | undefined {
  occasionallyPrune();
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  occasionallyPrune();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Cache key includes normalized barcode, resolved type, marketplace, and response
 * version. New and Used come from one fetched candidate set, so the full snapshot
 * is cached as one value.
 */
export function buildCacheKey(
  resolvedBarcode: string,
  resolvedBarcodeType: string,
  marketplace: string,
): string {
  return `${RESPONSE_VERSION}:${marketplace}:${resolvedBarcodeType}:${resolvedBarcode}`;
}

// --- Fixed-window rate limiter ---------------------------------------------

type RateEntry = { count: number; windowStart: number; windowMs: number };
const rateStore = new Map<string, RateEntry>();

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

const DEFAULT_RATE: RateLimitOptions = { limit: 30, windowMs: 60_000 };

/** Return true when allowed and false when the caller is throttled. */
export function checkRateLimit(
  identifier: string,
  opts: RateLimitOptions = DEFAULT_RATE,
): boolean {
  occasionallyPrune();
  const now = Date.now();
  const entry = rateStore.get(identifier);

  if (!entry || now - entry.windowStart >= opts.windowMs) {
    rateStore.set(identifier, {
      count: 1,
      windowStart: now,
      windowMs: opts.windowMs,
    });
    return true;
  }

  if (entry.count >= opts.limit) return false;
  entry.count += 1;
  return true;
}

/** Test helper to reset all in-memory state. */
export function __resetCacheForTests(): void {
  store.clear();
  rateStore.clear();
  operationCount = 0;
}
