/**
 * Destinations, and the localities inside them.
 *
 * The cities, their states and their neighbourhoods are real places -- Candolim
 * and Calangute are in Bardez, Koregaon Park is in Pune -- the same category of
 * public geography the delivery estimator and the train search already use.
 *
 * The hotels generated into them are not. Every property name, tariff and
 * review in this feature is this store's own.
 */

export type DestinationKind = 'BEACH' | 'METRO' | 'HILL' | 'ISLAND';

export interface HotelCity {
  /** URL id, lowercase kebab. */
  id: string;
  /** "Goa", "Bangalore" -- what the search box shows. */
  name: string;
  /** State or emirate; absent for a country-sized destination. */
  region?: string;
  country: string;
  kind: DestinationKind;
  /**
   * Roughly what a night costs here relative to a mid-range Indian city.
   * Drives the tariffs, so Maldives is not priced like Pune.
   */
  priceIndex: number;
  /** Real neighbourhoods, used as the locality line on a hotel card. */
  localities: readonly string[];
}

export const HOTEL_CITIES: readonly HotelCity[] = [
  {
    id: 'goa',
    name: 'Goa',
    country: 'India',
    kind: 'BEACH',
    priceIndex: 1.15,
    localities: [
      'Panjim',
      'Candolim',
      'Calangute',
      'Baga',
      'Anjuna',
      'Vagator',
      'Sinquerim',
      'Arpora',
      'Mandrem',
      'Morjim',
      'Colva',
      'Benaulim',
      'Majorda',
      'Palolem',
      'Agonda',
      'Bardez',
    ],
  },
  {
    id: 'bangalore',
    name: 'Bangalore',
    region: 'Karnataka',
    country: 'India',
    kind: 'METRO',
    priceIndex: 1.0,
    localities: [
      'Indiranagar',
      'Koramangala',
      'Whitefield',
      'MG Road',
      'Jayanagar',
      'Electronic City',
      'Hebbal',
      'Rajajinagar',
      'HSR Layout',
      'Yeshwanthpur',
    ],
  },
  {
    id: 'delhi',
    name: 'Delhi',
    country: 'India',
    kind: 'METRO',
    priceIndex: 1.05,
    localities: [
      'Connaught Place',
      'Karol Bagh',
      'Paharganj',
      'Aerocity',
      'Saket',
      'Dwarka',
      'Hauz Khas',
      'Mahipalpur',
      'Rajouri Garden',
      'Chanakyapuri',
    ],
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    region: 'Maharashtra',
    country: 'India',
    kind: 'METRO',
    priceIndex: 1.35,
    localities: [
      'Andheri East',
      'Bandra West',
      'Colaba',
      'Juhu',
      'Powai',
      'Lower Parel',
      'Vile Parle',
      'Navi Mumbai',
      'Worli',
      'Santacruz',
    ],
  },
  {
    id: 'pune',
    name: 'Pune',
    region: 'Maharashtra',
    country: 'India',
    kind: 'METRO',
    priceIndex: 0.9,
    localities: [
      'Koregaon Park',
      'Hinjewadi',
      'Viman Nagar',
      'Kalyani Nagar',
      'Baner',
      'Shivajinagar',
      'Kharadi',
      'Camp',
      'Aundh',
      'Magarpatta',
    ],
  },
  {
    id: 'chennai',
    name: 'Chennai',
    region: 'Tamil Nadu',
    country: 'India',
    kind: 'METRO',
    priceIndex: 0.95,
    localities: [
      'T Nagar',
      'Anna Salai',
      'Nungambakkam',
      'Egmore',
      'Guindy',
      'ECR',
      'Adyar',
      'Velachery',
      'Mylapore',
      'Porur',
    ],
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    region: 'Telangana',
    country: 'India',
    kind: 'METRO',
    priceIndex: 0.92,
    localities: [
      'Banjara Hills',
      'Jubilee Hills',
      'Gachibowli',
      'HITEC City',
      'Begumpet',
      'Secunderabad',
      'Madhapur',
      'Abids',
      'Kondapur',
      'Somajiguda',
    ],
  },
  {
    id: 'rishikesh',
    name: 'Rishikesh',
    region: 'Uttarakhand',
    country: 'India',
    kind: 'HILL',
    priceIndex: 0.78,
    localities: [
      'Tapovan',
      'Laxman Jhula',
      'Ram Jhula',
      'Swarg Ashram',
      'Shivpuri',
      'Muni Ki Reti',
      'Neelkanth Road',
      'Badrinath Road',
    ],
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    region: 'Rajasthan',
    country: 'India',
    kind: 'METRO',
    priceIndex: 0.85,
    localities: [
      'Bani Park',
      'C Scheme',
      'Malviya Nagar',
      'Amer Road',
      'Vaishali Nagar',
      'Civil Lines',
      'Tonk Road',
      'Jagatpura',
    ],
  },
  {
    id: 'udaipur',
    name: 'Udaipur',
    region: 'Rajasthan',
    country: 'India',
    kind: 'HILL',
    priceIndex: 1.0,
    localities: [
      'Lake Pichola',
      'Fateh Sagar',
      'Gangaur Ghat',
      'Hiran Magri',
      'Ambamata',
      'City Palace Road',
      'Rani Road',
    ],
  },
  {
    id: 'munnar',
    name: 'Munnar',
    region: 'Kerala',
    country: 'India',
    kind: 'HILL',
    priceIndex: 0.82,
    localities: [
      'Chithirapuram',
      'Pallivasal',
      'Devikulam',
      'Anachal',
      'Mattupetty',
      'Chinnakanal',
      'Bison Valley',
    ],
  },
  {
    id: 'manali',
    name: 'Manali',
    region: 'Himachal Pradesh',
    country: 'India',
    kind: 'HILL',
    priceIndex: 0.8,
    localities: [
      'Old Manali',
      'Mall Road',
      'Vashisht',
      'Hadimba Road',
      'Naggar',
      'Prini',
      'Log Huts Area',
    ],
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'United Arab Emirates',
    kind: 'METRO',
    priceIndex: 2.4,
    localities: [
      'Downtown Dubai',
      'Deira',
      'Bur Dubai',
      'Jumeirah Beach Residence',
      'Al Barsha',
      'Dubai Marina',
      'Business Bay',
      'Palm Jumeirah',
    ],
  },
  {
    id: 'bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    kind: 'METRO',
    priceIndex: 1.1,
    localities: [
      'Sukhumvit',
      'Silom',
      'Pratunam',
      'Riverside',
      'Khao San',
      'Siam',
      'Sathorn',
      'Ratchada',
    ],
  },
  {
    id: 'maldives',
    name: 'Maldives',
    country: 'Maldives',
    kind: 'ISLAND',
    priceIndex: 4.2,
    localities: [
      'North Malé Atoll',
      'South Malé Atoll',
      'Baa Atoll',
      'Ari Atoll',
      'Hulhumalé',
      'Maafushi',
      'Lhaviyani Atoll',
    ],
  },
  {
    id: 'phuket',
    name: 'Phuket',
    country: 'Thailand',
    kind: 'BEACH',
    priceIndex: 1.25,
    localities: [
      'Patong',
      'Karon',
      'Kata',
      'Kamala',
      'Bang Tao',
      'Rawai',
      'Phuket Town',
      'Nai Harn',
    ],
  },
];

/** The reference's "Popular Cities" list, in its order. */
export const POPULAR_CITIES: readonly HotelCity[] = [
  'goa',
  'bangalore',
  'delhi',
  'mumbai',
  'pune',
  'chennai',
  'hyderabad',
  'rishikesh',
  'dubai',
  'bangkok',
  'maldives',
  'phuket',
]
  .map((id) => HOTEL_CITIES.find((city) => city.id === id))
  .filter((city): city is HotelCity => city !== undefined);

export function findCity(id: string | null | undefined): HotelCity | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return HOTEL_CITIES.find((city) => city.id === wanted);
}

/** "Goa, India"; "Bangalore, Karnataka, India". */
export function cityLabel(city: HotelCity): string {
  return [city.name, city.region, city.country].filter(Boolean).join(', ');
}

/**
 * Free-text destination search.
 *
 * Matches the city, its region, its country and its localities, because
 * "Calangute" and "Karnataka" are both things a traveller types into a box that
 * says "City, area or hotel name".
 */
export function searchCities(term: string): HotelCity[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [...POPULAR_CITIES];

  const matches = HOTEL_CITIES.filter(
    (city) =>
      city.name.toLowerCase().includes(needle) ||
      (city.region ?? '').toLowerCase().includes(needle) ||
      city.country.toLowerCase().includes(needle) ||
      city.localities.some((locality) => locality.toLowerCase().includes(needle)),
  );

  return matches.sort((a, b) => {
    const starts =
      Number(b.name.toLowerCase().startsWith(needle)) -
      Number(a.name.toLowerCase().startsWith(needle));
    if (starts !== 0) return starts;
    return a.name.localeCompare(b.name);
  });
}

/** Which locality inside a destination a search term points at, if any. */
export function matchLocality(city: HotelCity, term: string): string | undefined {
  const needle = term.trim().toLowerCase();
  if (!needle) return undefined;
  return city.localities.find((locality) => locality.toLowerCase().includes(needle));
}
