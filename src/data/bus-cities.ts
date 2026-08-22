/**
 * Cities the bus search knows about.
 *
 * Coordinates do real work here, exactly as they do for the airports: the
 * great-circle distance between two cities decides how long a coach takes and
 * what the seat costs. Without them Bengaluru->Chennai and Bengaluru->Delhi
 * would price the same, which is the detail that makes generated data feel
 * generated.
 *
 * Road distance is the crow-fly distance times `ROAD_FACTOR`. Indian highways
 * are not straight lines, and 1.25 is the usual rule of thumb -- Bengaluru to
 * Chennai is 290 km as the crow flies and about 350 km by NH48.
 *
 * The cities, their states and their coordinates are real. Nothing here is a
 * trademark.
 */

export interface BusCity {
  /** Short slug used in URLs and ids. */
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  /** Shown in the "Popular Cities" list before anyone types. */
  popular?: boolean;
}

export const ROAD_FACTOR = 1.25;

export const BUS_CITIES: BusCity[] = [
  // --- the metros, which is what "Popular Cities" means ---------------------
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    latitude: 12.9716,
    longitude: 77.5946,
    popular: true,
  },
  {
    id: 'chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    latitude: 13.0827,
    longitude: 80.2707,
    popular: true,
  },
  {
    id: 'delhi',
    name: 'Delhi',
    state: 'Delhi',
    latitude: 28.6139,
    longitude: 77.209,
    popular: true,
  },
  {
    id: 'pune',
    name: 'Pune',
    state: 'Maharashtra',
    latitude: 18.5204,
    longitude: 73.8567,
    popular: true,
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    latitude: 19.076,
    longitude: 72.8777,
    popular: true,
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    latitude: 17.385,
    longitude: 78.4867,
    popular: true,
  },

  // --- south ----------------------------------------------------------------
  {
    id: 'coimbatore',
    name: 'Coimbatore',
    state: 'Tamil Nadu',
    latitude: 11.0168,
    longitude: 76.9558,
  },
  { id: 'madurai', name: 'Madurai', state: 'Tamil Nadu', latitude: 9.9252, longitude: 78.1198 },
  {
    id: 'tiruchirappalli',
    name: 'Tiruchirappalli',
    state: 'Tamil Nadu',
    latitude: 10.7905,
    longitude: 78.7047,
  },
  { id: 'salem', name: 'Salem', state: 'Tamil Nadu', latitude: 11.6643, longitude: 78.146 },
  { id: 'vellore', name: 'Vellore', state: 'Tamil Nadu', latitude: 12.9165, longitude: 79.1325 },
  { id: 'mysuru', name: 'Mysuru', state: 'Karnataka', latitude: 12.2958, longitude: 76.6394 },
  { id: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', latitude: 12.9141, longitude: 74.856 },
  { id: 'hubballi', name: 'Hubballi', state: 'Karnataka', latitude: 15.3647, longitude: 75.124 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673 },
  {
    id: 'thiruvananthapuram',
    name: 'Thiruvananthapuram',
    state: 'Kerala',
    latitude: 8.5241,
    longitude: 76.9366,
  },
  { id: 'kozhikode', name: 'Kozhikode', state: 'Kerala', latitude: 11.2588, longitude: 75.7804 },
  { id: 'thrissur', name: 'Thrissur', state: 'Kerala', latitude: 10.5276, longitude: 76.2144 },
  {
    id: 'vijayawada',
    name: 'Vijayawada',
    state: 'Andhra Pradesh',
    latitude: 16.5062,
    longitude: 80.648,
  },
  {
    id: 'visakhapatnam',
    name: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    latitude: 17.6868,
    longitude: 83.2185,
  },
  {
    id: 'tirupati',
    name: 'Tirupati',
    state: 'Andhra Pradesh',
    latitude: 13.6288,
    longitude: 79.4192,
  },

  // --- west -----------------------------------------------------------------
  { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714 },
  { id: 'surat', name: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  { id: 'vadodara', name: 'Vadodara', state: 'Gujarat', latitude: 22.3072, longitude: 73.1812 },
  { id: 'rajkot', name: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022 },
  { id: 'nashik', name: 'Nashik', state: 'Maharashtra', latitude: 19.9975, longitude: 73.7898 },
  { id: 'nagpur', name: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  { id: 'kolhapur', name: 'Kolhapur', state: 'Maharashtra', latitude: 16.705, longitude: 74.2433 },
  { id: 'goa', name: 'Goa', state: 'Goa', latitude: 15.2993, longitude: 74.124 },

  // --- north ----------------------------------------------------------------
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 },
  { id: 'jodhpur', name: 'Jodhpur', state: 'Rajasthan', latitude: 26.2389, longitude: 73.0243 },
  { id: 'udaipur', name: 'Udaipur', state: 'Rajasthan', latitude: 24.5854, longitude: 73.7125 },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { id: 'kanpur', name: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  {
    id: 'varanasi',
    name: 'Varanasi',
    state: 'Uttar Pradesh',
    latitude: 25.3176,
    longitude: 82.9739,
  },
  { id: 'agra', name: 'Agra', state: 'Uttar Pradesh', latitude: 27.1767, longitude: 78.0081 },
  {
    id: 'chandigarh',
    name: 'Chandigarh',
    state: 'Chandigarh',
    latitude: 30.7333,
    longitude: 76.7794,
  },
  { id: 'amritsar', name: 'Amritsar', state: 'Punjab', latitude: 31.634, longitude: 74.8723 },
  { id: 'dehradun', name: 'Dehradun', state: 'Uttarakhand', latitude: 30.3165, longitude: 78.0322 },
  {
    id: 'shimla',
    name: 'Shimla',
    state: 'Himachal Pradesh',
    latitude: 31.1048,
    longitude: 77.1734,
  },
  {
    id: 'manali',
    name: 'Manali',
    state: 'Himachal Pradesh',
    latitude: 32.2432,
    longitude: 77.1892,
  },

  // --- central and east -----------------------------------------------------
  { id: 'indore', name: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  { id: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  { id: 'raipur', name: 'Raipur', state: 'Chhattisgarh', latitude: 21.2514, longitude: 81.6296 },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  {
    id: 'bhubaneswar',
    name: 'Bhubaneswar',
    state: 'Odisha',
    latitude: 20.2961,
    longitude: 85.8245,
  },
  { id: 'patna', name: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
  { id: 'ranchi', name: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096 },
];

const BY_ID = new Map(BUS_CITIES.map((city) => [city.id, city]));

export function findCity(id: string | null | undefined): BusCity | undefined {
  return id ? BY_ID.get(id.toLowerCase()) : undefined;
}

export const POPULAR_CITIES: BusCity[] = BUS_CITIES.filter((city) => city.popular);

/** Name, state or id -- so "blr", "Bengaluru" and "Karnataka" all match. */
export function searchCities(term: string, limit = 8): BusCity[] {
  const query = term.trim().toLowerCase();
  if (!query) return POPULAR_CITIES;

  const starts: BusCity[] = [];
  const contains: BusCity[] = [];

  for (const city of BUS_CITIES) {
    const name = city.name.toLowerCase();
    if (name.startsWith(query)) starts.push(city);
    else if (name.includes(query) || city.state.toLowerCase().includes(query)) contains.push(city);
    if (starts.length >= limit) break;
  }

  return [...starts, ...contains].slice(0, limit);
}

/** Great-circle kilometres between two cities. */
export function crowKm(from: BusCity, to: BusCity): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Road kilometres: the crow-fly distance with a highway allowance. */
export function roadKm(from: BusCity, to: BusCity): number {
  return Math.round(crowKm(from, to) * ROAD_FACTOR);
}
