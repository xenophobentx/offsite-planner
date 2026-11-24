import { MockHotelProvider } from './mock.js';
import { SerpApiHotelProvider } from './serpapi.js';
import type { HotelProvider } from './types.js';

export type { HotelOption, HotelProvider, HotelQuery } from './types.js';

/** HOTEL_PROVIDER=serpapi needs SERPAPI_KEY; anything else (or no key) uses the mock. */
export function getHotelProvider(): HotelProvider {
  const key = process.env.SERPAPI_KEY;
  if (process.env.HOTEL_PROVIDER === 'serpapi' && key && !key.startsWith('@Microsoft.KeyVault')) return new SerpApiHotelProvider(key);
  return new MockHotelProvider();
}
