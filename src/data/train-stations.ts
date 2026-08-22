/**
 * Indian railway stations.
 *
 * Codes, names and coordinates are real public infrastructure facts, the same
 * category as the PIN-code geography the delivery estimator uses and the city
 * coordinates the bus search uses. Distances between them are computed, not
 * stored, so nothing here can drift out of step with a timetable.
 *
 * What is *not* real anywhere in the train feature is the timetable itself:
 * every service, its number, its name and its fares are this store's own.
 */

export interface TrainStation {
  /** The real station code, uppercase. Also the URL id. */
  code: string;
  /** Station name as it is signposted. */
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export const TRAIN_STATIONS: readonly TrainStation[] = [
  // ---------------------------------------------------------------- Delhi
  // All four are Delhi, deliberately: a Delhi to Kolkata search should offer
  // the services that leave from Nizamuddin and Anand Vihar too, and it can
  // only do that if they are one city.
  {
    code: 'NDLS',
    name: 'New Delhi',
    city: 'Delhi',
    state: 'Delhi',
    lat: 28.6425,
    lon: 77.2197,
  },
  { code: 'DLI', name: 'Delhi Jn', city: 'Delhi', state: 'Delhi', lat: 28.6614, lon: 77.2278 },
  {
    code: 'NZM',
    name: 'Hazrat Nizamuddin',
    city: 'Delhi',
    state: 'Delhi',
    lat: 28.5885,
    lon: 77.253,
  },
  {
    code: 'ANVT',
    name: 'Anand Vihar Terminal',
    city: 'Delhi',
    state: 'Delhi',
    lat: 28.6469,
    lon: 77.3159,
  },

  // -------------------------------------------------------------- Kolkata
  {
    code: 'HWH',
    name: 'Howrah Jn',
    city: 'Kolkata',
    state: 'West Bengal',
    lat: 22.5839,
    lon: 88.3425,
  },
  {
    code: 'SDAH',
    name: 'Sealdah',
    city: 'Kolkata',
    state: 'West Bengal',
    lat: 22.5675,
    lon: 88.3702,
  },
  {
    code: 'KOAA',
    name: 'Kolkata',
    city: 'Kolkata',
    state: 'West Bengal',
    lat: 22.596,
    lon: 88.37,
  },

  // --------------------------------------------------------------- Mumbai
  {
    code: 'CSMT',
    name: 'Mumbai CSMT',
    city: 'Mumbai',
    state: 'Maharashtra',
    lat: 18.9401,
    lon: 72.8353,
  },
  {
    code: 'LTT',
    name: 'Lokmanya Tilak Terminus',
    city: 'Mumbai',
    state: 'Maharashtra',
    lat: 19.068,
    lon: 72.899,
  },
  {
    code: 'BCT',
    name: 'Mumbai Central',
    city: 'Mumbai',
    state: 'Maharashtra',
    lat: 18.9712,
    lon: 72.8194,
  },
  { code: 'DR', name: 'Dadar', city: 'Mumbai', state: 'Maharashtra', lat: 19.0186, lon: 72.844 },

  // -------------------------------------------------------------- Chennai
  {
    code: 'MAS',
    name: 'Chennai Central',
    city: 'Chennai',
    state: 'Tamil Nadu',
    lat: 13.0827,
    lon: 80.2757,
  },
  {
    code: 'MS',
    name: 'Chennai Egmore',
    city: 'Chennai',
    state: 'Tamil Nadu',
    lat: 13.0784,
    lon: 80.2609,
  },
  {
    code: 'TBM',
    name: 'Tambaram',
    city: 'Chennai',
    state: 'Tamil Nadu',
    lat: 12.9249,
    lon: 80.1,
  },

  // ------------------------------------------------------------ Bengaluru
  {
    code: 'SBC',
    name: 'KSR Bengaluru City Jn',
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9776,
    lon: 77.5713,
  },
  {
    code: 'YPR',
    name: 'Yesvantpur Jn',
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 13.0234,
    lon: 77.55,
  },

  // ------------------------------------------------- the northern trunk
  { code: 'PNBE', name: 'Patna Jn', city: 'Patna', state: 'Bihar', lat: 25.6018, lon: 85.137 },
  {
    code: 'CNB',
    name: 'Kanpur Central',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    lat: 26.455,
    lon: 80.35,
  },
  {
    code: 'LJN',
    name: 'Lucknow Jn',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    lat: 26.831,
    lon: 80.919,
  },
  {
    code: 'ALD',
    name: 'Prayagraj Jn',
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    lat: 25.44,
    lon: 81.825,
  },
  {
    code: 'BSB',
    name: 'Varanasi Jn',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    lat: 25.327,
    lon: 82.987,
  },
  { code: 'GAYA', name: 'Gaya Jn', city: 'Gaya', state: 'Bihar', lat: 24.796, lon: 85.002 },
  {
    code: 'DHN',
    name: 'Dhanbad Jn',
    city: 'Dhanbad',
    state: 'Jharkhand',
    lat: 23.795,
    lon: 86.43,
  },
  {
    code: 'ASN',
    name: 'Asansol Jn',
    city: 'Asansol',
    state: 'West Bengal',
    lat: 23.683,
    lon: 86.95,
  },
  {
    code: 'AGC',
    name: 'Agra Cantt',
    city: 'Agra',
    state: 'Uttar Pradesh',
    lat: 27.157,
    lon: 78.018,
  },
  {
    code: 'GWL',
    name: 'Gwalior Jn',
    city: 'Gwalior',
    state: 'Madhya Pradesh',
    lat: 26.22,
    lon: 78.178,
  },
  {
    code: 'JHS',
    name: 'Jhansi Jn',
    city: 'Jhansi',
    state: 'Uttar Pradesh',
    lat: 25.448,
    lon: 78.586,
  },

  // -------------------------------------------------------- east and south
  {
    code: 'BBS',
    name: 'Bhubaneswar',
    city: 'Bhubaneswar',
    state: 'Odisha',
    lat: 20.27,
    lon: 85.84,
  },
  { code: 'PURI', name: 'Puri', city: 'Puri', state: 'Odisha', lat: 19.81, lon: 85.83 },
  {
    code: 'VSKP',
    name: 'Visakhapatnam',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    lat: 17.723,
    lon: 83.302,
  },
  {
    code: 'BZA',
    name: 'Vijayawada Jn',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    lat: 16.517,
    lon: 80.62,
  },
  {
    code: 'SC',
    name: 'Secunderabad Jn',
    city: 'Hyderabad',
    state: 'Telangana',
    lat: 17.434,
    lon: 78.501,
  },
  {
    code: 'HYB',
    name: 'Hyderabad Deccan',
    city: 'Hyderabad',
    state: 'Telangana',
    lat: 17.384,
    lon: 78.487,
  },
  {
    code: 'NGP',
    name: 'Nagpur Jn',
    city: 'Nagpur',
    state: 'Maharashtra',
    lat: 21.153,
    lon: 79.088,
  },
  {
    code: 'RNC',
    name: 'Ranchi Jn',
    city: 'Ranchi',
    state: 'Jharkhand',
    lat: 23.37,
    lon: 85.32,
  },
  {
    code: 'R',
    name: 'Raipur Jn',
    city: 'Raipur',
    state: 'Chhattisgarh',
    lat: 21.251,
    lon: 81.63,
  },

  // ----------------------------------------------------------- the centre
  {
    code: 'BPL',
    name: 'Bhopal Jn',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    lat: 23.268,
    lon: 77.41,
  },
  {
    code: 'ET',
    name: 'Itarsi Jn',
    city: 'Itarsi',
    state: 'Madhya Pradesh',
    lat: 22.614,
    lon: 77.762,
  },
  {
    code: 'JBP',
    name: 'Jabalpur',
    city: 'Jabalpur',
    state: 'Madhya Pradesh',
    lat: 23.17,
    lon: 79.95,
  },
  {
    code: 'INDB',
    name: 'Indore Jn',
    city: 'Indore',
    state: 'Madhya Pradesh',
    lat: 22.718,
    lon: 75.863,
  },

  // ------------------------------------------------------------ the west
  {
    code: 'ADI',
    name: 'Ahmedabad Jn',
    city: 'Ahmedabad',
    state: 'Gujarat',
    lat: 23.025,
    lon: 72.581,
  },
  { code: 'ST', name: 'Surat', city: 'Surat', state: 'Gujarat', lat: 21.205, lon: 72.84 },
  {
    code: 'BRC',
    name: 'Vadodara Jn',
    city: 'Vadodara',
    state: 'Gujarat',
    lat: 22.31,
    lon: 73.181,
  },
  { code: 'JP', name: 'Jaipur Jn', city: 'Jaipur', state: 'Rajasthan', lat: 26.92, lon: 75.788 },
  {
    code: 'JU',
    name: 'Jodhpur Jn',
    city: 'Jodhpur',
    state: 'Rajasthan',
    lat: 26.295,
    lon: 73.024,
  },
  { code: 'AII', name: 'Ajmer Jn', city: 'Ajmer', state: 'Rajasthan', lat: 26.465, lon: 74.639 },
  {
    code: 'UDZ',
    name: 'Udaipur City',
    city: 'Udaipur',
    state: 'Rajasthan',
    lat: 24.58,
    lon: 73.69,
  },
  {
    code: 'PUNE',
    name: 'Pune Jn',
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.529,
    lon: 73.874,
  },
  { code: 'MAO', name: 'Madgaon Jn', city: 'Madgaon', state: 'Goa', lat: 15.27, lon: 73.96 },

  // ----------------------------------------------------------- the north
  {
    code: 'ASR',
    name: 'Amritsar Jn',
    city: 'Amritsar',
    state: 'Punjab',
    lat: 31.634,
    lon: 74.872,
  },
  {
    code: 'LDH',
    name: 'Ludhiana Jn',
    city: 'Ludhiana',
    state: 'Punjab',
    lat: 30.912,
    lon: 75.857,
  },
  {
    code: 'JAT',
    name: 'Jammu Tawi',
    city: 'Jammu',
    state: 'Jammu & Kashmir',
    lat: 32.708,
    lon: 74.863,
  },
  {
    code: 'CDG',
    name: 'Chandigarh',
    city: 'Chandigarh',
    state: 'Chandigarh',
    lat: 30.705,
    lon: 76.8,
  },
  {
    code: 'DDN',
    name: 'Dehradun',
    city: 'Dehradun',
    state: 'Uttarakhand',
    lat: 30.317,
    lon: 78.029,
  },
  {
    code: 'HW',
    name: 'Haridwar Jn',
    city: 'Haridwar',
    state: 'Uttarakhand',
    lat: 29.945,
    lon: 78.16,
  },
  {
    code: 'NJP',
    name: 'New Jalpaiguri Jn',
    city: 'Siliguri',
    state: 'West Bengal',
    lat: 26.687,
    lon: 88.427,
  },
  { code: 'GHY', name: 'Guwahati', city: 'Guwahati', state: 'Assam', lat: 26.183, lon: 91.751 },

  // ----------------------------------------------------------- the south
  {
    code: 'MYS',
    name: 'Mysuru Jn',
    city: 'Mysuru',
    state: 'Karnataka',
    lat: 12.317,
    lon: 76.64,
  },
  {
    code: 'UBL',
    name: 'Hubballi Jn',
    city: 'Hubballi',
    state: 'Karnataka',
    lat: 15.35,
    lon: 75.14,
  },
  {
    code: 'CBE',
    name: 'Coimbatore Jn',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    lat: 11.002,
    lon: 76.966,
  },
  {
    code: 'MDU',
    name: 'Madurai Jn',
    city: 'Madurai',
    state: 'Tamil Nadu',
    lat: 9.919,
    lon: 78.119,
  },
  {
    code: 'TPJ',
    name: 'Tiruchchirappalli Jn',
    city: 'Tiruchirappalli',
    state: 'Tamil Nadu',
    lat: 10.805,
    lon: 78.69,
  },
  {
    code: 'ERS',
    name: 'Ernakulam Jn',
    city: 'Kochi',
    state: 'Kerala',
    lat: 9.97,
    lon: 76.287,
  },
  {
    code: 'TVC',
    name: 'Thiruvananthapuram Central',
    city: 'Thiruvananthapuram',
    state: 'Kerala',
    lat: 8.488,
    lon: 76.95,
  },
];

/** The reference's "Popular Cities" list, in its order. */
export const POPULAR_STATIONS: readonly TrainStation[] = [
  'NDLS',
  'CSMT',
  'PNBE',
  'MAS',
  'SBC',
  'CNB',
  'LJN',
  'HWH',
]
  .map((code) => TRAIN_STATIONS.find((station) => station.code === code))
  .filter((station): station is TrainStation => station !== undefined);

export function findStation(code: string | null | undefined): TrainStation | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return TRAIN_STATIONS.find((station) => station.code === wanted);
}

/** Every station serving one city, so "All Stations" means something. */
export function stationsInCity(city: string): TrainStation[] {
  return TRAIN_STATIONS.filter((station) => station.city === city);
}

/**
 * Free-text station search.
 *
 * Matches a code, a station name, a city or a state, because those are the
 * four things a traveller actually types. An exact code match is pulled to the
 * front: someone typing "MAS" wants Chennai Central, not every station whose
 * name happens to contain those letters.
 */
export function searchStations(term: string): TrainStation[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [...POPULAR_STATIONS];

  const matches = TRAIN_STATIONS.filter(
    (station) =>
      station.code.toLowerCase().includes(needle) ||
      station.name.toLowerCase().includes(needle) ||
      station.city.toLowerCase().includes(needle) ||
      station.state.toLowerCase().includes(needle),
  );

  return matches.sort((a, b) => {
    const exact = Number(b.code.toLowerCase() === needle) - Number(a.code.toLowerCase() === needle);
    if (exact !== 0) return exact;
    const starts =
      Number(b.name.toLowerCase().startsWith(needle)) -
      Number(a.name.toLowerCase().startsWith(needle));
    if (starts !== 0) return starts;
    return a.name.localeCompare(b.name);
  });
}

/** Great-circle kilometres between two stations. */
export function crowKm(a: TrainStation, b: TrainStation): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Track kilometres.
 *
 * Rail runs straighter than road but still detours around ghats, rivers and
 * junctions, so the crow distance is scaled rather than used raw. The factor is
 * the one that puts the main trunk routes within a few per cent of their real
 * chargeable distances.
 */
export const RAIL_FACTOR = 1.22;

export function railKm(a: TrainStation, b: TrainStation): number {
  return Math.round(crowKm(a, b) * RAIL_FACTOR);
}
