# Flight data source decision (2026-11-11)

| Source | Status for a new developer | Data | Verdict |
|---|---|---|---|
| SerpApi Google Flights | Self-serve, 250 searches/month free | Live Google Flights fares, duration, stops, airline | **Used** (also for Google Hotels) |
| Duffel (test mode) | Self-serve, free | Fake fares, mostly "Duffel Airways" | Not used |
| Amadeus Self-Service | Portal closed 17 Jul 2026 | — | Not available |
| Kiwi Tequila | Invite-only since 2024 | — | Not available |
| Skyscanner | Partners with >100k monthly traffic | — | Not available |
| Travelpayouts / Aviasales | Cached user searches, 2–7 days old | Often empty for dates a year ahead | Weak |
| Local mock | Always works | Distance-based estimate, labelled as test data | Default until the SerpApi key is set |

Budget: one comparison with 4 origin cities = 12 flight searches + 3 hotel searches = 15 SerpApi searches. Results are cached for 6 hours in the `apicache` table, so 250/month allows about 16 fresh comparisons.

Implementation: `mcp-server/src/flights/` and `mcp-server/src/hotels/` (`FLIGHT_PROVIDER` and `HOTEL_PROVIDER` = `mock` or `serpapi`, key from the Key Vault secret `serpapi-key`).

Sources: serpapi.com/pricing, serpapi.com/google-flights-api, duffel.com/docs/api/overview/test-mode, amadeus.com statement on the developers portal, media.kiwi.com partnerships article.

## Sample responses (`samples/`)

- `nager-HU-2027.json`: Nager.Date public holidays, no key.
- `frankfurter-latest.json`: ECB rates, no key.
- `openmeteo-archive-LIS-2025-06.json`: Open-Meteo ERA5 archive, no key. The connector uses the archive (last 3 years, same month), not the climate-model API.
- `openmeteo-climate-LIS-2027-06.json`: climate-model API, kept for comparison; not used.

## Open questions

- The CO₂ factor (0.15 kg CO₂e per passenger-km) is a rounded DESNZ/DEFRA short-haul value. Check it against the current year's table before relying on the numbers.
- SerpApi's free plan terms (commercial use, card requirement) can change. Read serpapi.com/pricing before using it beyond a demo.
