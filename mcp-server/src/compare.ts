// compare_destinations: everything the model would otherwise do in many tool
// calls, done in code in one call. Returns a compact, ready-to-use table.

import { cityByIata, DESTINATION_POOL, distanceKm, findCity, type City } from './data/cities.js';
import { CLIMATE_SOURCE, getClimate, weatherScore, type Climate } from './lib/climate.js';
import { CO2_SOURCE, roundTripCo2Kg } from './lib/co2.js';
import { FX_SOURCE, getEurRates, toEur } from './lib/fx.js';
import { mapLimit } from './lib/http.js';
import { normaliseWeights, score, type Metrics, type Weights } from './lib/scoring.js';
import { getFlightProvider, type FlightOption, type FlightProvider } from './flights/index.js';
import { getHotelProvider, type HotelOption, type HotelProvider } from './hotels/index.js';

export interface CompareInput {
  origins: { city: string; count: number }[];
  date: string;
  return_date: string;
  destinations?: string[];
  weights?: Partial<Weights>;
  /** Hotel rooms; default one per person. */
  rooms?: number;
}

export interface OriginRow {
  origin: string;
  count: number;
  price_eur: number;
  duration_min: number;
  stops: number;
  carrier: string;
  co2_kg: number;
}

export interface HotelPick {
  name: string;
  nightly_eur: number;
  rating: number | null;
  link?: string;
}

export interface DestinationResult {
  rank: number;
  city: string;
  iata: string;
  country: string;
  score: number;
  total_cost_eur: number;
  flights_cost_eur: number;
  hotel_cost_eur: number;
  hotel: HotelPick;
  hotel_alternatives: HotelPick[];
  avg_travel_min: number;
  total_co2_kg: number;
  avg_stops: number;
  weather: Climate & { score: number };
  by_origin: OriginRow[];
}

export interface CompareOutput {
  date: string;
  return_date: string;
  travellers: number;
  nights: number;
  rooms: number;
  weights: Weights;
  destinations: DestinationResult[];
  excluded: { city: string; reason: string }[];
  fx: { date: string; rates: Record<string, number> };
  is_test_data: boolean;
  sources: string[];
  notes: string[];
}

export class InputError extends Error {}

function resolve(name: string, what: string): City {
  const c = findCity(name);
  if (!c) throw new InputError(`Unknown ${what} "${name}". Use a major European city name or its IATA code.`);
  return c;
}

const round = (x: number) => Math.round(x);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Picks 3 destinations from the pool: short total distance for the team and good weather. */
async function pickDestinations(origins: { city: City; count: number }[], month: number): Promise<City[]> {
  const originCodes = new Set(origins.map((o) => o.city.iata));
  const pool = DESTINATION_POOL.filter((c) => !originCodes.has(c)).map(cityByIata);
  const prelim = await mapLimit(pool, 6, async (d) => {
    const km = origins.reduce((s, o) => s + o.count * distanceKm(o.city, d), 0);
    const wx = weatherScore(await getClimate(d.lat, d.lon, month));
    return { d, km, wx };
  });
  const minKm = Math.min(...prelim.map((p) => p.km));
  const maxKm = Math.max(...prelim.map((p) => p.km));
  const ranked = prelim
    .map((p) => ({ ...p, s: 0.6 * (maxKm === minKm ? 1 : (maxKm - p.km) / (maxKm - minKm)) + 0.4 * (p.wx / 100) }))
    .sort((a, b) => b.s - a.s);
  return ranked.slice(0, 3).map((p) => p.d);
}

export async function compareDestinations(
  input: CompareInput,
  provider: FlightProvider = getFlightProvider(),
  hotelProvider: HotelProvider = getHotelProvider()
): Promise<CompareOutput> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.return_date))
    throw new InputError('date and return_date must be YYYY-MM-DD');
  if (input.return_date <= input.date) throw new InputError('return_date must be after date');
  if (input.origins.length === 0) throw new InputError('origins is empty');

  // Merge duplicate origin cities.
  const merged = new Map<string, { city: City; count: number }>();
  for (const o of input.origins) {
    const city = resolve(o.city, 'origin city');
    const prev = merged.get(city.iata);
    merged.set(city.iata, { city, count: (prev?.count ?? 0) + o.count });
  }
  const origins = [...merged.values()];
  const travellers = origins.reduce((s, o) => s + o.count, 0);
  const nights = Math.round((Date.parse(input.return_date) - Date.parse(input.date)) / 86400000);
  const rooms = input.rooms && input.rooms > 0 ? input.rooms : travellers;
  const month = Number(input.date.slice(5, 7));
  const notes: string[] = [];

  let dests: City[];
  if (input.destinations && input.destinations.length > 0) {
    dests = [...new Map(input.destinations.map((d) => resolve(d, 'destination')).map((c) => [c.iata, c])).values()];
  } else {
    dests = await pickDestinations(origins, month);
    notes.push(`No destinations given; picked ${dests.map((d) => d.name).join(', ')} by team distance and typical weather.`);
  }

  // All routes in parallel (origins × destinations), at most 6 at a time.
  const routes = dests.flatMap((d) => origins.map((o) => ({ d, o })));
  const results = await mapLimit(routes, 6, async ({ d, o }) => {
    if (d.iata === o.city.iata) {
      const local: FlightOption = { price: 0, currency: 'EUR', duration_min: 0, stops: 0, carrier: 'none (local)', source: 'local', is_test_data: false };
      return local;
    }
    return provider.search({ origin: o.city.iata, destination: d.iata, date: input.date, return_date: input.return_date });
  });
  const flight = (d: City, o: City) => results[routes.findIndex((r) => r.d.iata === d.iata && r.o.city.iata === o.iata)];

  const hotelLists = await mapLimit(dests, 3, (d) =>
    hotelProvider.search({ city: d.name, country: d.country, check_in: input.date, check_out: input.return_date })
  );
  const fx = await getEurRates([
    ...results.filter((r): r is FlightOption => r !== null).map((r) => r.currency),
    ...hotelLists.flat().map((h) => h.currency),
  ]);
  const climates = await mapLimit(dests, 3, (d) => getClimate(d.lat, d.lon, month));

  const excluded: { city: string; reason: string }[] = [];
  const candidates: {
    dest: City;
    climate: Climate;
    rows: OriginRow[];
    flightsCost: number;
    hotelCost: number;
    hotels: HotelPick[];
    metrics: Metrics;
  }[] = [];
  dests.forEach((d, i) => {
    const missing = origins.filter((o) => flight(d, o.city) === null).map((o) => o.city.name);
    if (missing.length) {
      excluded.push({ city: d.name, reason: `No flights found from ${missing.join(', ')}` });
      return;
    }
    if (hotelLists[i].length === 0) {
      excluded.push({ city: d.name, reason: 'No well-rated hotel rates found for these dates' });
      return;
    }
    const hotels: HotelPick[] = hotelLists[i].map((h: HotelOption) => ({
      name: h.name,
      nightly_eur: round(toEur(h.nightly, h.currency, fx)),
      rating: h.rating,
      ...(h.link ? { link: h.link } : {}),
    }));
    const rows: OriginRow[] = origins.map((o) => {
      const f = flight(d, o.city)!;
      return {
        origin: o.city.name,
        count: o.count,
        price_eur: round(toEur(f.price, f.currency, fx)),
        duration_min: f.duration_min,
        stops: f.stops,
        carrier: f.carrier,
        co2_kg: d.iata === o.city.iata ? 0 : roundTripCo2Kg(o.city, d, f.stops),
      };
    });
    const sum = (fn: (r: OriginRow) => number) => rows.reduce((s, r) => s + fn(r) * r.count, 0);
    const flightsCost = round(sum((r) => r.price_eur));
    const hotelCost = hotels[0].nightly_eur * nights * rooms;
    candidates.push({
      dest: d,
      climate: climates[i],
      rows,
      flightsCost,
      hotelCost,
      hotels,
      metrics: {
        total_cost_eur: flightsCost + hotelCost,
        avg_travel_min: round(sum((r) => r.duration_min) / travellers),
        weather_score: weatherScore(climates[i]),
        total_co2_kg: round(sum((r) => r.co2_kg)),
        avg_stops: round1(sum((r) => r.stops) / travellers),
      },
    });
  });

  const weights = normaliseWeights(input.weights);
  const ranked = score(candidates, weights);
  const usedFlights = results.filter((r): r is FlightOption => r !== null && r.source !== 'local');
  const usedHotels = hotelLists.flat();
  const isTest = usedFlights.some((f) => f.is_test_data) || usedHotels.some((h) => h.is_test_data);
  if (usedFlights.some((f) => f.is_test_data)) notes.push('Flight prices are test data, not real fares.');
  if (usedHotels.some((h) => h.is_test_data)) notes.push('Hotel rates are test data, not real rates.');
  notes.push(
    `Total cost = flights (per person, round trip, economy) + hotel (cheapest hotel rated 4.0+, ${rooms} room(s) × ${nights} night(s)). Nothing is booked.`
  );

  return {
    date: input.date,
    return_date: input.return_date,
    travellers,
    nights,
    rooms,
    weights,
    destinations: ranked.map((c) => ({
      rank: c.rank,
      city: c.dest.name,
      iata: c.dest.iata,
      country: c.dest.country,
      score: c.score,
      ...c.metrics,
      flights_cost_eur: c.flightsCost,
      hotel_cost_eur: c.hotelCost,
      hotel: c.hotels[0],
      hotel_alternatives: c.hotels.slice(1).map(({ link: _l, ...h }) => h),
      weather: { ...c.climate, score: c.metrics.weather_score },
      by_origin: c.rows,
    })).map(({ weather_score: _w, ...rest }) => rest),
    excluded,
    fx,
    is_test_data: isTest,
    sources: [...new Set([...usedFlights.map((f) => f.source), ...usedHotels.map((h) => h.source)]), CLIMATE_SOURCE, FX_SOURCE, CO2_SOURCE],
    notes,
  };
}
