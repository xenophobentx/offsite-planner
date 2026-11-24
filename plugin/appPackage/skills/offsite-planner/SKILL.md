---
name: offsite-planner
description: Plans a team offsite for people in several European cities. Finds dates that avoid public holidays and suit everyone's calendar, compares three destinations on flights, hotel, travel time, CO2 and weather, and prepares an Excel comparison, a vote email and calendar holds. Use when the user asks to plan, organise or compare locations for an offsite, team trip, retreat or team-building event. It plans only; it never books flights or hotels.
---

# Offsite planner

The connector **Offsite Data** does all data gathering and scoring. Your job is to collect the inputs, call it twice, and turn its answer into documents. Do not recalculate or second-guess its numbers.

## Steps

1. **Inputs.** Month (and year), number of nights (default 2, arriving Tuesday), optional budget, optional room count (default one room per person), optional destinations (up to 3), optional scoring weights. If the month is missing, ask once. Do not ask about anything that has a default.
2. **Team.** By default the team is the user's direct reports plus the user. If the user names a group or people, use those. Read each person's city from their profile (`city`, else `officeLocation`). If a city is missing, ask once for all missing people together. Group people by city: `[{city, count}]`.
3. **Dates.** Call `plan_dates` with the team's country codes, year and month. Then check free/busy for the whole team on the returned windows and choose the window where the most people are free (ties: the earlier one). Mention `near_holidays` if the chosen window has any.
4. **Compare.** Call `compare_destinations` once with the grouped origins, the chosen dates, and the user's destinations, weights and rooms if given. It returns flights and a hotel per destination. If it returns `error`, tell the user in one sentence and stop.
5. **Excel.** Create `Offsite comparison <month year>.xlsx` exactly as in [references/excel-layout.md](references/excel-layout.md).
6. **Vote email.** Draft (do not send) the email in [references/vote-email.md](references/vote-email.md) to the whole team, with the Excel attached. Sending needs the user's confirmation.
7. **Calendar hold.** Propose an all-day event "HOLD – Team offsite" for the chosen dates, for all participants, marked as tentative, showing as free. Creating it needs the user's confirmation.
8. **Deck (only if asked).** If the user asks for slides, follow [references/deck-outline.md](references/deck-outline.md).

## Reply to the user

Keep it short: the recommended destination and why (one line), a 3-row table (rank, city, score, total cost EUR with flights and hotel, hotel name, avg travel time, CO2 kg), the chosen dates, links to the Excel and the email draft, and what still needs their confirmation.

## Rules

- If `is_test_data` is true, write "test data" next to every price, in the reply and in the Excel.
- Every number comes from the connector or the calendar. Never invent prices, times or weather.
- Never book, buy or reserve anything. Never send email or create events without confirmation.
- Flights are per person, round trip, economy. Hotel cost is the picked hotel × rooms × nights. Say so once.
- If the team has only one city, still compare three destinations.
- Personal data stays in Microsoft 365: send the connector only city names and head counts, never names or email addresses.
