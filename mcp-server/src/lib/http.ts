// fetch wrapper: timeout, JSON, cache, and a source note for transparency.

import { getCache } from './cache.js';

const USER_AGENT = 'offsite-planner-mcp/1.1';

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly source: string
  ) {
    super(message);
  }
}

export async function getJson<T>(
  url: string,
  opts: { source: string; cacheKey?: string; ttlSeconds?: number; timeoutMs?: number }
): Promise<T> {
  const cache = getCache();
  if (opts.cacheKey) {
    const hit = await cache.get<T>(opts.cacheKey);
    if (hit !== undefined) return hit;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  }).catch((err: Error) => {
    throw new UpstreamError(`${opts.source}: ${err.message}`, opts.source);
  });
  if (!res.ok) throw new UpstreamError(`${opts.source}: HTTP ${res.status}`, opts.source);
  const body = (await res.json()) as T;
  if (opts.cacheKey && opts.ttlSeconds) await cache.set(opts.cacheKey, body, opts.ttlSeconds);
  return body;
}

/** Runs async jobs with a concurrency limit, keeping input order. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
