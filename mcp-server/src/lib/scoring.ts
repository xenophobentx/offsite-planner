// Deterministic destination scoring: each criterion as a ratio to the best
// option, weighted sum, 0–100. Ties go to the lower total cost.

export interface Weights {
  cost: number;
  travel_time: number;
  weather: number;
  co2: number;
  stops: number;
}

export const DEFAULT_WEIGHTS: Weights = { cost: 0.35, travel_time: 0.25, weather: 0.15, co2: 0.15, stops: 0.1 };

export interface Metrics {
  total_cost_eur: number;
  avg_travel_min: number;
  weather_score: number; // higher is better
  total_co2_kg: number;
  avg_stops: number;
}

export function normaliseWeights(w: Partial<Weights> | undefined): Weights {
  const merged = { ...DEFAULT_WEIGHTS, ...(w ?? {}) };
  for (const k of Object.keys(merged) as (keyof Weights)[]) merged[k] = Math.max(0, merged[k]);
  const sum = Object.values(merged).reduce((a, b) => a + b, 0);
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, Math.round((v / sum) * 1000) / 1000])) as unknown as Weights;
}

/**
 * Ratio to the best value of the set: 1 = best, 0.8 = 20% worse.
 * (Min–max would always give the last option 0, which reads badly in a demo.)
 */
function norm(values: number[], v: number, higherIsBetter: boolean): number {
  if (higherIsBetter) {
    const max = Math.max(...values);
    return max <= 0 ? 1 : Math.max(0, v) / max;
  }
  const min = Math.min(...values);
  if (v <= 0) return 1;
  return Math.max(0, min) / v;
}

export function score<T extends { metrics: Metrics }>(items: T[], weights: Weights): (T & { score: number; rank: number })[] {
  const col = (f: (m: Metrics) => number) => items.map((i) => f(i.metrics));
  const cost = col((m) => m.total_cost_eur);
  const time = col((m) => m.avg_travel_min);
  const wx = col((m) => m.weather_score);
  const co2 = col((m) => m.total_co2_kg);
  const stops = col((m) => m.avg_stops);

  const scored = items.map((i) => {
    const m = i.metrics;
    const s =
      weights.cost * norm(cost, m.total_cost_eur, false) +
      weights.travel_time * norm(time, m.avg_travel_min, false) +
      weights.weather * norm(wx, m.weather_score, true) +
      weights.co2 * norm(co2, m.total_co2_kg, false) +
      weights.stops * norm(stops, m.avg_stops, false);
    return { ...i, score: Math.round(s * 100) };
  });
  scored.sort((a, b) => b.score - a.score || a.metrics.total_cost_eur - b.metrics.total_cost_eur);
  return scored.map((s, idx) => ({ ...s, rank: idx + 1 }));
}
