/**
 * Airports the flight search knows about.
 *
 * Coordinates are carried because they do real work: the great-circle
 * distance between two airports is what decides a flight's duration and its
 * base fare in `services/flights.ts`. Without them every route would need a
 * hand-written duration, and Delhi->Mumbai would cost the same as
 * Delhi->Chennai, which is the sort of detail that makes generated data feel
 * generated.
 *
 * `city` is what a customer types; `code` is the IATA code shown on the
 * ticket. Both are searched, so "BOM", "Mumbai" and "Chhatrapati" all find the
 * same airport.
 */

export interface Airport {
  /** IATA code, e.g. "DEL". */
  code: string;
  city: string;
  /** Full airport name, shown under the city. */
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

export const AIRPORTS: Airport[] = [
  // --- India: metros -------------------------------------------------------
  { code: 'DEL', city: 'New Delhi', name: 'Indira Gandhi International', country: 'India', latitude: 28.5562, longitude: 77.1000 },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International', country: 'India', latitude: 19.0896, longitude: 72.8656 },
  { code: 'BLR', city: 'Bengaluru', name: 'Kempegowda International', country: 'India', latitude: 13.1986, longitude: 77.7066 },
  { code: 'MAA', city: 'Chennai', name: 'Chennai International', country: 'India', latitude: 12.9941, longitude: 80.1709 },
  { code: 'CCU', city: 'Kolkata', name: 'Netaji Subhas Chandra Bose International', country: 'India', latitude: 22.6547, longitude: 88.4467 },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International', country: 'India', latitude: 17.2403, longitude: 78.4294 },

  // --- India: major regional ----------------------------------------------
  { code: 'AMD', city: 'Ahmedabad', name: 'Sardar Vallabhbhai Patel International', country: 'India', latitude: 23.0722, longitude: 72.6266 },
  { code: 'PNQ', city: 'Pune', name: 'Pune International', country: 'India', latitude: 18.5822, longitude: 73.9197 },
  { code: 'GOI', city: 'Goa', name: 'Dabolim', country: 'India', latitude: 15.3808, longitude: 73.8314 },
  { code: 'GOX', city: 'North Goa', name: 'Manohar International (Mopa)', country: 'India', latitude: 15.7440, longitude: 73.8580 },
  { code: 'COK', city: 'Kochi', name: 'Cochin International', country: 'India', latitude: 10.1520, longitude: 76.4019 },
  { code: 'TRV', city: 'Thiruvananthapuram', name: 'Trivandrum International', country: 'India', latitude: 8.4821, longitude: 76.9201 },
  { code: 'JAI', city: 'Jaipur', name: 'Jaipur International', country: 'India', latitude: 26.8242, longitude: 75.8122 },
  { code: 'LKO', city: 'Lucknow', name: 'Chaudhary Charan Singh International', country: 'India', latitude: 26.7606, longitude: 80.8893 },
  { code: 'IXC', city: 'Chandigarh', name: 'Shaheed Bhagat Singh International', country: 'India', latitude: 30.6735, longitude: 76.7885 },
  { code: 'ATQ', city: 'Amritsar', name: 'Sri Guru Ram Dass Jee International', country: 'India', latitude: 31.7096, longitude: 74.7973 },
  { code: 'BBI', city: 'Bhubaneswar', name: 'Biju Patnaik International', country: 'India', latitude: 20.2444, longitude: 85.8178 },
  { code: 'GAU', city: 'Guwahati', name: 'Lokpriya Gopinath Bordoloi International', country: 'India', latitude: 26.1061, longitude: 91.5859 },
  { code: 'NAG', city: 'Nagpur', name: 'Dr. Babasaheb Ambedkar International', country: 'India', latitude: 21.0922, longitude: 79.0472 },
  { code: 'IDR', city: 'Indore', name: 'Devi Ahilyabai Holkar', country: 'India', latitude: 22.7218, longitude: 75.8011 },
  { code: 'PAT', city: 'Patna', name: 'Jay Prakash Narayan International', country: 'India', latitude: 25.5913, longitude: 85.0880 },
  { code: 'VNS', city: 'Varanasi', name: 'Lal Bahadur Shastri International', country: 'India', latitude: 25.4524, longitude: 82.8593 },
  { code: 'SXR', city: 'Srinagar', name: 'Sheikh ul-Alam International', country: 'India', latitude: 33.9871, longitude: 74.7742 },
  { code: 'IXB', city: 'Bagdogra', name: 'Bagdogra International', country: 'India', latitude: 26.6812, longitude: 88.3286 },
  { code: 'DED', city: 'Dehradun', name: 'Jolly Grant', country: 'India', latitude: 30.1897, longitude: 78.1803 },
  { code: 'RPR', city: 'Raipur', name: 'Swami Vivekananda', country: 'India', latitude: 21.1804, longitude: 81.7388 },
  { code: 'IXR', city: 'Ranchi', name: 'Birsa Munda', country: 'India', latitude: 23.3143, longitude: 85.3217 },
  { code: 'CJB', city: 'Coimbatore', name: 'Coimbatore International', country: 'India', latitude: 11.0300, longitude: 77.0434 },
  { code: 'IXM', city: 'Madurai', name: 'Madurai International', country: 'India', latitude: 9.8345, longitude: 78.0934 },
  { code: 'VTZ', city: 'Visakhapatnam', name: 'Visakhapatnam International', country: 'India', latitude: 17.7211, longitude: 83.2245 },
  { code: 'UDR', city: 'Udaipur', name: 'Maharana Pratap', country: 'India', latitude: 24.6177, longitude: 73.8961 },
  { code: 'JDH', city: 'Jodhpur', name: 'Jodhpur', country: 'India', latitude: 26.2511, longitude: 73.0489 },
  { code: 'BDQ', city: 'Vadodara', name: 'Vadodara', country: 'India', latitude: 22.3362, longitude: 73.2263 },
  { code: 'STV', city: 'Surat', name: 'Surat', country: 'India', latitude: 21.1141, longitude: 72.7418 },
  { code: 'IXE', city: 'Mangaluru', name: 'Mangalore International', country: 'India', latitude: 12.9613, longitude: 74.8901 },
  { code: 'TRZ', city: 'Tiruchirappalli', name: 'Tiruchirappalli International', country: 'India', latitude: 10.7654, longitude: 78.7097 },
  { code: 'IMF', city: 'Imphal', name: 'Bir Tikendrajit International', country: 'India', latitude: 24.7600, longitude: 93.8967 },
  { code: 'PY', city: 'Port Blair', name: 'Veer Savarkar International', country: 'India', latitude: 11.6412, longitude: 92.7297 },
  { code: 'LEH', city: 'Leh', name: 'Kushok Bakula Rimpochee', country: 'India', latitude: 34.1359, longitude: 77.5465 },

  // --- International -------------------------------------------------------
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'United Arab Emirates', latitude: 25.2532, longitude: 55.3657 },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'United Arab Emirates', latitude: 24.4330, longitude: 54.6511 },
  { code: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar', latitude: 25.2731, longitude: 51.6081 },
  { code: 'SIN', city: 'Singapore', name: 'Changi', country: 'Singapore', latitude: 1.3644, longitude: 103.9915 },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'Kuala Lumpur International', country: 'Malaysia', latitude: 2.7456, longitude: 101.7099 },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', country: 'Thailand', latitude: 13.6900, longitude: 100.7501 },
  { code: 'CMB', city: 'Colombo', name: 'Bandaranaike International', country: 'Sri Lanka', latitude: 7.1808, longitude: 79.8841 },
  { code: 'KTM', city: 'Kathmandu', name: 'Tribhuvan International', country: 'Nepal', latitude: 27.6966, longitude: 85.3591 },
  { code: 'LHR', city: 'London', name: 'Heathrow', country: 'United Kingdom', latitude: 51.4700, longitude: -0.4543 },
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy International', country: 'United States', latitude: 40.6413, longitude: -73.7781 },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'Hong Kong', latitude: 22.3080, longitude: 113.9185 },
  { code: 'SYD', city: 'Sydney', name: 'Kingsford Smith', country: 'Australia', latitude: -33.9399, longitude: 151.1753 },
];

const BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code, airport]));

export function findAirport(code: string): Airport | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}

/** Great-circle distance in kilometres. */
export function distanceKm(from: Airport, to: Airport): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Matches a typed query against code, city or airport name. */
export function searchAirports(query: string, limit = 8): Airport[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return AIRPORTS.slice(0, limit);

  const scored = AIRPORTS.map((airport) => {
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();

    // An exact code match is what someone typing "BOM" means; a city prefix
    // beats a match buried in an airport's full name.
    const score =
      code === needle ? 0
      : city.startsWith(needle) ? 1
      : code.startsWith(needle) ? 2
      : city.includes(needle) ? 3
      : airport.name.toLowerCase().includes(needle) ? 4
      : airport.country.toLowerCase().startsWith(needle) ? 5
      : -1;

    return { airport, score };
  }).filter((entry) => entry.score >= 0);

  scored.sort((a, b) => a.score - b.score || a.airport.city.localeCompare(b.airport.city));
  return scored.slice(0, limit).map((entry) => entry.airport);
}

/** Shown as "Popular Cities" before anything is typed. */
export const POPULAR_AIRPORT_CODES = [
  'DEL', 'BOM', 'BKK', 'BLR', 'DXB', 'SIN', 'HYD', 'CCU', 'MAA', 'GOI',
] as const;

export const POPULAR_AIRPORTS: Airport[] = POPULAR_AIRPORT_CODES.map((code) => {
  const airport = BY_CODE.get(code);
  if (!airport) throw new Error(`POPULAR_AIRPORT_CODES: unknown code ${code}`);
  return airport;
});
