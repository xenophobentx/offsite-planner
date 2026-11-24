// Currency conversion to EUR with ECB reference rates (Frankfurter).

import { getJson, UpstreamError } from './http.js';
import { TTL } from './cache.js';

export const FX_SOURCE = 'ECB reference rates via Frankfurter (frankfurter.dev)';

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

export interface FxTable {
  date: string;
  /** units of currency per 1 EUR */
  rates: Record<string, number>;
}

export async function getEurRates(currencies: string[]): Promise<FxTable> {
  const wanted = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== 'EUR'))].sort();
  if (wanted.length === 0) return { date: new Date().toISOString().slice(0, 10), rates: {} };
  const r = await getJson<FrankfurterResponse>(
    `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${wanted.join(',')}`,
    { source: 'Frankfurter', cacheKey: `fx:${wanted.join('-')}`, ttlSeconds: TTL.fx }
  );
  return { date: r.date, rates: r.rates };
}

export function toEur(amount: number, currency: string, fx: FxTable): number {
  const c = currency.toUpperCase();
  if (c === 'EUR') return amount;
  const rate = fx.rates[c];
  if (!rate) throw new UpstreamError(`Frankfurter: no EUR rate for ${c}`, 'Frankfurter');
  return amount / rate;
}
