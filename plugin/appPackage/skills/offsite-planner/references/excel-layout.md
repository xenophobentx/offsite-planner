# Excel layout

File name: `Offsite comparison <Month YYYY>.xlsx`. Five sheets, in this order. Header row bold and frozen, EUR columns formatted `€#,##0`, minutes as `h:mm` (minutes ÷ 1440). Format the data as an Excel table on every sheet.

## Summary

One row per destination from `destinations`, sorted by `rank`.

| Rank | Destination | Score | Total cost (EUR) | Flights (EUR) | Hotel (EUR) | Hotel | Avg travel time | Total CO2 (kg) | Avg stops | Avg max temp (°C) | Rainy days | Sunshine (h/day) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `rank` | `city` (`iata`) | `score` | `total_cost_eur` | `flights_cost_eur` | `hotel_cost_eur` | `hotel.name` (link to `hotel.link`) | `avg_travel_min` | `total_co2_kg` | `avg_stops` | `weather.avg_max_c` | `weather.rainy_day_share` as % | `weather.sunshine_h_day` |

Below the table: "Weights:" with `weights` as percentages, the dates `date` to `return_date`, and "Hotel: `rooms` rooms × `nights` nights".
Add a clustered bar chart of Total cost (EUR) by Destination.

## By origin

One row per destination × origin (`destinations[].by_origin[]`).

| Destination | From | People | Price per person (EUR) | Subtotal (EUR) | Flight time | Stops | Carrier | CO2 per person (kg) |
|---|---|---|---|---|---|---|---|---|

Subtotal = People × Price per person (Excel formula). If `is_test_data`, add a last column "Note" = "test data".

## Hotels

Per destination: the picked `hotel` and the `hotel_alternatives`.

| Destination | Hotel | Rating | Per night (EUR) | Rooms × nights | Total (EUR) | Picked |
|---|---|---|---|---|---|---|

Total = Per night × Rooms × Nights (Excel formula). Make hotel names links where `link` is given. Not booked.

## Dates

The windows from `plan_dates`, with how many people are free in each, and which one was chosen.

| Arrive | Depart | People free | Nearby holidays | Chosen |
|---|---|---|---|---|

## Sources

One row per item in `sources`, then the FX date and rates from `fx`, then each line of `notes`.
