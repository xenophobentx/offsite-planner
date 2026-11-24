// Offline flight estimates. Deterministic: the same route always gives the same
// answer. Plausible numbers from distance, clearly labelled as test data.

import { cityByIata, distanceKm } from '../data/cities.js';
import type { FlightOption, FlightProvider, FlightQuery } from './types.js';

const CARRIERS = ['Lufthansa', 'Wizz Air', 'Ryanair', 'TAP Air Portugal', 'British Airways', 'LOT', 'Vueling', 'easyJet'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class MockFlightProvider implements FlightProvider {
  name = 'mock';

  async search(q: FlightQuery): Promise<FlightOption | null> {
    if (q.origin === q.destination) return null;
    const a = cityByIata(q.origin);
    const b = cityByIata(q.destination);
    const km = distanceKm(a, b);
    const h = hash([q.origin, q.destination].sort().join('-'));
    const stops = km < 1200 || h % 10 < 7 ? 0 : 1;
    const duration = Math.round(35 + (km / 780) * 60 + stops * 95);
    const price = Math.round((70 + 0.1 * km + (h % 60)) * (stops ? 1.2 : 1));
    return {
      price,
      currency: 'EUR',
      duration_min: duration,
      stops,
      carrier: CARRIERS[h % CARRIERS.length],
      source: 'Mock estimate from distance (not real fares)',
      is_test_data: true,
    };
  }
}
