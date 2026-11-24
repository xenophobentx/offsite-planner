// Offline hotel estimates: deterministic per city, clearly labelled as test data.

import type { HotelOption, HotelProvider, HotelQuery } from './types.js';

const NAMES = ['Central Plaza Hotel', 'Old Town Suites', 'Harbour View Hotel', 'Garden Court Hotel', 'City Loft Hotel'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class MockHotelProvider implements HotelProvider {
  name = 'mock';

  async search(q: HotelQuery): Promise<HotelOption[]> {
    const h = hash(q.city);
    const base = 85 + (h % 70);
    return [0, 1, 2].map((i) => ({
      name: `${q.city} ${NAMES[(h + i) % NAMES.length]}`,
      nightly: base + i * 18,
      currency: 'EUR',
      rating: Math.round((4.6 - i * 0.2) * 10) / 10,
      link: null,
      source: 'Mock estimate (not real rates)',
      is_test_data: true,
    }));
  }
}
