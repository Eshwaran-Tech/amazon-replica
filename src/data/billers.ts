/**
 * The biller book.
 *
 * **Every biller here is invented.** The reference lists real discoms, real
 * banks and real municipal corporations. Those are real organisations, and a
 * page that names one and then quotes a tariff, a minimum due or a property-tax
 * rate is stating that organisation's charges as fact and taking money against
 * them. The names below belong to this store; swapping them for real ones is
 * one edit to this file for anyone who holds the rights.
 *
 * **The regions, the units and the rules are real.** Electricity really is
 * billed on telescopic slabs, water really does carry a sewerage cess set as a
 * percentage of the water charge, piped gas really is read every two months,
 * a credit-card minimum due really is about 5% of the balance, and a property
 * tax really does carry an early-payment rebate and a late penalty. That part
 * is public convention and worth being right about.
 */

export const BILL_CATEGORIES = [
  'ELECTRICITY',
  'WATER',
  'PIPED_GAS',
  'POSTPAID',
  'LANDLINE',
  'BROADBAND',
  'CABLE',
  'CREDIT_CARD',
  'LOAN',
  'MUNICIPAL_TAX',
  'EDUCATION',
  'INSURANCE_PREMIUM',
  'LPG',
  'DTH',
] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number];

/**
 * What each category calls the thing you type in, and what shape it is.
 *
 * The shapes are the real ones. An LPG consumer id genuinely is 17 digits; a
 * property id genuinely is a zone, a ward and a serial; a landline genuinely is
 * an STD code and a subscriber number. Validating the real shape means a typo
 * is caught before any money moves, which a "just accept anything" field cannot
 * do.
 */
export interface AccountFormat {
  /** What the field is called on the form. */
  label: string;
  /** Shown under it. */
  hint: string;
  placeholder: string;
  /** Applied to the uppercased input with spaces and hyphens stripped. */
  pattern: RegExp;
}

export const ACCOUNT_FORMATS: Record<BillCategory, AccountFormat> = {
  ELECTRICITY: {
    label: 'Consumer number',
    hint: 'Ten to twelve digits, printed at the top of your bill.',
    placeholder: '104578291630',
    pattern: /^\d{10,12}$/,
  },
  WATER: {
    label: 'Connection number',
    hint: 'Eight to ten digits from your water bill.',
    placeholder: '48210937',
    pattern: /^\d{8,10}$/,
  },
  PIPED_GAS: {
    label: 'BP number',
    hint: 'Eight to eleven digits, on the top right of the bill.',
    placeholder: '900482173',
    pattern: /^\d{8,11}$/,
  },
  POSTPAID: {
    label: 'Mobile number',
    hint: 'Ten digits, no country code.',
    placeholder: '9876543210',
    pattern: /^[6-9]\d{9}$/,
  },
  LANDLINE: {
    label: 'STD code and number',
    hint: 'Area code followed by the subscriber number, for example 044 28152200.',
    placeholder: '04428152200',
    pattern: /^0\d{9,11}$/,
  },
  BROADBAND: {
    label: 'Account ID',
    hint: 'The account id on your bill: three letters and six digits.',
    placeholder: 'FBR204815',
    pattern: /^[A-Z]{3}\d{6}$/,
  },
  CABLE: {
    label: 'Subscriber ID',
    hint: 'Ten to twelve digits from your set-top box or bill.',
    placeholder: '300248179254',
    pattern: /^\d{10,12}$/,
  },
  CREDIT_CARD: {
    label: 'Registered mobile and last four digits',
    hint: 'Ten digits, then the last four of the card — for example 9876543210 4291.',
    placeholder: '9876543210 4291',
    // Deliberately not a card number. See the note in `bills/credit.ts`.
    pattern: /^[6-9]\d{9}\d{4}$/,
  },
  LOAN: {
    label: 'Loan account number',
    hint: 'Two letters and eight digits, from your sanction letter.',
    placeholder: 'HL48201736',
    pattern: /^[A-Z]{2}\d{8}$/,
  },
  MUNICIPAL_TAX: {
    label: 'Property ID',
    hint: 'Zone, ward and serial, run together — for example 08 042 013796.',
    placeholder: '08042013796',
    pattern: /^\d{11}$/,
  },
  EDUCATION: {
    label: 'Enrolment number',
    hint: 'Four digits for the year, then six — for example 2023 048172.',
    placeholder: '2023048172',
    pattern: /^(19|20)\d{2}\d{6}$/,
  },
  INSURANCE_PREMIUM: {
    label: 'Policy number',
    hint: 'A policy bought here — MP or HP, then eight characters.',
    placeholder: 'MP-1A2B3C4D',
    pattern: /^(MP|HP)[0-9A-F]{8}$/,
  },
  LPG: {
    label: 'LPG ID',
    hint: 'The seventeen-digit id printed on your subscription voucher.',
    placeholder: '12345678901234567',
    pattern: /^\d{17}$/,
  },
  DTH: {
    label: 'Subscriber ID',
    hint: 'Ten to twelve digits, on your set-top box or on screen under Settings.',
    placeholder: '3002481792',
    pattern: /^[0-9]{10,12}$/,
  },
};

/**
 * Normalises what was typed, then checks the shape.
 *
 * Spaces and hyphens are stripped because people copy a number off a bill
 * exactly as it is printed, and rejecting that would be a nuisance rather than
 * a safeguard.
 */
export function normaliseAccount(category: BillCategory, input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();
  return ACCOUNT_FORMATS[category].pattern.test(cleaned) ? cleaned : null;
}

export interface Biller {
  id: string;
  name: string;
  category: BillCategory;
  /**
   * Where it operates. Real geography -- a discom really is a state or a city
   * monopoly, and which one you are with is not a choice you get to make.
   */
  region: string;
  /** One line for the picker. */
  note: string;
  hue: number;
}

export const BILLERS: readonly Biller[] = [
  // --- electricity ---------------------------------------------------------
  {
    id: 'coromandel-power',
    name: 'Coromandel Power',
    category: 'ELECTRICITY',
    region: 'Tamil Nadu',
    note: 'Bills monthly on a telescopic slab tariff.',
    hue: 34,
  },
  {
    id: 'deccan-electric',
    name: 'Deccan Electric',
    category: 'ELECTRICITY',
    region: 'Telangana and Andhra Pradesh',
    note: 'Monthly, with a fixed charge by sanctioned load.',
    hue: 200,
  },
  {
    id: 'harbour-power',
    name: 'Harbour Power',
    category: 'ELECTRICITY',
    region: 'Maharashtra',
    note: 'Monthly, with a separate wheeling charge.',
    hue: 150,
  },
  {
    id: 'capital-grid',
    name: 'Capital Grid',
    category: 'ELECTRICITY',
    region: 'Delhi NCR',
    note: 'Monthly, with a pension trust surcharge.',
    hue: 268,
  },
  {
    id: 'garden-power',
    name: 'Garden Power',
    category: 'ELECTRICITY',
    region: 'Karnataka',
    note: 'Monthly, with a fixed charge per sanctioned kW.',
    hue: 120,
  },

  // --- water ---------------------------------------------------------------
  {
    id: 'capital-water',
    name: 'Capital Water Board',
    category: 'WATER',
    region: 'Delhi NCR',
    note: 'Read every two months. Sewerage cess is a share of the water charge.',
    hue: 195,
  },
  {
    id: 'coromandel-water',
    name: 'Coromandel Metrowater',
    category: 'WATER',
    region: 'Chennai',
    note: 'Bi-monthly, with a meter rent per connection.',
    hue: 185,
  },
  {
    id: 'garden-water',
    name: 'Garden Water Supply',
    category: 'WATER',
    region: 'Bengaluru',
    note: 'Bi-monthly, with a sanitary charge on top of the cess.',
    hue: 165,
  },

  // --- piped gas -----------------------------------------------------------
  {
    id: 'meridian-gas',
    name: 'Meridian City Gas',
    category: 'PIPED_GAS',
    region: 'Gujarat and Rajasthan',
    note: 'Read every two months, priced per standard cubic metre.',
    hue: 20,
  },
  {
    id: 'harbour-gas',
    name: 'Harbour Piped Gas',
    category: 'PIPED_GAS',
    region: 'Mumbai and Thane',
    note: 'Bi-monthly, with VAT rather than GST — piped gas is outside GST.',
    hue: 45,
  },
  {
    id: 'capital-gas',
    name: 'Capital Piped Gas',
    category: 'PIPED_GAS',
    region: 'Delhi NCR',
    note: 'Bi-monthly, with a fixed charge per cycle.',
    hue: 8,
  },

  // --- postpaid, landline, broadband ---------------------------------------
  // The same four operators the prepaid book uses, because a customer's
  // postpaid line is with one of the same companies. Real names, invented
  // rentals -- see the note at the top of `data/recharge-plans.ts`.
  {
    id: 'jio-postpaid',
    name: 'Jio Postpaid',
    category: 'POSTPAID',
    region: 'All circles',
    note: 'Rental plus anything beyond the plan.',
    hue: 200,
  },
  {
    id: 'airtel-postpaid',
    name: 'Airtel Postpaid',
    category: 'POSTPAID',
    region: 'All circles',
    note: 'Rental plus usage, billed monthly in arrears.',
    hue: 160,
  },
  {
    id: 'bsnl-postpaid',
    name: 'BSNL Postpaid',
    category: 'POSTPAID',
    region: 'All circles',
    note: 'Family plans share one data pool.',
    hue: 28,
  },
  {
    id: 'vi-postpaid',
    name: 'Vi Postpaid',
    category: 'POSTPAID',
    region: 'All circles',
    note: 'Rental plus usage, with international roaming billed separately.',
    hue: 285,
  },
  {
    id: 'bsnl-landline',
    name: 'BSNL Landline',
    category: 'LANDLINE',
    region: 'All circles',
    note: 'Rental with a free-call allowance, then metered.',
    hue: 210,
  },
  {
    id: 'airtel-landline',
    name: 'Airtel Landline',
    category: 'LANDLINE',
    region: 'All circles',
    note: 'Rental plus metered local, STD and ISD calls.',
    hue: 262,
  },
  {
    id: 'fibrenet',
    name: 'Fibrenet Broadband',
    category: 'BROADBAND',
    region: 'Metro and tier-one cities',
    note: 'Speed tiers with a fair-use limit, then throttled.',
    hue: 190,
  },
  {
    id: 'jio-fibre',
    name: 'Jio Fibre',
    category: 'BROADBAND',
    region: 'All circles',
    note: 'Unlimited plans with a fair-use limit and a static IP add-on.',
    hue: 205,
  },
  {
    id: 'garden-broadband',
    name: 'Garden Broadband',
    category: 'BROADBAND',
    region: 'Karnataka and Kerala',
    note: 'Local operator, symmetric upload.',
    hue: 140,
  },

  // --- cable ---------------------------------------------------------------
  {
    id: 'delta-cable',
    name: 'Delta Cable',
    category: 'CABLE',
    region: 'Eastern India',
    note: 'Network capacity fee plus whatever packs you take.',
    hue: 340,
  },
  {
    id: 'harbour-cable',
    name: 'Harbour Cable Network',
    category: 'CABLE',
    region: 'Maharashtra and Goa',
    note: 'Priced under the regulator’s capacity-fee structure.',
    hue: 12,
  },

  // --- credit card and loan ------------------------------------------------
  {
    id: 'meridian-card',
    name: 'Meridian Bank Card',
    category: 'CREDIT_CARD',
    region: 'All India',
    note: 'Statement balance, minimum due and what the revolve costs.',
    hue: 210,
  },
  {
    id: 'kestrel-card',
    name: 'Kestrel Bank Card',
    category: 'CREDIT_CARD',
    region: 'All India',
    note: 'Interest runs from the transaction date once you revolve.',
    hue: 160,
  },
  {
    id: 'halcyon-card',
    name: 'Halcyon Bank Card',
    category: 'CREDIT_CARD',
    region: 'All India',
    note: 'Minimum due is five per cent, with a floor.',
    hue: 28,
  },
  {
    id: 'meridian-loans',
    name: 'Meridian Bank Loans',
    category: 'LOAN',
    region: 'All India',
    note: 'Home, car and personal loans on reducing balance.',
    hue: 212,
  },
  {
    id: 'kestrel-loans',
    name: 'Kestrel Bank Loans',
    category: 'LOAN',
    region: 'All India',
    note: 'Prepayment allowed on floating-rate loans without a charge.',
    hue: 158,
  },
  {
    id: 'beacon-finance',
    name: 'Beacon Finance',
    category: 'LOAN',
    region: 'All India',
    note: 'Non-bank lender; prepayment carries a charge.',
    hue: 288,
  },

  // --- municipal tax -------------------------------------------------------
  {
    id: 'coromandel-corporation',
    name: 'Coromandel City Corporation',
    category: 'MUNICIPAL_TAX',
    region: 'Chennai',
    note: 'Half-yearly property tax with an early-payment rebate.',
    hue: 30,
  },
  {
    id: 'garden-corporation',
    name: 'Garden City Corporation',
    category: 'MUNICIPAL_TAX',
    region: 'Bengaluru',
    note: 'Annual, self-assessed on built-up area.',
    hue: 130,
  },
  {
    id: 'harbour-corporation',
    name: 'Harbour Municipal Corporation',
    category: 'MUNICIPAL_TAX',
    region: 'Mumbai',
    note: 'Half-yearly, with a penalty accruing monthly after the due date.',
    hue: 350,
  },

  // --- education -----------------------------------------------------------
  {
    id: 'lantern-school',
    name: 'Lantern Hill School',
    category: 'EDUCATION',
    region: 'Bengaluru',
    note: 'Three terms a year, each with its own due date.',
    hue: 42,
  },
  {
    id: 'stonebridge-college',
    name: 'Stonebridge College',
    category: 'EDUCATION',
    region: 'Pune',
    note: 'Two semesters, with a hostel head where it applies.',
    hue: 265,
  },
  {
    id: 'quill-academy',
    name: 'Quill Academy',
    category: 'EDUCATION',
    region: 'Chennai',
    note: 'Three terms, late fee accrues per day.',
    hue: 175,
  },

  // --- insurance and LPG ---------------------------------------------------
  // These two have no biller picker in the usual sense: an insurance premium is
  // read from the policies this store issued, and an LPG refill is a booking.
  {
    id: 'meridian-general',
    name: 'Meridian General',
    category: 'INSURANCE_PREMIUM',
    region: 'All India',
    note: 'Renewal of a policy taken out here.',
    hue: 210,
  },
  {
    id: 'meridian-lpg',
    name: 'Meridian Gas',
    category: 'LPG',
    region: 'All India',
    note: '14.2 kg and 5 kg cylinders, home delivered.',
    hue: 22,
  },
  {
    id: 'kestrel-lpg',
    name: 'Kestrel Gas',
    category: 'LPG',
    region: 'All India',
    note: 'Refill and a composite cylinder option.',
    hue: 158,
  },
  {
    id: 'halcyon-lpg',
    name: 'Halcyon Gas',
    category: 'LPG',
    region: 'All India',
    note: 'Refill, with a subsidy transfer where one applies.',
    hue: 32,
  },
];

export function billersIn(category: BillCategory): Biller[] {
  return BILLERS.filter((biller) => biller.category === category);
}

export function findBiller(id: string | null | undefined): Biller | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return BILLERS.find((biller) => biller.id === wanted);
}

/** The tile a category lives under, and where its page is. */
export interface CategoryMeta {
  id: BillCategory;
  label: string;
  href: string;
  /** The one thing this page does that no other page here does. */
  distinctive: string;
}

export const CATEGORY_META: Record<BillCategory, CategoryMeta> = {
  ELECTRICITY: {
    id: 'ELECTRICITY',
    label: 'Electricity',
    href: '/pay/bills/electricity',
    distinctive: 'Which slab each unit fell in, and what the next one would cost.',
  },
  WATER: {
    id: 'WATER',
    label: 'Water Bill',
    href: '/pay/bills/water',
    distinctive: 'Litres a day per person, and the cess that rides on the water charge.',
  },
  PIPED_GAS: {
    id: 'PIPED_GAS',
    label: 'Piped Gas',
    href: '/pay/bills/piped-gas',
    distinctive: 'A bi-monthly reading, priced against the cylinder it replaces.',
  },
  POSTPAID: {
    id: 'POSTPAID',
    label: 'Mobile Postpaid',
    href: '/pay/bills/postpaid',
    distinctive: 'An itemised bill, and the plan that would have been cheaper.',
  },
  LANDLINE: {
    id: 'LANDLINE',
    label: 'Landline',
    href: '/pay/bills/landline',
    distinctive: 'Calls metered by type, against the free allowance.',
  },
  BROADBAND: {
    id: 'BROADBAND',
    label: 'Broadband',
    href: '/pay/bills/broadband',
    distinctive: 'Data used against the fair-use limit, and what a tier up would cost.',
  },
  CABLE: {
    id: 'CABLE',
    label: 'Cable TV',
    href: '/pay/bills/cable',
    distinctive: 'A pack builder that shows the capacity fee stepping as you add channels.',
  },
  CREDIT_CARD: {
    id: 'CREDIT_CARD',
    label: 'Credit Card Bill',
    href: '/pay/bills/credit-card',
    distinctive: 'What paying only the minimum actually costs, in months and in rupees.',
  },
  LOAN: {
    id: 'LOAN',
    label: 'Loan Repayment',
    href: '/pay/bills/loan',
    distinctive: 'The principal and interest split, and what a prepayment would save.',
  },
  MUNICIPAL_TAX: {
    id: 'MUNICIPAL_TAX',
    label: 'Municipal Tax',
    href: '/pay/bills/municipal-tax',
    distinctive: 'The rebate for paying early and the penalty for paying late.',
  },
  EDUCATION: {
    id: 'EDUCATION',
    label: 'Education Fees',
    href: '/pay/bills/education',
    distinctive: 'Term by term, with the late fee accruing per day.',
  },
  INSURANCE_PREMIUM: {
    id: 'INSURANCE_PREMIUM',
    label: 'Insurance Premium',
    href: '/pay/bills/insurance',
    distinctive: 'Reads the policies you actually hold here, and renews one.',
  },
  LPG: {
    id: 'LPG',
    label: 'LPG',
    href: '/pay/bills/lpg',
    distinctive: 'A refill booking with a delivery slot, not a bill.',
  },
  // Lives under Recharges rather than Bill Payments -- a DTH account is prepaid,
  // so there is nothing owed, only a balance running down.
  DTH: {
    id: 'DTH',
    label: 'DTH Recharge',
    href: '/pay/recharge/dth',
    distinctive: 'A pack builder priced against a balance, with a term discount.',
  },
};

/** The categories the Bill Payments hub lists. DTH is a recharge, not a bill. */
export const BILL_TILE_CATEGORIES = BILL_CATEGORIES.filter(
  (category) => category !== 'DTH',
) as ReadonlyArray<Exclude<BillCategory, 'DTH'>>;
