// Hotel data source interface. Prices only; the connector never books.

export interface HotelQuery {
  city: string; // city name, e.g. "Prague"
  country: string; // ISO code, helps the search
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
}

export interface HotelOption {
  name: string;
  nightly: number; // one room, one guest, per night
  currency: string;
  rating: number | null; // 0–5
  link: string | null;
  source: string;
  is_test_data: boolean;
}

export interface HotelProvider {
  name: string;
  /** Up to 3 well-rated hotels, cheapest first. Empty if none found. */
  search(q: HotelQuery): Promise<HotelOption[]>;
}
