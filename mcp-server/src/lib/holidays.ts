// Public holidays (Nager.Date) and holiday-free offsite windows.

import { getJson } from './http.js';
import { TTL } from './cache.js';

export const HOLIDAY_SOURCE = 'Nager.Date public holidays (date.nager.at)';

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
  types: string[];
}

export interface Holiday {
  date: string;
  country: string;
  name: string;
}

export async function getHolidays(country: string, year: number): Promise<Holiday[]> {
  const cc = country.toUpperCase();
  const data = await getJson<NagerHoliday[]>(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`, {
    source: 'Nager.Date',
    cacheKey: `holidays:${cc}-${year}`,
    ttlSeconds: TTL.holidays,
  });
  // Only nationwide public holidays block an offsite; regional ones are too local.
  return data
    .filter((h) => h.global && h.types.includes('Public'))
    .map((h) => ({ date: h.date, country: h.countryCode, name: h.name }));
}

export interface DateWindow {
  start: string; // arrival day
  end: string; // departure day
  days: string[];
  near_holidays: string[]; // holidays the day before or after the window
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/**
 * Windows of `nights` nights starting on `startWeekday` (0=Sun … 6=Sat) in the
 * given month, skipping any window that contains a holiday in any country.
 * A holiday right next to the window is reported, not excluded.
 */
export function findWindows(
  year: number,
  month: number,
  nights: number,
  startWeekday: number,
  holidays: Holiday[],
  max = 5
): DateWindow[] {
  const byDate = new Map<string, Holiday[]>();
  for (const h of holidays) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h]);
  const label = (date: string) => (byDate.get(date) ?? []).map((h) => `${date} ${h.name} (${h.country})`);

  const out: DateWindow[] = [];
  for (let d = new Date(Date.UTC(year, month - 1, 1)); d.getUTCMonth() === month - 1; d = addDays(d, 1)) {
    if (d.getUTCDay() !== startWeekday) continue;
    const days = Array.from({ length: nights + 1 }, (_, i) => iso(addDays(d, i)));
    if (days.some((x) => byDate.has(x))) continue;
    const near = [...label(iso(addDays(d, -1))), ...label(iso(addDays(d, nights + 1)))];
    out.push({ start: days[0], end: days[days.length - 1], days, near_holidays: near });
    if (out.length >= max) break;
  }
  return out;
}
