import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareDestinations, InputError } from '../src/compare.js';
import { findCity, distanceKm } from '../src/data/cities.js';
import { MockFlightProvider } from '../src/flights/mock.js';
import { MockHotelProvider } from '../src/hotels/mock.js';
import { SerpApiHotelProvider } from '../src/hotels/serpapi.js';
import { MemoryCache, setCache } from '../src/lib/cache.js';
import { roundTripCo2Kg } from '../src/lib/co2.js';
import { weatherScore } from '../src/lib/climate.js';
import { findWindows } from '../src/lib/holidays.js';
import { DEFAULT_WEIGHTS, normaliseWeights, score } from '../src/lib/scoring.js';

// Fake upstream APIs: warm, mostly dry weather that gets hotter further south,
// and fixed ECB rates.
function fakeFetch(url: string | URL): Promise<Response> {
  const u = new URL(String(url));
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  if (u.host === 'archive-api.open-meteo.com') {
    const lat = Number(u.searchParams.get('latitude'));
    const days = 30;
    return json({
      daily: {
        time: Array.from({ length: days }, (_, i) => `d${i}`),
        temperature_2m_max: Array(days).fill(Math.round(50 - lat * 0.6)),
        precipitation_sum: Array.from({ length: days }, (_, i) => (i % 6 === 0 ? 3 : 0)),
        sunshine_duration: Array(days).fill(10 * 3600),
      },
    });
  }
  if (u.host === 'api.frankfurter.dev') return json({ base: 'EUR', date: '2026-11-10', rates: { GBP: 0.84 } });
  return Promise.resolve(new Response('not found', { status: 404 }));
}

beforeEach(() => {
  setCache(new MemoryCache());
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterEach(() => vi.unstubAllGlobals());

const TEAM = [
  { city: 'Budapest', count: 4 },
  { city: 'London', count: 2 },
  { city: 'Warsaw', count: 2 },
  { city: 'Lisbon', count: 2 },
];

describe('cities', () => {
  it('finds cities by name, alias, accent-free spelling and IATA', () => {
    expect(findCity('budapest')?.iata).toBe('BUD');
    expect(findCity('Warszawa')?.iata).toBe('WAW');
    expect(findCity('Zurich')?.iata).toBe('ZRH');
    expect(findCity('lhr')?.name).toBe('London');
    expect(findCity('Atlantis')).toBeUndefined();
  });
  it('computes great-circle distance', () => {
    expect(distanceKm(findCity('BUD')!, findCity('LIS')!)).toBeGreaterThan(2400);
    expect(distanceKm(findCity('BUD')!, findCity('LIS')!)).toBeLessThan(2600);
  });
});

describe('holiday windows', () => {
  it('skips windows that contain a holiday and reports adjacent ones', () => {
    // June 2027: Tuesdays are 1, 8, 15, 22, 29.
    const holidays = [
      { date: '2027-06-09', country: 'PL', name: 'Corpus Christi' },
      { date: '2027-06-21', country: 'HU', name: 'Test day' },
    ];
    const w = findWindows(2027, 6, 2, 2, holidays);
    expect(w.map((x) => x.start)).toEqual(['2027-06-01', '2027-06-15', '2027-06-22', '2027-06-29']);
    expect(w[0].days).toEqual(['2027-06-01', '2027-06-02', '2027-06-03']);
    expect(w.find((x) => x.start === '2027-06-22')!.near_holidays[0]).toContain('Test day');
  });
});

describe('scoring', () => {
  it('normalises weights to sum 1 and ignores negatives', () => {
    const w = normaliseWeights({ cost: 2, travel_time: 0, weather: 0, co2: 0, stops: -5 });
    expect(w.cost).toBe(1);
    expect(normaliseWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
  });
  it('ranks the dominant option first and breaks ties on cost', () => {
    const m = (cost: number) => ({ total_cost_eur: cost, avg_travel_min: 120, weather_score: 80, total_co2_kg: 1000, avg_stops: 0 });
    const r = score([{ id: 'a', metrics: m(2000) }, { id: 'b', metrics: m(1500) }], DEFAULT_WEIGHTS);
    expect(r[0].id).toBe('b');
    expect(r[0].score).toBe(100);
    expect(r[1].rank).toBe(2);
  });
});

describe('weather and CO2', () => {
  it('scores 24 °C dry weather highest', () => {
    const base = { rain_mm_day: 0, rainy_day_share: 0, sunshine_h_day: 10, years: [] };
    expect(weatherScore({ ...base, avg_max_c: 24 })).toBe(100);
    expect(weatherScore({ ...base, avg_max_c: 34 })).toBe(60);
    expect(weatherScore({ ...base, avg_max_c: 24, rainy_day_share: 0.5 })).toBe(80);
  });
  it('adds CO2 for indirect flights', () => {
    const a = findCity('BUD')!;
    const b = findCity('LIS')!;
    expect(roundTripCo2Kg(a, b, 1)).toBeGreaterThan(roundTripCo2Kg(a, b, 0));
  });
});

describe('mock flights', () => {
  it('is deterministic and labelled as test data', async () => {
    const p = new MockFlightProvider();
    const q = { origin: 'BUD', destination: 'BCN', date: '2027-06-15', return_date: '2027-06-17' };
    const a = await p.search(q);
    expect(a).toEqual(await p.search(q));
    expect(a!.is_test_data).toBe(true);
    expect(await p.search({ ...q, destination: 'BUD' })).toBeNull();
  });
});

describe('compare_destinations', () => {
  const input = { origins: TEAM, date: '2027-06-15', return_date: '2027-06-17', destinations: ['Barcelona', 'Porto', 'Split'] };

  it('returns a ranked, compact table', async () => {
    const out = await compareDestinations(input, new MockFlightProvider());
    expect(out.travellers).toBe(10);
    expect(out.destinations).toHaveLength(3);
    expect(out.destinations.map((d) => d.rank)).toEqual([1, 2, 3]);
    expect(out.destinations[0].by_origin).toHaveLength(4);
    expect(out.is_test_data).toBe(true);
    expect(out.notes.join(' ')).toMatch(/test data/);
    expect(JSON.stringify(out).length).toBeLessThan(4500);
  });

  it('sums flights per person count and adds the hotel', async () => {
    const out = await compareDestinations(input, new MockFlightProvider());
    const d = out.destinations[0];
    expect(d.flights_cost_eur).toBe(d.by_origin.reduce((s, r) => s + r.price_eur * r.count, 0));
    expect(out.nights).toBe(2);
    expect(out.rooms).toBe(10);
    expect(d.hotel_cost_eur).toBe(d.hotel.nightly_eur * 2 * 10);
    expect(d.total_cost_eur).toBe(d.flights_cost_eur + d.hotel_cost_eur);
    expect(d.hotel_alternatives).toHaveLength(2);
    expect(out.notes.join(' ')).toMatch(/Hotel rates are test data/);
  });

  it('uses the given room count', async () => {
    const out = await compareDestinations({ ...input, rooms: 6 }, new MockFlightProvider());
    expect(out.rooms).toBe(6);
    expect(out.destinations[0].hotel_cost_eur).toBe(out.destinations[0].hotel.nightly_eur * 2 * 6);
  });

  it('excludes a destination without hotel rates', async () => {
    const hotels = new MockHotelProvider();
    const real = hotels.search.bind(hotels);
    hotels.search = async (q) => (q.city === 'Porto' ? [] : real(q));
    const out = await compareDestinations(input, new MockFlightProvider(), hotels);
    expect(out.destinations.map((d) => d.iata)).not.toContain('OPO');
    expect(out.excluded[0].reason).toMatch(/hotel/);
  });

  it('picks 3 destinations when none are given, never an origin city', async () => {
    const out = await compareDestinations({ ...input, destinations: undefined }, new MockFlightProvider());
    expect(out.destinations).toHaveLength(3);
    const origins = ['BUD', 'LHR', 'WAW', 'LIS'];
    expect(out.destinations.every((d) => !origins.includes(d.iata))).toBe(true);
  });

  it('excludes a destination with a missing route', async () => {
    const provider = new MockFlightProvider();
    const real = provider.search.bind(provider);
    provider.search = async (q) => (q.destination === 'SPU' && q.origin === 'LIS' ? null : real(q));
    const out = await compareDestinations(input, provider);
    expect(out.destinations.map((d) => d.iata)).not.toContain('SPU');
    expect(out.excluded[0].reason).toContain('Lisbon');
  });

  it('converts non-EUR prices', async () => {
    const provider = new MockFlightProvider();
    const real = provider.search.bind(provider);
    provider.search = async (q) => {
      const r = await real(q);
      return r && q.origin === 'LHR' ? { ...r, price: 84, currency: 'GBP' } : r;
    };
    const out = await compareDestinations(input, provider);
    const london = out.destinations[0].by_origin.find((r) => r.origin === 'London')!;
    expect(london.price_eur).toBe(100);
  });

  it('rejects bad input with a clear message', async () => {
    await expect(compareDestinations({ ...input, origins: [{ city: 'Atlantis', count: 1 }] })).rejects.toThrow(InputError);
    await expect(compareDestinations({ ...input, return_date: '2027-06-14' })).rejects.toThrow(/after/);
  });
});

describe('SerpApi hotels', () => {
  it('keeps hotels rated 4.0+, cheapest first, at most 3', async () => {
    const body = {
      properties: [
        { type: 'hotel', name: 'Pricey', overall_rating: 4.7, rate_per_night: { extracted_lowest: 240 }, link: 'https://a' },
        { type: 'hotel', name: 'Cheap but bad', overall_rating: 3.2, rate_per_night: { extracted_lowest: 40 } },
        { type: 'hotel', name: 'Party Hostel One', overall_rating: 4.6, rate_per_night: { extracted_lowest: 30 } },
        { type: 'vacation rental', name: 'Flat', overall_rating: 4.9, rate_per_night: { extracted_lowest: 60 } },
        { type: 'hotel', name: 'Good value', overall_rating: 4.3, rate_per_night: { extracted_lowest: 98 } },
        { type: 'hotel', name: 'No price', overall_rating: 4.8 },
        { type: 'hotel', name: 'Mid', overall_rating: 4.1, rate_per_night: { extracted_lowest: 130 } },
        { type: 'hotel', name: 'Upper', overall_rating: 4.5, rate_per_night: { extracted_lowest: 180 } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const r = await new SerpApiHotelProvider('k').search({ city: 'Prague', country: 'CZ', check_in: '2027-06-15', check_out: '2027-06-17' });
    expect(r.map((h) => h.name)).toEqual(['Good value', 'Mid', 'Upper']);
    expect(r[0].is_test_data).toBe(false);
    const url = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toContain('engine=google_hotels');
    expect(url).toContain('check_in_date=2027-06-15');
    expect(url).toContain('hotel_class=3%2C4');
  });
});
