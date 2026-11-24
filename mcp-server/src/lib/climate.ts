// Typical weather for a month: the same month in the last 3 years, from the
// Open-Meteo historical archive (ERA5 reanalysis).

import { getJson } from './http.js';
import { TTL } from './cache.js';

export const CLIMATE_SOURCE = 'Open-Meteo historical weather API, ERA5 (open-meteo.com)';

export interface Climate {
  avg_max_c: number;
  rain_mm_day: number;
  rainy_day_share: number; // days with >= 1 mm
  sunshine_h_day: number;
  years: number[];
}

interface ArchiveResponse {
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    precipitation_sum: (number | null)[];
    sunshine_duration: (number | null)[];
  };
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function getClimate(lat: number, lon: number, month: number, now = new Date()): Promise<Climate> {
  // The last 3 complete occurrences of the month.
  const thisYear = now.getUTCFullYear();
  const lastComplete = month < now.getUTCMonth() + 1 ? thisYear : thisYear - 1;
  const years = [lastComplete - 2, lastComplete - 1, lastComplete];
  const mm = String(month).padStart(2, '0');

  const temps: number[] = [];
  const rain: number[] = [];
  const sun: number[] = [];
  for (const y of years) {
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&start_date=${y}-${mm}-01&end_date=${y}-${mm}-${lastDay(y, month)}` +
      `&daily=temperature_2m_max,precipitation_sum,sunshine_duration&timezone=UTC`;
    const r = await getJson<ArchiveResponse>(url, {
      source: 'Open-Meteo',
      cacheKey: `climate:${lat},${lon}-${y}-${mm}`,
      ttlSeconds: TTL.climate,
    });
    r.daily.temperature_2m_max.forEach((v) => v != null && temps.push(v));
    r.daily.precipitation_sum.forEach((v) => v != null && rain.push(v));
    r.daily.sunshine_duration.forEach((v) => v != null && sun.push(v / 3600));
  }
  return {
    avg_max_c: round1(avg(temps)),
    rain_mm_day: round1(avg(rain)),
    rainy_day_share: round1(rain.filter((x) => x >= 1).length / Math.max(1, rain.length)),
    sunshine_h_day: round1(avg(sun)),
    years,
  };
}

/**
 * 0–100. Best around 24 °C max, loses 4 points per degree away from it,
 * and up to 40 points for rainy days.
 */
export function weatherScore(c: Climate): number {
  const temp = Math.max(0, 100 - 4 * Math.abs(c.avg_max_c - 24));
  return Math.round(Math.max(0, temp - 40 * c.rainy_day_share));
}
