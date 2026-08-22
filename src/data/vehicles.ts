/**
 * Indian vehicle registration.
 *
 * The state and union-territory codes are real public facts, the same category
 * as the PIN geography the delivery estimator uses and the station codes the
 * train search uses. A registration mark is `SS DD LL NNNN` -- state, RTO
 * district, a letter series, and up to four digits -- and parsing it properly
 * is what lets the page say "that is a Tamil Nadu number" rather than shrugging.
 *
 * Everything downstream of this -- insurers, premiums, IDV -- is this store's
 * own and is labelled as such on the page.
 */

export interface RegionCode {
  code: string;
  name: string;
}

/** Every current state and UT prefix. */
export const REGION_CODES: readonly RegionCode[] = [
  { code: 'AN', name: 'Andaman & Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'DD', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'JK', name: 'Jammu & Kashmir' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MN', name: 'Manipur' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PB', name: 'Punjab' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TR', name: 'Tripura' },
  { code: 'TS', name: 'Telangana' },
  { code: 'UK', name: 'Uttarakhand' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'WB', name: 'West Bengal' },
];

export function findRegion(code: string | null | undefined): RegionCode | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return REGION_CODES.find((region) => region.code === wanted);
}

export type VehicleKind = 'CAR' | 'BIKE';

export interface Registration {
  /** Normalised, without spaces or dashes: "TN02BQ6666". */
  normalised: string;
  /** Spaced for display: "TN 02 BQ 6666". */
  pretty: string;
  region: RegionCode;
  /** RTO district number, 1 to 99. */
  district: number;
  /** The letter series, one to three letters. */
  series: string;
  /** The running number, up to four digits. */
  number: string;
}

/** Uppercased with separators stripped, so "tn 02 bq-6666" still works. */
export function normaliseRegistration(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Parses a registration mark.
 *
 * Deliberately strict about shape and lenient about spacing: people type these
 * with spaces, dashes or neither, but a mark that is not `SS DD LL NNNN` is not
 * a mark, and guessing at it would mean quoting for a vehicle that does not
 * exist.
 *
 * Bharat-series and older single-letter series are both accepted, because both
 * are on the road.
 */
export function parseRegistration(input: string): Registration | null {
  const normalised = normaliseRegistration(input);
  const match = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(normalised);
  if (!match) return null;

  const [, code, districtRaw, series, number] = match;
  if (!code || !districtRaw || !series || !number) return null;

  const region = findRegion(code);
  if (!region) return null;

  const district = Number(districtRaw);
  if (!Number.isInteger(district) || district < 1 || district > 99) return null;

  return {
    normalised,
    pretty: `${code} ${districtRaw.padStart(2, '0')} ${series} ${number}`,
    region,
    district,
    series,
    number,
  };
}

/**
 * Vehicle models.
 *
 * Invented, like every brand this store has added. A quote is a promise about a
 * specific vehicle, and attaching one to a real manufacturer's model name would
 * be making that promise on their behalf.
 *
 * The *segments* are real, and so is the thing that matters for pricing: engine
 * displacement, which is what third-party premiums are banded by in India.
 */
export interface VehicleModel {
  id: string;
  make: string;
  model: string;
  variant: string;
  kind: VehicleKind;
  /** Engine displacement in cc. Drives the third-party band. */
  cc: number;
  /** Showroom price when new, in whole rupees. */
  exShowroomRupees: number;
  /** Seats, which the personal-accident cover is priced per. */
  seats: number;
}

export const VEHICLE_MODELS: readonly VehicleModel[] = [
  // ------------------------------------------------------------------ cars
  {
    id: 'meridian-hatch-lx',
    make: 'Meridian',
    model: 'Hatch',
    variant: 'LX MT',
    kind: 'CAR',
    cc: 998,
    exShowroomRupees: 565_000,
    seats: 5,
  },
  {
    id: 'meridian-hatch-vx',
    make: 'Meridian',
    model: 'Hatch',
    variant: 'VX AMT',
    kind: 'CAR',
    cc: 1197,
    exShowroomRupees: 712_000,
    seats: 5,
  },
  {
    id: 'kestrel-sedan-vx',
    make: 'Kestrel',
    model: 'Sedan',
    variant: 'VX (O) MT',
    kind: 'CAR',
    cc: 1498,
    exShowroomRupees: 1_145_000,
    seats: 5,
  },
  {
    id: 'kestrel-sedan-zx',
    make: 'Kestrel',
    model: 'Sedan',
    variant: 'ZX Diesel',
    kind: 'CAR',
    cc: 1498,
    exShowroomRupees: 1_390_000,
    seats: 5,
  },
  {
    id: 'halcyon-suv-lx',
    make: 'Halcyon',
    model: 'Terrain',
    variant: 'LX MT',
    kind: 'CAR',
    cc: 1497,
    exShowroomRupees: 1_290_000,
    seats: 5,
  },
  {
    id: 'halcyon-suv-zx',
    make: 'Halcyon',
    model: 'Terrain',
    variant: 'ZX AT 4WD',
    kind: 'CAR',
    cc: 1956,
    exShowroomRupees: 2_240_000,
    seats: 7,
  },
  {
    id: 'beacon-mpv',
    make: 'Beacon',
    model: 'Voyager',
    variant: 'VX MT',
    kind: 'CAR',
    cc: 1462,
    exShowroomRupees: 1_060_000,
    seats: 7,
  },
  {
    id: 'aurora-ev',
    make: 'Aurora',
    model: 'Volt',
    variant: 'Long Range',
    kind: 'CAR',
    // An electric car has no displacement; third-party is banded by kW instead,
    // and this is the equivalent band the tables treat it as.
    cc: 0,
    exShowroomRupees: 1_680_000,
    seats: 5,
  },

  // ----------------------------------------------------------------- bikes
  {
    id: 'kestrel-commuter',
    make: 'Kestrel',
    model: 'Dart',
    variant: '110',
    kind: 'BIKE',
    cc: 110,
    exShowroomRupees: 78_000,
    seats: 2,
  },
  {
    id: 'kestrel-scooter',
    make: 'Kestrel',
    model: 'Glide',
    variant: '125',
    kind: 'BIKE',
    cc: 125,
    exShowroomRupees: 92_000,
    seats: 2,
  },
  {
    id: 'halcyon-roadster',
    make: 'Halcyon',
    model: 'Roadster',
    variant: '350',
    kind: 'BIKE',
    cc: 349,
    exShowroomRupees: 214_000,
    seats: 2,
  },
  {
    id: 'meridian-tourer',
    make: 'Meridian',
    model: 'Tourer',
    variant: '650 GT',
    kind: 'BIKE',
    cc: 648,
    exShowroomRupees: 348_000,
    seats: 2,
  },
];

export function findModel(id: string | null | undefined): VehicleModel | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return VEHICLE_MODELS.find((model) => model.id === wanted);
}

export function modelsOf(kind: VehicleKind): VehicleModel[] {
  return VEHICLE_MODELS.filter((model) => model.kind === kind);
}

/** "Kestrel Sedan VX (O) MT (1498)" -- how a policy names a vehicle. */
export function modelLabel(model: VehicleModel): string {
  const cc = model.cc > 0 ? ` (${model.cc})` : ' (EV)';
  return `${model.make} ${model.model} ${model.variant}${cc}`;
}
