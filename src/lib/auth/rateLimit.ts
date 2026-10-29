/**
 * Login brute-force protection: after MAX_FAILURES failed attempts for the same IP+email within
 * WINDOW_MS, further attempts are rejected until the oldest failure ages out.
 *
 * In-memory => per server instance. Fine for a single node; behind multiple instances or serverless,
 * swap the Map for Redis/Postgres (same three functions).
 */
const WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list); else failures.delete(key);
  return list;
}

export function loginAllowed(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  const list = recent(key, now);
  if (list.length < MAX_FAILURES) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.ceil((list[0] + WINDOW_MS - now) / 1000) };
}

export function recordLoginFailure(key: string, now = Date.now()) {
  failures.set(key, [...recent(key, now), now]);
}

export const clearLoginFailures = (key: string) => { failures.delete(key); };

export const _resetRateLimit = () => failures.clear();
