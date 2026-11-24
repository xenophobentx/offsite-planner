// The two MCP tools. Answers are compact JSON (no pretty-printing): every
// token the model reads costs Copilot Credits.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { compareDestinations, InputError } from './compare.js';
import { findWindows, getHolidays, HOLIDAY_SOURCE } from './lib/holidays.js';
import { UpstreamError } from './lib/http.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true });

async function guard(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof InputError) return fail(err.message);
    if (err instanceof UpstreamError) return fail(`Data source unavailable: ${err.message}. Try again in a minute.`);
    console.error(err);
    return fail('Internal error');
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'offsite-data', version: '1.1.0' });

  server.registerTool(
    'plan_dates',
    {
      title: 'Find holiday-free offsite dates',
      description:
        'Returns up to 5 date windows in a month that avoid national public holidays in all given countries. ' +
        'Use it before checking calendars. Default: 2 nights, arriving on Tuesday.',
      inputSchema: {
        countries: z.array(z.string().length(2)).min(1).describe('ISO 3166-1 alpha-2 codes of the team members\' countries, e.g. ["HU","GB"]'),
        year: z.number().int().min(2025).max(2035),
        month: z.number().int().min(1).max(12),
        nights: z.number().int().min(1).max(5).default(2),
        start_weekday: z.enum(WEEKDAYS).default('tuesday').describe('Arrival weekday'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async ({ countries, year, month, nights, start_weekday }) =>
      guard(async () => {
        const cc = [...new Set(countries.map((c) => c.toUpperCase()))];
        const lists = await Promise.all(cc.map((c) => getHolidays(c, year)));
        const windows = findWindows(year, month, nights, WEEKDAYS.indexOf(start_weekday), lists.flat());
        return { countries: cc, windows, source: HOLIDAY_SOURCE };
      })
  );

  server.registerTool(
    'compare_destinations',
    {
      title: 'Compare offsite destinations',
      description:
        'Compares up to 3 offsite destinations for a team in one call: round-trip flights from each origin city, ' +
        'a well-rated hotel for the dates, total cost in EUR (flights + hotel), travel time, CO2, typical weather ' +
        'for the month, and a weighted score with a ranking. It never books anything. ' +
        'Pass one entry per origin city with the number of people there, not one per person. ' +
        'If destinations is empty, the server picks 3. Call it once; do not recalculate its numbers.',
      inputSchema: {
        origins: z
          .array(z.object({ city: z.string().describe('City name or IATA code'), count: z.number().int().min(1) }))
          .min(1)
          .describe('Team members grouped by city'),
        date: z.string().describe('Outbound date, YYYY-MM-DD'),
        return_date: z.string().describe('Return date, YYYY-MM-DD'),
        destinations: z.array(z.string()).optional().describe('Up to 3 city names or IATA codes; omit to let the server pick'),
        weights: z
          .object({
            cost: z.number().min(0),
            travel_time: z.number().min(0),
            weather: z.number().min(0),
            co2: z.number().min(0),
            stops: z.number().min(0),
          })
          .partial()
          .optional()
          .describe('Optional scoring weights; default cost 0.35, travel_time 0.25, weather 0.15, co2 0.15, stops 0.10'),
        rooms: z.number().int().min(1).optional().describe('Hotel rooms; default one per person'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async (args) =>
      guard(async () => {
        if (args.destinations && args.destinations.length > 3) throw new InputError('At most 3 destinations');
        return compareDestinations(args);
      })
  );

  return server;
}
