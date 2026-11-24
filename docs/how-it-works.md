# How the connector decides

This page explains the two decisions the `Offsite Data` connector makes in code: which three destinations to compare, and how to rank them. The model in Cowork does neither; it only passes the inputs and writes the documents.

## Who calls what

1. You type the request in Cowork.
2. Cowork reads your direct reports and their cities from Microsoft Entra ID and groups them by city. Names stay in Microsoft 365.
3. Cowork calls `plan_dates` with the country codes, the year and the month. The connector returns up to five holiday-free windows.
4. Cowork checks the team's calendars for those windows and picks the one where most people are free.
5. Cowork calls `compare_destinations` with `[{city, count}]`, the dates and, optionally, the destinations.
6. Cowork builds the Excel comparison, drafts the vote email and proposes a calendar hold. Nothing is sent before you confirm.

Open [`offsite-planner-azure-steps.html`](./offsite-planner-azure-steps.html) in a browser for an animated, step-by-step version.

## Step 1: picking three destinations

If you name destinations in the prompt, the connector uses those and skips this step.

Otherwise it picks from a fixed pool of 12 cities (`DESTINATION_POOL` in `mcp-server/src/data/cities.ts`): Barcelona, Lisbon, Porto, Valencia, Málaga, Palma, Nice, Split, Dubrovnik, Athens, Rome and Prague. A city where part of the team already works is left out.

For each candidate (`pickDestinations` in `mcp-server/src/compare.ts`):

* **Distance:** the great-circle distance from every origin, multiplied by the head count there, summed for the team.
* **Weather:** the same month in the last three years from the Open-Meteo archive. The ideal daily maximum is 24 °C; each degree away costs 4 points, and the share of rainy days costs up to 40 points (`weatherScore` in `mcp-server/src/lib/climate.ts`).
* **Preliminary score:** 60% distance (min–max scaled, nearest = 1, farthest = 0) and 40% weather. The top three go on.

This step makes no flight or hotel searches. Pricing all 12 candidates would take 60 SerpApi searches (48 flights + 12 hotels) instead of 15.

Trade-offs:

* A cheap destination that is farther away can drop out before prices are checked.
* A city outside the pool is never suggested, but it works when you name it, as long as it is in the `CITIES` list.
* Distance is a straight line. A close city without direct flights can rank high here; step 2 penalises the stops.

## Step 2: ranking the three

For the three destinations the connector fetches round-trip flights for every origin (with 4 origin cities, 4 × 3 = 12 routes, at most 6 at a time), then hotel rates (3 searches, at most 3 at a time), then exchange rates and weather. It converts everything to EUR and estimates CO₂.

Then it scores each destination (`mcp-server/src/lib/scoring.ts`):

| Criterion | Weight |
|---|---|
| Total cost (flights + hotel) | 35% |
| Average travel time | 25% |
| Weather | 15% |
| CO₂ | 15% |
| Stops | 10% |

Each criterion is a ratio to the best value of the three: the cheapest destination gets 1, one that costs 25% more gets 0.8. The weighted sum is shown as 0–100. On a tie, the cheaper destination wins. You can change the weights in the prompt; the connector normalises them to 100%.

## Cost of one run

In our test, one full run used:

* about 47 Copilot Credits in Cowork (type `/cost` after the run),
* 15 SerpApi searches with 4 origin cities (12 flights + 3 hotels); the free plan has 250 a month,
* almost nothing on Azure: the Function App scales to zero when idle.

The connector caches external answers in Azure Table storage: holidays for one year, weather for 30 days, exchange rates for one day, flights and hotels for six hours. Running the same prompt again within six hours uses no new searches.
