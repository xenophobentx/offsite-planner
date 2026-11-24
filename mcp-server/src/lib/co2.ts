// Flight CO2e per passenger, own estimate: distance × emission factor.
//
// Factor: UK DESNZ/DEFRA greenhouse gas conversion factors, short-haul economy
// passenger flight including radiative forcing, rounded. The great-circle
// distance gets the DEFRA-recommended 8% uplift for routing and stacking.
// Indirect flights add a 10% penalty for the extra take-off and landing.

import { distanceKm } from '../data/cities.js';

export const CO2_SOURCE =
  'Own estimate: great-circle distance +8% × 0.15 kg CO2e/passenger-km (DESNZ/DEFRA short-haul economy factor incl. radiative forcing, rounded)';

const KG_PER_PKM = 0.15;
const ROUTING_UPLIFT = 1.08;
const STOP_PENALTY = 0.1;

/** Round-trip kg CO2e for one passenger. */
export function roundTripCo2Kg(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  stops: number
): number {
  const km = distanceKm(from, to) * ROUTING_UPLIFT;
  return Math.round(2 * km * KG_PER_PKM * (1 + STOP_PENALTY * Math.max(0, stops)));
}
