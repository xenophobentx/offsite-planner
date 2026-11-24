// European cities the connector understands, with the main airport used for
// flight search, coordinates for distance/CO2/climate, and the ISO country code
// for public holidays.

export interface City {
  name: string;
  iata: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
  aliases?: string[];
}

export const CITIES: City[] = [
  { name: 'Amsterdam', iata: 'AMS', country: 'NL', lat: 52.37, lon: 4.9 },
  { name: 'Athens', iata: 'ATH', country: 'GR', lat: 37.98, lon: 23.73, aliases: ['Athina'] },
  { name: 'Barcelona', iata: 'BCN', country: 'ES', lat: 41.39, lon: 2.17 },
  { name: 'Berlin', iata: 'BER', country: 'DE', lat: 52.52, lon: 13.4 },
  { name: 'Brussels', iata: 'BRU', country: 'BE', lat: 50.85, lon: 4.35, aliases: ['Bruxelles', 'Brussel'] },
  { name: 'Bucharest', iata: 'OTP', country: 'RO', lat: 44.43, lon: 26.1, aliases: ['Bucuresti'] },
  { name: 'Budapest', iata: 'BUD', country: 'HU', lat: 47.5, lon: 19.04 },
  { name: 'Copenhagen', iata: 'CPH', country: 'DK', lat: 55.68, lon: 12.57, aliases: ['Kobenhavn'] },
  { name: 'Dublin', iata: 'DUB', country: 'IE', lat: 53.35, lon: -6.26 },
  { name: 'Dubrovnik', iata: 'DBV', country: 'HR', lat: 42.65, lon: 18.09 },
  { name: 'Frankfurt', iata: 'FRA', country: 'DE', lat: 50.11, lon: 8.68 },
  { name: 'Helsinki', iata: 'HEL', country: 'FI', lat: 60.17, lon: 24.94 },
  { name: 'Krakow', iata: 'KRK', country: 'PL', lat: 50.06, lon: 19.94, aliases: ['Kraków'] },
  { name: 'Lisbon', iata: 'LIS', country: 'PT', lat: 38.72, lon: -9.14, aliases: ['Lisboa'] },
  { name: 'London', iata: 'LHR', country: 'GB', lat: 51.51, lon: -0.13 },
  { name: 'Madrid', iata: 'MAD', country: 'ES', lat: 40.42, lon: -3.7 },
  { name: 'Malaga', iata: 'AGP', country: 'ES', lat: 36.72, lon: -4.42, aliases: ['Málaga'] },
  { name: 'Milan', iata: 'MXP', country: 'IT', lat: 45.46, lon: 9.19, aliases: ['Milano'] },
  { name: 'Munich', iata: 'MUC', country: 'DE', lat: 48.14, lon: 11.58, aliases: ['München', 'Muenchen'] },
  { name: 'Nice', iata: 'NCE', country: 'FR', lat: 43.7, lon: 7.27 },
  { name: 'Oslo', iata: 'OSL', country: 'NO', lat: 59.91, lon: 10.75 },
  { name: 'Palma', iata: 'PMI', country: 'ES', lat: 39.57, lon: 2.65, aliases: ['Palma de Mallorca', 'Mallorca'] },
  { name: 'Paris', iata: 'CDG', country: 'FR', lat: 48.86, lon: 2.35 },
  { name: 'Porto', iata: 'OPO', country: 'PT', lat: 41.15, lon: -8.61, aliases: ['Oporto'] },
  { name: 'Prague', iata: 'PRG', country: 'CZ', lat: 50.08, lon: 14.44, aliases: ['Praha'] },
  { name: 'Rome', iata: 'FCO', country: 'IT', lat: 41.9, lon: 12.5, aliases: ['Roma'] },
  { name: 'Split', iata: 'SPU', country: 'HR', lat: 43.51, lon: 16.44 },
  { name: 'Stockholm', iata: 'ARN', country: 'SE', lat: 59.33, lon: 18.07 },
  { name: 'Valencia', iata: 'VLC', country: 'ES', lat: 39.47, lon: -0.38 },
  { name: 'Vienna', iata: 'VIE', country: 'AT', lat: 48.21, lon: 16.37, aliases: ['Wien'] },
  { name: 'Warsaw', iata: 'WAW', country: 'PL', lat: 52.23, lon: 21.01, aliases: ['Warszawa'] },
  { name: 'Zurich', iata: 'ZRH', country: 'CH', lat: 47.38, lon: 8.54, aliases: ['Zürich'] },
];

/**
 * Offsite destinations the server picks from when the user names none:
 * reachable from most European hubs, good weather in late spring/summer,
 * and enough hotels for a team.
 */
export const DESTINATION_POOL = ['BCN', 'LIS', 'OPO', 'VLC', 'AGP', 'PMI', 'NCE', 'SPU', 'DBV', 'ATH', 'FCO', 'PRG'];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Finds a city by name, alias or IATA code. Returns undefined if unknown. */
export function findCity(query: string): City | undefined {
  const q = norm(query);
  return CITIES.find(
    (c) => c.iata.toLowerCase() === q || norm(c.name) === q || (c.aliases ?? []).some((a) => norm(a) === q)
  );
}

export function cityByIata(iata: string): City {
  const c = CITIES.find((x) => x.iata === iata);
  if (!c) throw new Error(`Unknown airport ${iata}`);
  return c;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
