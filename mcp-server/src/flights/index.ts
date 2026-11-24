import { MockFlightProvider } from './mock.js';
import { SerpApiFlightProvider } from './serpapi.js';
import type { FlightProvider } from './types.js';

export type { FlightOption, FlightProvider, FlightQuery } from './types.js';

/** FLIGHT_PROVIDER=serpapi needs SERPAPI_KEY; anything else (or no key) uses the mock. */
export function getFlightProvider(): FlightProvider {
  const key = process.env.SERPAPI_KEY;
  if (process.env.FLIGHT_PROVIDER === 'serpapi' && key && !key.startsWith('@Microsoft.KeyVault')) return new SerpApiFlightProvider(key);
  return new MockFlightProvider();
}
