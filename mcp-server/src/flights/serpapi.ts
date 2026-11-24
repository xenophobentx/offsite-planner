// Live Google Flights results through SerpApi (serpapi.com/google-flights-api).
// Free plan: 250 searches/month, so every route is cached for 6 hours.

import { getJson, UpstreamError } from '../lib/http.js';
import { TTL } from '../lib/cache.js';
import type { FlightOption, FlightProvider, FlightQuery } from './types.js';

interface SerpLeg {
  airline: string;
  duration: number;
}
interface SerpItinerary {
  flights: SerpLeg[];
  total_duration: number;
  price?: number;
}
interface SerpResponse {
  search_metadata?: { status?: string };
  error?: string;
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
}

export class SerpApiFlightProvider implements FlightProvider {
  name = 'serpapi';

  constructor(private apiKey: string) {}

  async search(q: FlightQuery): Promise<FlightOption | null> {
    if (q.origin === q.destination) return null;
    const params = new URLSearchParams({
      engine: 'google_flights',
      departure_id: q.origin,
      arrival_id: q.destination,
      outbound_date: q.date,
      return_date: q.return_date,
      type: '1', // round trip
      currency: 'EUR',
      hl: 'en',
      api_key: this.apiKey,
    });
    const r = await getJson<SerpResponse>(`https://serpapi.com/search.json?${params}`, {
      source: 'SerpApi',
      cacheKey: `flights:serpapi-${q.origin}-${q.destination}-${q.date}-${q.return_date}`,
      ttlSeconds: TTL.flights,
      timeoutMs: 30000,
    });
    if (r.error) {
      if (/no results/i.test(r.error)) return null;
      throw new UpstreamError(`SerpApi: ${r.error}`, 'SerpApi');
    }
    const priced = [...(r.best_flights ?? []), ...(r.other_flights ?? [])].filter((f) => typeof f.price === 'number');
    if (priced.length === 0) return null;
    // Google's "best" list first; among those, the cheapest.
    const pool = (r.best_flights ?? []).filter((f) => typeof f.price === 'number');
    const pick = (pool.length ? pool : priced).reduce((a, b) => (b.price! < a.price! ? b : a));
    return {
      price: pick.price!,
      currency: 'EUR',
      duration_min: pick.total_duration,
      stops: Math.max(0, pick.flights.length - 1),
      carrier: [...new Set(pick.flights.map((l) => l.airline))].join(' + '),
      source: 'Google Flights via SerpApi (live fares)',
      is_test_data: false,
    };
  }
}
