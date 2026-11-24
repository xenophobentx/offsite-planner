// Flight data source interface. The model never sees which provider is used;
// it only sees `source` and `is_test_data` in the result.

export interface FlightQuery {
  origin: string; // IATA
  destination: string; // IATA
  date: string; // YYYY-MM-DD outbound
  return_date: string; // YYYY-MM-DD
}

export interface FlightOption {
  price: number; // round trip, one passenger
  currency: string;
  duration_min: number; // outbound, door of origin airport to destination airport
  stops: number; // outbound
  carrier: string;
  source: string;
  is_test_data: boolean;
}

export interface FlightProvider {
  name: string;
  /** Best option for the route, or null if there is no connection. */
  search(q: FlightQuery): Promise<FlightOption | null>;
}
