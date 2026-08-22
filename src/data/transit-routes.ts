/**
 * Toll corridors and metro stations.
 *
 * Split out from `transit.ts` so a client component can import a station list
 * without dragging a service -- and through it the Mongo driver -- into the
 * browser bundle.
 *
 * The highways and the neighbourhoods are real; they are geography, not
 * anybody's trademark. The toll figures are illustrative, like every other
 * price in this store. The *rules* applied to them are the real ones: a return
 * trip within 24 hours is charged at one and a half single trips, and a monthly
 * pass at a single plaza is capped well below what fifty crossings would cost.
 */

export interface TollCorridor {
  id: string;
  /** Where to where. */
  name: string;
  /** The national highway it runs on. */
  highway: string;
  km: number;
  /** How many plazas a full run crosses. */
  plazas: number;
  /** One-way total for a car, in whole rupees. */
  carRupees: number;
}

export const TOLL_CORRIDORS: readonly TollCorridor[] = [
  { id: 'del-jai', name: 'Delhi to Jaipur', highway: 'NH 48', km: 268, plazas: 4, carRupees: 385 },
  {
    id: 'del-agr',
    name: 'Delhi to Agra',
    highway: 'Yamuna Expressway',
    km: 165,
    plazas: 3,
    carRupees: 460,
  },
  {
    id: 'del-cha',
    name: 'Delhi to Chandigarh',
    highway: 'NH 44',
    km: 244,
    plazas: 4,
    carRupees: 340,
  },
  {
    id: 'mum-pun',
    name: 'Mumbai to Pune',
    highway: 'Mumbai-Pune Expressway',
    km: 94,
    plazas: 2,
    carRupees: 336,
  },
  { id: 'mum-sur', name: 'Mumbai to Surat', highway: 'NH 48', km: 284, plazas: 5, carRupees: 520 },
  {
    id: 'blr-che',
    name: 'Bengaluru to Chennai',
    highway: 'NH 48',
    km: 346,
    plazas: 5,
    carRupees: 480,
  },
  {
    id: 'blr-mys',
    name: 'Bengaluru to Mysuru',
    highway: 'NH 275',
    km: 139,
    plazas: 2,
    carRupees: 250,
  },
  {
    id: 'hyd-vij',
    name: 'Hyderabad to Vijayawada',
    highway: 'NH 65',
    km: 275,
    plazas: 4,
    carRupees: 425,
  },
  {
    id: 'che-mad',
    name: 'Chennai to Madurai',
    highway: 'NH 38',
    km: 462,
    plazas: 6,
    carRupees: 610,
  },
  {
    id: 'ahm-udr',
    name: 'Ahmedabad to Udaipur',
    highway: 'NH 48',
    km: 262,
    plazas: 4,
    carRupees: 395,
  },
  {
    id: 'kol-dgp',
    name: 'Kolkata to Durgapur',
    highway: 'NH 19',
    km: 167,
    plazas: 3,
    carRupees: 285,
  },
  { id: 'pun-nas', name: 'Pune to Nashik', highway: 'NH 60', km: 210, plazas: 3, carRupees: 310 },
];

export function findCorridor(id: string | null | undefined): TollCorridor | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return TOLL_CORRIDORS.find((corridor) => corridor.id === wanted);
}

/**
 * A return trip within 24 hours is charged at 1.5 single trips.
 *
 * The real rule at a national plaza, and the one most people do not know they
 * are entitled to.
 */
export const RETURN_TRIP_MULTIPLIER = 1.5;

/**
 * A monthly pass at one plaza costs about what 22 single crossings would.
 *
 * The real figure is set per plaza; this is the shape of it -- a commuter
 * crossing twice a day pays far less than 50 single trips.
 */
export const MONTHLY_PASS_TRIPS = 22;

// ------------------------------------------------------------ metro stations

export interface MetroStation {
  id: string;
  name: string;
  networkId: string;
  /** The line it sits on, for the picker's grouping. */
  line: string;
  /** Kilometres east and north of the network's central interchange. */
  x: number;
  y: number;
  /** An interchange, which is where a journey can change line. */
  interchange?: boolean;
}

/**
 * Stations.
 *
 * Real neighbourhoods, positioned roughly where they are, on invented networks.
 * The distance between two of them is what prices a journey, so the positions
 * have to be approximately right or the fare is nonsense; the names are place
 * names, which belong to the places.
 */
export const METRO_STATIONS: readonly MetroStation[] = [
  // Delhi
  {
    id: 'del-cp',
    name: 'Connaught Place',
    networkId: 'delhi',
    line: 'Blue',
    x: 0,
    y: 0,
    interchange: true,
  },
  { id: 'del-kb', name: 'Karol Bagh', networkId: 'delhi', line: 'Blue', x: -3.4, y: 1.6 },
  {
    id: 'del-dwk',
    name: 'Dwarka',
    networkId: 'delhi',
    line: 'Blue',
    x: -17.5,
    y: -2.1,
    interchange: true,
  },
  { id: 'del-jnp', name: 'Janakpuri', networkId: 'delhi', line: 'Blue', x: -12.8, y: -0.4 },
  { id: 'del-noi', name: 'Noida Sector 18', networkId: 'delhi', line: 'Blue', x: 14.2, y: -4.8 },
  { id: 'del-csk', name: 'Chandni Chowk', networkId: 'delhi', line: 'Yellow', x: 1.2, y: 2.4 },
  {
    id: 'del-hkz',
    name: 'Hauz Khas',
    networkId: 'delhi',
    line: 'Yellow',
    x: -1.6,
    y: -9.8,
    interchange: true,
  },
  { id: 'del-sak', name: 'Saket', networkId: 'delhi', line: 'Yellow', x: -0.9, y: -13.6 },
  {
    id: 'del-hns',
    name: 'Huda City Centre',
    networkId: 'delhi',
    line: 'Yellow',
    x: -6.4,
    y: -25.2,
  },
  {
    id: 'del-lnp',
    name: 'Lajpat Nagar',
    networkId: 'delhi',
    line: 'Violet',
    x: 2.6,
    y: -6.9,
    interchange: true,
  },
  {
    id: 'del-kal',
    name: 'Kalkaji',
    networkId: 'delhi',
    line: 'Violet',
    x: 4.8,
    y: -10.4,
    interchange: true,
  },
  {
    id: 'del-rjg',
    name: 'Rajouri Garden',
    networkId: 'delhi',
    line: 'Pink',
    x: -8.6,
    y: 1.1,
    interchange: true,
  },
  {
    id: 'del-anv',
    name: 'Anand Vihar',
    networkId: 'delhi',
    line: 'Pink',
    x: 11.4,
    y: 2.7,
    interchange: true,
  },
  { id: 'del-shd', name: 'Shahdara', networkId: 'delhi', line: 'Red', x: 7.8, y: 4.6 },

  // Mumbai
  {
    id: 'mum-and',
    name: 'Andheri',
    networkId: 'mumbai',
    line: 'Line 1',
    x: 0,
    y: 0,
    interchange: true,
  },
  {
    id: 'mum-ghk',
    name: 'Ghatkopar',
    networkId: 'mumbai',
    line: 'Line 1',
    x: 8.9,
    y: -1.2,
    interchange: true,
  },
  { id: 'mum-vrs', name: 'Versova', networkId: 'mumbai', line: 'Line 1', x: -4.1, y: 0.8 },
  { id: 'mum-dhs', name: 'Dahisar', networkId: 'mumbai', line: 'Line 7', x: 0.6, y: 14.8 },
  { id: 'mum-brv', name: 'Borivali', networkId: 'mumbai', line: 'Line 7', x: 0.3, y: 11.2 },
  { id: 'mum-gor', name: 'Goregaon', networkId: 'mumbai', line: 'Line 7', x: 0.2, y: 5.4 },
  {
    id: 'mum-bkc',
    name: 'Bandra Kurla Complex',
    networkId: 'mumbai',
    line: 'Line 3',
    x: 2.4,
    y: -6.8,
    interchange: true,
  },
  { id: 'mum-wor', name: 'Worli', networkId: 'mumbai', line: 'Line 3', x: 0.9, y: -14.6 },
  { id: 'mum-chr', name: 'Churchgate', networkId: 'mumbai', line: 'Line 3', x: 1.8, y: -20.9 },
  {
    id: 'mum-dad',
    name: 'Dadar',
    networkId: 'mumbai',
    line: 'Line 3',
    x: 2.1,
    y: -11.7,
    interchange: true,
  },

  // Bengaluru
  {
    id: 'blr-mgr',
    name: 'M G Road',
    networkId: 'bengaluru',
    line: 'Purple',
    x: 0,
    y: 0,
    interchange: true,
  },
  { id: 'blr-ind', name: 'Indiranagar', networkId: 'bengaluru', line: 'Purple', x: 3.6, y: 0.9 },
  { id: 'blr-whf', name: 'Whitefield', networkId: 'bengaluru', line: 'Purple', x: 16.4, y: 1.8 },
  { id: 'blr-mys', name: 'Mysuru Road', networkId: 'bengaluru', line: 'Purple', x: -8.2, y: -1.6 },
  {
    id: 'blr-maj',
    name: 'Majestic',
    networkId: 'bengaluru',
    line: 'Green',
    x: -2.4,
    y: 0.6,
    interchange: true,
  },
  { id: 'blr-jay', name: 'Jayanagar', networkId: 'bengaluru', line: 'Green', x: -2.1, y: -6.4 },
  { id: 'blr-yes', name: 'Yeshwanthpur', networkId: 'bengaluru', line: 'Green', x: -4.9, y: 5.8 },
  {
    id: 'blr-elc',
    name: 'Electronic City',
    networkId: 'bengaluru',
    line: 'Yellow',
    x: 1.2,
    y: -16.8,
  },
  { id: 'blr-btl', name: 'BTM Layout', networkId: 'bengaluru', line: 'Yellow', x: 0.4, y: -8.9 },

  // Chennai
  {
    id: 'che-cen',
    name: 'Chennai Central',
    networkId: 'chennai',
    line: 'Blue',
    x: 0,
    y: 0,
    interchange: true,
  },
  { id: 'che-air', name: 'Airport', networkId: 'chennai', line: 'Blue', x: -3.1, y: -14.6 },
  {
    id: 'che-gui',
    name: 'Guindy',
    networkId: 'chennai',
    line: 'Blue',
    x: -1.8,
    y: -9.4,
    interchange: true,
  },
  { id: 'che-tng', name: 'Teynampet', networkId: 'chennai', line: 'Blue', x: -0.6, y: -5.2 },
  {
    id: 'che-egm',
    name: 'Egmore',
    networkId: 'chennai',
    line: 'Green',
    x: -1.2,
    y: 0.4,
    interchange: true,
  },
  { id: 'che-vad', name: 'Vadapalani', networkId: 'chennai', line: 'Green', x: -7.4, y: -3.8 },
  {
    id: 'che-stt',
    name: 'St Thomas Mount',
    networkId: 'chennai',
    line: 'Green',
    x: -3.4,
    y: -11.8,
  },

  // Hyderabad
  {
    id: 'hyd-amp',
    name: 'Ameerpet',
    networkId: 'hyderabad',
    line: 'Red',
    x: 0,
    y: 0,
    interchange: true,
  },
  { id: 'hyd-mia', name: 'Miyapur', networkId: 'hyderabad', line: 'Red', x: -9.6, y: 3.4 },
  { id: 'hyd-lbn', name: 'LB Nagar', networkId: 'hyderabad', line: 'Red', x: 11.2, y: -6.8 },
  { id: 'hyd-hit', name: 'Hitec City', networkId: 'hyderabad', line: 'Blue', x: -8.4, y: -0.9 },
  { id: 'hyd-rag', name: 'Raidurg', networkId: 'hyderabad', line: 'Blue', x: -10.1, y: -1.6 },
  {
    id: 'hyd-sec',
    name: 'Secunderabad',
    networkId: 'hyderabad',
    line: 'Blue',
    x: 4.2,
    y: 2.8,
    interchange: true,
  },
  {
    id: 'hyd-jbs',
    name: 'Jubilee Bus Station',
    networkId: 'hyderabad',
    line: 'Green',
    x: 3.1,
    y: 3.6,
  },

  // Kolkata
  {
    id: 'kol-esp',
    name: 'Esplanade',
    networkId: 'kolkata',
    line: 'Blue',
    x: 0,
    y: 0,
    interchange: true,
  },
  {
    id: 'kol-dum',
    name: 'Dum Dum',
    networkId: 'kolkata',
    line: 'Blue',
    x: 0.8,
    y: 10.6,
    interchange: true,
  },
  {
    id: 'kol-kav',
    name: 'Kavi Subhash',
    networkId: 'kolkata',
    line: 'Blue',
    x: 2.4,
    y: -12.4,
    interchange: true,
  },
  { id: 'kol-rab', name: 'Rabindra Sadan', networkId: 'kolkata', line: 'Blue', x: 0.2, y: -2.1 },
  { id: 'kol-how', name: 'Howrah Maidan', networkId: 'kolkata', line: 'Green', x: -3.6, y: 0.4 },
  {
    id: 'kol-slt',
    name: 'Salt Lake Sector V',
    networkId: 'kolkata',
    line: 'Green',
    x: 8.4,
    y: 4.2,
  },
  {
    id: 'kol-nsc',
    name: 'Netaji Subhash Sarani',
    networkId: 'kolkata',
    line: 'Orange',
    x: 4.6,
    y: -8.2,
  },
];

export function stationsOn(networkId: string): MetroStation[] {
  return METRO_STATIONS.filter((station) => station.networkId === networkId);
}

export function findStation(id: string | null | undefined): MetroStation | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return METRO_STATIONS.find((station) => station.id === wanted);
}

/**
 * Track kilometres between two stations.
 *
 * Straight-line distance stretched by a route factor, because track does not go
 * in straight lines and a fare charged on the crow's flight would undercount
 * every journey that changes line. The same trick the train book uses.
 */
export const ROUTE_FACTOR = 1.28;

export function trackKm(from: MetroStation, to: MetroStation): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const crow = Math.sqrt(dx * dx + dy * dy);
  // A journey that changes line goes round an interchange rather than through
  // the gap between two lines, so it is a little longer than the geometry says.
  const changesLine = from.line !== to.line;
  return crow * ROUTE_FACTOR * (changesLine ? 1.12 : 1);
}

// ---------------------------------------------------------------- the maths

/**
 * What a corridor costs to drive.
 *
 * A car's rate is the published one; every other class is a multiple of it,
 * which is how a plaza actually prices an axle count. A return within 24 hours
 * is 1.5 single trips -- the real concession, and the one most people miss.
 */
export function tollRupees(
  corridor: TollCorridor,
  multiplier: number,
  options: { returnTrip?: boolean } = {},
): number {
  const single = Math.round(corridor.carRupees * multiplier);
  if (!options.returnTrip) return single;
  return Math.round(single * RETURN_TRIP_MULTIPLIER);
}

/** What a month of commuting through one plaza costs. */
export function monthlyPassRupees(corridor: TollCorridor, multiplier: number): number {
  // A pass is bought at a single plaza, not for the whole corridor.
  const perPlaza = corridor.carRupees / Math.max(1, corridor.plazas);
  return Math.round(perPlaza * multiplier * MONTHLY_PASS_TRIPS);
}
