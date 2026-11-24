// Live hotel rates from Google Hotels through SerpApi (serpapi.com/google-hotels-api).
// Same key and quota as flights: one search per destination, cached for 6 hours.

import { getJson, UpstreamError } from '../lib/http.js';
import { TTL } from '../lib/cache.js';
import type { HotelOption, HotelProvider, HotelQuery } from './types.js';

interface SerpProperty {
  type?: string;
  name: string;
  link?: string;
  overall_rating?: number;
  rate_per_night?: { extracted_lowest?: number };
}
interface SerpHotelsResponse {
  error?: string;
  properties?: SerpProperty[];
}

const MIN_RATING = 4.0;

export class SerpApiHotelProvider implements HotelProvider {
  name = 'serpapi';

  constructor(private apiKey: string) {}

  async search(q: HotelQuery): Promise<HotelOption[]> {
    const params = new URLSearchParams({
      engine: 'google_hotels',
      q: `hotels in ${q.city}`,
      check_in_date: q.check_in,
      check_out_date: q.check_out,
      adults: '1',
      currency: 'EUR',
      hl: 'en',
      gl: q.country.toLowerCase(),
      rating: '8', // 4.0 and up
      hotel_class: '3,4', // business-grade hotels, no hostels or luxury
      api_key: this.apiKey,
    });
    const r = await getJson<SerpHotelsResponse>(`https://serpapi.com/search.json?${params}`, {
      source: 'SerpApi',
      cacheKey: `hotels:serpapi-v2-${q.city}-${q.check_in}-${q.check_out}`,
      ttlSeconds: TTL.flights,
      timeoutMs: 30000,
    });
    if (r.error) {
      if (/no results/i.test(r.error)) return [];
      throw new UpstreamError(`SerpApi: ${r.error}`, 'SerpApi');
    }
    return (r.properties ?? [])
      .filter((p) => (p.type ?? 'hotel') === 'hotel' && !/hostel/i.test(p.name))
      .filter((p) => typeof p.rate_per_night?.extracted_lowest === 'number' && (p.overall_rating ?? 0) >= MIN_RATING)
      .sort((a, b) => a.rate_per_night!.extracted_lowest! - b.rate_per_night!.extracted_lowest!)
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        nightly: p.rate_per_night!.extracted_lowest!,
        currency: 'EUR',
        rating: p.overall_rating ?? null,
        link: p.link ?? null,
        source: 'Google Hotels via SerpApi (live rates)',
        is_test_data: false,
      }));
  }
}
