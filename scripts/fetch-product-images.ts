/**
 * Fetches real product photography from Openverse for every subcategory.
 *
 * Openverse (openverse.org) indexes Creative-Commons and public-domain images
 * from Flickr, Wikimedia, museums and other sources, and exposes an API that
 * needs no key. It is used here rather than a general web image search because
 * every result carries an explicit reuse licence -- images from a search
 * engine are copyrighted by default, and putting those on a storefront that
 * takes addresses and runs a checkout is exactly the use a licence governs.
 *
 * Scraping amazon.in itself was considered and rejected: its product
 * photography is owned by Amazon or the listing brand, and reproducing it in
 * another storefront's catalogue is not a licence question at all -- there is
 * no licence. See `scripts/generate-product-art.ts` for the local-artwork
 * fallback this script's output sits alongside.
 *
 * **Granularity.** One bucket per product *type* (~200), not per product and
 * not per subcategory. The catalogue's product names are invented ("Auravox
 * Pulse ANC Wireless Headphones") so searching for them finds nothing, but
 * the `types` vocabulary in `catalog-templates.ts` ("ANC Wireless
 * Headphones", "Trail Camera", "Cast Iron Skillet") is real product language
 * and searches well. Bucketing per subcategory was the first attempt and it
 * is what made results feel wrong -- a mirrorless camera, a trail camera and
 * a tripod all showed the same photo.
 *
 * **Relevance guard.** A result is kept only if *every* significant word
 * (>=4 letters, not a stopword) of the search term appears in its title, and
 * shorter titles win. Both rules come from looking at output rather than
 * guessing: matching any single word let "glass cleaner" pull in a school's
 * "Hour Glass Cleaners" award photo, and narrated titles ("If you were ground
 * coffee, you'd be espresso...") are life snapshots, while someone
 * photographing a product names the file after the product.
 *
 * **Licence handling.**
 *  - CC0 and public-domain files are preferred: no attribution burden.
 *  - CC BY / CC BY-SA are accepted as a fallback and recorded in
 *    `public/products/ATTRIBUTION.md` plus the manifest, because those
 *    licences *require* credit. The storefront surfaces it at `/image-credits`.
 *  - `license_type=commercial` excludes NonCommercial outright; NoDerivatives
 *    is excluded separately because this script re-crops every image.
 *
 * **Never fabricates coverage.** A type that finds nothing usable is left out
 * of the manifest; products of that type fall back to their generated SVG
 * artwork. No product ever silently ends up with a broken path.
 *
 * Run: pnpm products:fetch-images          (skips types already fetched)
 *      pnpm products:fetch-images --force  (re-fetches everything)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { SUBCATEGORY_TEMPLATES, type SubcategoryTemplate } from '../src/data/catalog-templates';

const OUT_DIR = join(process.cwd(), 'public', 'products');
const MANIFEST_PATH = join(process.cwd(), 'src', 'data', 'product-image-manifest.json');
const API = 'https://api.openverse.org/v1/images/';
const USER_AGENT = 'amazonNext-dev/1.0 (local learning project)';

const IMAGES_PER_BUCKET = 3;
const TILE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const CONCURRENCY = 5;

const STOPWORDS = new Set([
  'with',
  'from',
  'this',
  'that',
  'your',
  'their',
  'into',
  'over',
  'under',
  'wireless',
  'smart',
  'compact',
  'portable',
  'premium',
  'pro',
  'plus',
  'ultra',
  'lite',
  'mini',
  'edition',
  'series',
  'system',
  'digital',
]);

function significantWords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
    ),
  );
}

/**
 * Better search terms for vocabulary that is too generic to search with.
 *
 * Keys are either `category/subcategory/type` (applied to that one product
 * type) or `category/subcategory` (a fallback for every type under it).
 * "Party Game" returns Batman clip-art, "Paperback" returns a photo of bare
 * trees, and "Road Building Set" returns an actual road under construction --
 * the words are right but they are not what a shopper means. Anything not
 * listed here searches fine on its own vocabulary and is left alone.
 */
const QUERY_OVERRIDES: Record<string, string[]> = {
  // Marketing compounds with no photographic equivalent -- each of these
  // returned nothing at all until it was given the plain noun instead.
  'electronics/headphones/Open-Ear Sport Earbuds': ['sport earphones', 'earphones'],
  'electronics/wearables/Fitness Smartwatch': ['smartwatch', 'fitness tracker'],
  'electronics/wearables/Health Band': ['fitness tracker', 'wristband'],
  'electronics/wearables/Hybrid Analogue Watch': ['wrist watch', 'analog watch'],
  'computers/laptops/Creator Laptop': ['laptop computer'],
  'computers/laptops/Everyday Laptop': ['laptop'],
  'computers/storage/Portable SSD': ['solid state drive', 'external drive'],
  'mobiles/tablets/Reading Tablet': ['ebook reader', 'tablet computer'],
  'mobiles/phone-accessories/Screen Protector': [
    'tempered glass protector',
    'phone screen protector',
  ],
  'mobiles/phone-accessories/Cable Pack': ['usb charging cable', 'usb type-c cable'],
  'fashion/mens-clothing/Merino Crew Jumper': ['wool sweater', 'knitted jumper'],
  'fashion/womens-clothing/Cotton Kurta': ['kurta', 'indian tunic'],
  'fashion/watches/Analogue Watch': ['wrist watch', 'watch face'],
  'kitchen/cookware/Stainless Steel Pan Set': ['stainless steel pan', 'saucepan'],
  'beauty/skincare/Ceramide Moisturiser': ['moisturizer', 'face cream'],
  'beauty/skincare/Gentle Cleanser': ['facial cleanser', 'face wash'],
  'grocery/pantry/Atta Flour': ['wheat flour', 'flour'],
  // Produce: the plain noun beats the marketing name every time, and several
  // of these ("Green Peas", "Capsicum") return nothing at all without it.
  'grocery/fruits-vegetables/Tomatoes': ['fresh tomatoes', 'tomato'],
  'grocery/fruits-vegetables/Onions': ['onions', 'red onion'],
  'grocery/fruits-vegetables/Potatoes': ['potatoes', 'potato'],
  'grocery/fruits-vegetables/Carrots': ['carrots', 'carrot'],
  'grocery/fruits-vegetables/Spinach Leaves': ['spinach leaves', 'raw spinach'],
  'grocery/fruits-vegetables/Cauliflower': ['cauliflower', 'cauliflower head'],
  'grocery/fruits-vegetables/Green Peas': ['fresh green peas', 'pea pods green'],
  'grocery/fruits-vegetables/Cucumber': ['cucumber', 'fresh cucumber'],
  'grocery/fruits-vegetables/Capsicum': ['bell pepper', 'sweet pepper'],
  'grocery/fruits-vegetables/Bananas': ['bananas', 'banana bunch'],
  'grocery/fruits-vegetables/Apples': ['apples', 'red apple'],
  'grocery/fruits-vegetables/Oranges': ['oranges', 'orange fruit'],
  'grocery/fruits-vegetables/Grapes': ['grapes', 'grape bunch'],
  'grocery/fruits-vegetables/Pomegranate': ['pomegranate', 'pomegranate seeds'],
  'grocery/fruits-vegetables/Mangoes': ['mangoes', 'mango fruit'],
  'grocery/fruits-vegetables/Lemons': ['lemons', 'lemon fruit'],
  'grocery/fruits-vegetables/Strawberries': ['strawberries', 'strawberry fruit'],
  'grocery/fruits-vegetables/Kiwi': ['kiwi fruit', 'kiwifruit'],
  'grocery/meat-seafood/Chicken Breast': ['chicken breast raw', 'raw chicken'],
  'grocery/meat-seafood/Chicken Curry Cut': ['raw chicken pieces', 'chicken meat'],
  'grocery/meat-seafood/Boneless Chicken': ['chicken fillet raw', 'raw chicken'],
  'grocery/meat-seafood/Mutton Curry Cut': ['lamb chops', 'raw lamb meat'],
  'grocery/meat-seafood/Prawns': ['raw prawns', 'shrimp raw'],
  'grocery/meat-seafood/Fish Fillet': ['fish fillet raw', 'raw fish'],
  'grocery/meat-seafood/Seekh Kebab': ['kebab skewers', 'minced meat kebab'],
  'grocery/meat-seafood/Cold Cuts': ['sliced salami', 'cold cuts platter'],
  'automotive/car-electronics/Tyre Inflator': ['air compressor', 'tire pump'],
  // Without these, every car-care type fell through to the subcategory's
  // "glass cleaner" fallback and five different products showed one bottle.
  'automotive/car-care/Ceramic Spray Sealant': ['spray bottle', 'car wax'],
  'automotive/car-care/Wheel Cleaner': ['alloy wheel', 'car wheel'],
  'automotive/car-care/Microfibre Cloth Set': ['microfiber cloth', 'cleaning cloth'],
  'kitchen/dining/Insulated Flask': ['thermos flask', 'vacuum flask'],
  'sports/outdoor/Insulated Bottle': ['water bottle', 'drink bottle'],
  'kitchen/dining/Serving Bowls': ['serving bowl', 'ceramic bowl'],

  // Second audit pass: each of these was looked at as a rendered image and
  // replaced because it showed the wrong thing -- "Conditioner" returned an
  // air-conditioning unit, "Hair Mask" a carved wooden mask, "Bookshelf" a
  // library aisle with a shopper in it.
  'beauty/haircare/Shampoo': ['shampoo bottle'],
  'beauty/haircare/Conditioner': ['hair conditioner bottle', 'conditioner bottle'],
  'beauty/haircare/Hair Oil': ['argan oil bottle', 'hair oil bottle'],
  'beauty/haircare/Hair Mask': ['hair treatment jar', 'hair mask jar'],
  // A serum comes in a dropper bottle. 'serum bottle' on its own returned
  // 1960s medical blood-serum vials, and the skincare catalogue's nearest
  // product is a lotion pump -- neither is what the label says.
  'beauty/skincare/Vitamin C Serum': ['vitamin c serum', 'face serum'],
  'beauty/haircare/Leave-In Serum': ['hair serum'],
  'books/non-fiction/(Annotated Edition)': ['hardcover book', 'book pages'],
  'computers/monitors/IPS Monitor': ['lcd monitor', 'computer screen'],
  'computers/monitors/Creator Monitor': ['lcd monitor', 'flat screen monitor'],
  'computers/monitors/Portable Monitor': ['lcd monitor', 'flat screen'],
  'computers/peripherals/Desk Microphone': ['studio microphone', 'condenser microphone'],
  'computers/peripherals/USB-C Dock': ['usb hub', 'docking station'],
  'computers/storage/External Hard Drive': ['hard disk drive', 'external hard disk'],
  'electronics/speakers/Bookshelf Speaker Pair': ['hifi speaker', 'speaker pair'],
  'fashion/mens-clothing/Chino Trousers': ['chino pant', 'chino trousers'],
  'fashion/womens-clothing/Linen Shirt': ['linen blouse', 'folded blouse'],
  'grocery/pantry/Whole Spices': ['spice jars', 'spices bowls'],
  'grocery/snacks/Millet Crackers': ['crispbread', 'cracker biscuits'],
  'home/decor/Throw Blanket': ['folded blanket', 'wool blanket'],
  'home/decor/Wall Mirror': ['round wall mirror', 'mirror frame'],
  'home/furniture/Solid Wood Desk': ['wooden desk', 'writing desk'],
  'home/lighting/LED Strip Kit': ['led lights', 'light strip'],
  'kitchen/appliances/Filter Coffee Maker': ['coffee machine', 'drip coffee maker'],
  'sports/cycling/Bike Lock': ['bicycle lock'],
  'sports/cycling/Pannier Bag': ['bicycle pannier'],
  'toys/board-games/Party Game': ['board game box'],
  'toys/board-games/Two-Player Game': ['chess set', 'backgammon board'],
  'toys/building-sets/Magnetic Tile Set': ['magnetic tiles toy'],
  'toys/learning-toys/Puzzle Set': ['jigsaw puzzle pieces'],
  'toys/learning-toys/Story Cards': ['flash cards'],
  'automotive/car-electronics/Bluetooth Receiver': ['bluetooth adapter'],
  'automotive/car-electronics/Parking Sensor Kit': ['parking sensor'],
  'automotive/car-tools/Socket Set': ['socket wrench set'],
  'automotive/car-tools/Torque Wrench': ['torque wrench tool'],

  // Third audit pass. Every image in the store was rendered and looked at;
  // these types were showing a person rather than the product, so each got a
  // term that describes the object on its own.
  'automotive/car-tools/Emergency Kit': ['first aid box', 'emergency kit bag'],
  'automotive/car-electronics/Dash Camera': ['dashcam device', 'dash cam recorder'],
  'automotive/car-electronics/Jump Starter': ['jump leads', 'battery booster pack'],
  'automotive/car-care/Glass Cleaner': ['spray cleaner bottle', 'window cleaner bottle'],
  'automotive/car-care/pH-Neutral Shampoo': ['car shampoo bottle', 'wash bucket'],
  'automotive/car-care/Interior Detailer': ['car dashboard', 'interior trim'],
  'beauty/fragrance/Room Diffuser': ['reed diffuser sticks', 'diffuser bottle'],
  'beauty/haircare/Scalp Treatment': ['hair tonic bottle', 'scalp serum bottle'],
  'books/fiction/(Illustrated Edition)': ['illustrated book', 'picture book'],
  'electronics/cameras/Instant Camera': ['polaroid camera'],
  'electronics/cameras/Vlogging Camera': ['camcorder'],
  'electronics/cameras/Mirrorless Camera': ['mirrorless camera'],
  'electronics/speakers/Portable Party Speaker': ['stage loudspeaker', 'speaker cabinet'],
  'fashion/footwear/Loafers': ['loafer shoes', 'leather moccasin'],
  // Apparel is the one place a model shot is right: a garment photographed
  // flat is not what a shopper wants to see, and Openverse has no clean
  // studio trousers shot anyway.
  'fashion/womens-clothing/Wide-Leg Trousers': ['wide leg trousers', 'trousers'],
  'grocery/beverages/Herbal Infusion': ['herbal tea leaves', 'tea infusion cup'],
  'grocery/snacks/Dried Fruit Mix': ['dried apricots', 'dried fruit bowl'],
  'grocery/snacks/Fruit and Nut Bars': ['granola bar', 'cereal bar'],
  'home/furniture/Bookshelf': ['bookcase furniture', 'wooden bookcase'],
  'sports/cycling/Bike Light Set': ['bicycle light', 'bike lamp'],
  'sports/fitness/Kettlebell': ['kettlebell weight'],
  'sports/fitness/Resistance Band Set': ['exercise resistance tube', 'resistance bands'],
  'sports/fitness/Skipping Rope': ['skipping rope'],
  'sports/outdoor/Camping Stove': ['camping stove burner', 'gas stove portable'],
  'sports/outdoor/Sleeping Bag': ['rolled sleeping bag', 'sleeping bag gear'],
  'sports/outdoor/Trekking Poles': ['hiking poles', 'walking poles'],
  'toys/board-games/Co-operative Card Game': ['playing cards deck', 'card deck'],
  'toys/board-games/Strategy Board Game': ['chess board', 'board game pieces'],
  'toys/building-sets/Marble Run': ['wooden marble track'],
  'toys/learning-toys/Counting Frame': ['wooden abacus'],
  'toys/learning-toys/Science Kit': ['chemistry set', 'microscope kit'],
  'toys/learning-toys/Shape Sorter': ['wooden shape sorter', 'shape sorter toy'],

  'electronics/speakers': ['loudspeaker', 'bluetooth speaker'],
  'electronics/cameras': ['digital camera', 'camera tripod', 'dslr camera'],
  'mobiles/smartphones': ['android smartphone', 'mobile phone'],
  'kitchen/appliances': ['toaster', 'microwave oven', 'electric kettle'],
  'kitchen/dining': ['drinking glasses', 'ceramic dinnerware', 'cutlery set'],
  'books/fiction': ['stack of books', 'book cover'],
  'books/non-fiction': ['books on shelf', 'open book pages'],
  'books/technology-books': ['programming book', 'computer book'],
  'beauty/skincare': ['cosmetic cream jar', 'lotion bottle', 'cosmetics bottle'],
  // 'hair comb' used to sit in this fallback list and leaked combs into the
  // serum and treatment types, which are bottles.
  'beauty/haircare': ['hair conditioner', 'shampoo bottle'],
  'beauty/fragrance': ['perfume bottle', 'fragrance bottle'],
  'toys/building-sets': ['lego bricks', 'building blocks toy'],
  'toys/board-games': ['chess pieces', 'playing cards', 'board game'],
  'toys/learning-toys': ['wooden toy blocks', 'jigsaw puzzle'],
  'automotive/car-care': ['glass cleaner', 'car cleaning sponge', 'microfibre cloth'],
  'sports/cycling': ['bicycle helmet', 'bicycle pump'],
};

interface Bucket {
  key: string; // "<category>/<subcategory>/<type>"
  fileSlug: string;
  queries: string[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * One bucket per *product type*, not per subcategory.
 *
 * Fetching per subcategory was the first attempt and it is what made the
 * results feel wrong: a mirrorless camera, a trail camera and a tripod all
 * live under `electronics/cameras`, so they all showed the same photo. The
 * type ("Mirrorless Camera", "Trail Camera", "Camera Tripod") is the most
 * specific real-world noun the catalogue holds, and it is what a shopper
 * would actually search for, so it is the right unit to search on.
 */
function buildBuckets(templates: SubcategoryTemplate[]): Bucket[] {
  return templates.flatMap((template) => {
    const subcategoryKey = `${template.category}/${template.subcategory}`;

    return template.types.map((type) => {
      const key = `${subcategoryKey}/${type}`;
      // Most specific first: a hand-written override for this exact type, the
      // type itself, its last two words, then the subcategory's own fallbacks.
      const queries = Array.from(
        new Set([
          ...(QUERY_OVERRIDES[key] ?? []),
          type,
          type.split(/\s+/).slice(-2).join(' '),
          ...(QUERY_OVERRIDES[subcategoryKey] ?? []),
        ]),
      );

      return {
        key,
        fileSlug: slugify(`${template.category}-${template.subcategory}-${type}`),
        queries,
      };
    });
  });
}

/**
 * Product types served by DummyJSON's catalogue instead of Openverse.
 *
 * Openverse indexes Creative Commons *photography* -- overwhelmingly Flickr
 * snapshots. It has no studio product shots, so "Vitamin C Serum" returned a
 * woman's face and "Hair Mask" returned a carved wooden mask. DummyJSON is a
 * public demo-data API for exactly this job: its images are catalogue shots of
 * the object on a clean background, which is what a storefront card needs.
 *
 * Values are DummyJSON product titles, matched exactly. Each type gets its own
 * product wherever the catalogue has one, so two unrelated products never
 * share a photo. Types absent from this map fall through to Openverse, and the
 * run reports which ones did.
 */
const CATALOGUE_PHOTOS: Record<string, string[]> = {
  'electronics/headphones/ANC Wireless Headphones': ['Apple AirPods Max Silver'],
  'electronics/headphones/True Wireless Earbuds': ['Apple Airpods'],
  'electronics/headphones/Open-Ear Sport Earbuds': ['Beats Flex Wireless Earphones'],
  'electronics/speakers/Smart Home Speaker': ['Apple HomePod Mini Cosmic Grey'],
  'electronics/speakers/Bluetooth Speaker': ['Amazon Echo Plus'],
  'electronics/wearables/Fitness Smartwatch': ['Apple Watch Series 4 Gold'],
  'electronics/wearables/Hybrid Analogue Watch': ['Brown Leather Belt Watch'],

  'computers/laptops/Ultrabook': ['Apple MacBook Pro 14 Inch Space Grey'],
  'computers/laptops/Creator Laptop': ['Asus Zenbook Pro Dual Screen Laptop'],
  'computers/laptops/Gaming Laptop': ['Huawei Matebook X Pro'],
  'computers/laptops/Everyday Laptop': ['Lenovo Yoga 920'],

  // One distinct handset per type. The demo catalogue has sixteen phone
  // photographs and the store was using four of them, so a page of twenty-five
  // phones showed the same picture five times over -- which is the difference
  // between a catalogue and a placeholder, whatever the copy says.
  'mobiles/smartphones/Smartphone': ['iPhone 13 Pro'],
  'mobiles/smartphones/Camera Smartphone': ['Samsung Galaxy S10'],
  'mobiles/smartphones/Compact Smartphone': ['iPhone 5s'],
  'mobiles/smartphones/Rugged Smartphone': ['Realme C35'],
  'mobiles/smartphones/Gaming Smartphone': ['Vivo X21'],
  'mobiles/smartphones/Foldable Smartphone': ['Samsung Galaxy S8'],
  'mobiles/smartphones/Battery Smartphone': ['Realme XT'],
  'mobiles/smartphones/Budget Smartphone': ['Oppo A57'],
  'mobiles/smartphones/Flagship Smartphone': ['iPhone X'],
  'mobiles/smartphones/Dual SIM Smartphone': ['Oppo F19 Pro Plus'],
  'mobiles/smartphones/Selfie Smartphone': ['Vivo V9'],
  'mobiles/smartphones/Business Smartphone': ['Samsung Galaxy S7'],

  'mobiles/tablets/Tablet': ['iPad Mini 2021 Starlight'],
  'mobiles/tablets/Drawing Tablet': ['Samsung Galaxy Tab S8 Plus Grey'],
  'mobiles/tablets/Reading Tablet': ['Samsung Galaxy Tab White'],

  'mobiles/phone-accessories/Power Bank': ['Apple MagSafe Battery Pack'],
  'mobiles/phone-accessories/Fast Charger': ['Apple iPhone Charger'],
  'mobiles/phone-accessories/Phone Case': ['iPhone 12 Silicone Case with MagSafe Plum'],
  'mobiles/phone-accessories/Wireless Charger': ['Apple Airpower Wireless Charger'],
  'mobiles/phone-accessories/Wireless Earbuds': ['Apple Airpods'],
  'mobiles/phone-accessories/Over-Ear Headphones': ['Apple AirPods Max Silver'],
  'mobiles/phone-accessories/Selfie Stick': ['Selfie Stick Monopod'],
  'mobiles/phone-accessories/Smart Watch': ['Apple Watch Series 4 Gold'],
  'mobiles/phone-accessories/Sport Earphones': ['Beats Flex Wireless Earphones'],

  'fashion/mens-clothing/Oxford Shirt': ['Man Short Sleeve Shirt'],
  'fashion/mens-clothing/Linen Shirt': ['Man Plaid Shirt'],
  'fashion/mens-clothing/Polo Shirt': ['Gigabyte Aorus Men Tshirt'],
  'fashion/mens-clothing/Quilted Jacket': ['Blue & Black Check Shirt'],
  'fashion/womens-clothing/Wrap Dress': ["Black Women's Gown"],
  'fashion/womens-clothing/Cotton Kurta': ['Gray Dress'],
  'fashion/womens-clothing/Pleated Skirt': ['Corset With Black Skirt'],
  'fashion/womens-clothing/Knit Cardigan': ['Blue Frock'],
  'fashion/footwear/Running Shoes': ['Sports Sneakers Off White & Red'],
  'fashion/footwear/Canvas Sneakers': ['Puma Future Rider Trainers'],
  'fashion/footwear/Sandals': ['Black & Brown Slipper'],
  'fashion/footwear/Leather Derby Shoes': ['Nike Air Jordan 1 Red And Black'],
  'fashion/watches/Analogue Watch': ['Rolex Cellini Date Black Dial'],
  'fashion/watches/Automatic Watch': ['IWC Ingenieur Automatic Steel'],
  'fashion/watches/Chronograph Watch': ['Longines Master Collection'],
  'fashion/watches/Dress Watch': ['Rolex Datejust Women'],

  'home/furniture/Fabric Sofa': ['Annibale Colombo Sofa'],
  'home/furniture/Bed Frame': ['Annibale Colombo Bed'],
  'home/furniture/Armchair': ['Knoll Saarinen Executive Conference Chair'],
  'home/decor/Framed Print': ['Family Tree Photo Frame'],
  'home/decor/Ceramic Vase': ['Plant Pot'],
  'home/lighting/Table Lamp': ['Table Lamp'],
  'home/furniture/Solid Wood Desk': ['Bedside Table African Cherry'],
  'home/decor/Wall Mirror': ['Wooden Bathroom Sink With Mirror'],

  'kitchen/appliances/Blender': ['Boxed Blender'],
  'kitchen/appliances/Stand Mixer': ['Hand Blender'],
  'kitchen/appliances/Induction Hob': ['Electric Stove'],
  'kitchen/cookware/Kadai': ['Carbon Steel Wok'],
  'kitchen/cookware/Non-Stick Frying Pan': ['Pan'],
  'kitchen/cookware/Stainless Steel Pan Set': ['Silver Pot With Glass Cap'],
  'kitchen/cookware/Chef Knife': ['Knife'],
  'kitchen/dining/Stoneware Dinner Set': ['Plate'],
  'kitchen/dining/Glass Tumblers': ['Glass'],
  'kitchen/dining/Cutlery Set': ['Fork'],
  'kitchen/dining/Serving Bowls': ['Tray'],
  'kitchen/dining/Insulated Flask': ['Black Aluminium Cup'],

  'beauty/skincare/Ceramide Moisturiser': ['Olay Ultra Moisture Shea Butter Body Wash'],
  'beauty/skincare/Gentle Cleanser': ['Attitude Super Leaves Hand Soap'],
  'beauty/fragrance/Eau de Parfum': ['Chanel Coco Noir Eau De'],
  'beauty/fragrance/Eau de Toilette': ["Dior J'adore"],
  'beauty/fragrance/Solid Perfume': ['Dolce Shine Eau de'],
  'beauty/fragrance/Body Mist': ['Calvin Klein CK One'],

  'grocery/beverages/Ground Coffee': ['Nescafe Coffee'],
  'grocery/pantry/Basmati Rice': ['Rice'],
  'grocery/pantry/Raw Honey': ['Honey Jar'],
  'grocery/pantry/Cold-Pressed Oil': ['Cooking Oil'],

  // Produce the demo catalogue photographs properly. Openverse has plenty of
  // pictures *of* these, but they are allotments, market stalls and lunch --
  // a shopper wants the thing on a plain background, and these are that.
  'grocery/fruits-vegetables/Apples': ['Apple'],
  'grocery/fruits-vegetables/Cucumber': ['Cucumber'],
  'grocery/fruits-vegetables/Capsicum': ['Green Bell Pepper'],
  'grocery/fruits-vegetables/Lemons': ['Lemon'],
  'grocery/fruits-vegetables/Potatoes': ['Potatoes'],
  'grocery/fruits-vegetables/Onions': ['Red Onions'],
  'grocery/fruits-vegetables/Strawberries': ['Strawberry'],
  'grocery/fruits-vegetables/Kiwi': ['Kiwi'],
};

/**
 * Images rejected by eye, keyed by their unique source page.
 *
 * The title guard cannot catch these: "Car interior", "kettlebell swings" and
 * "First Aid Kit" are accurate captions for photographs whose subject is a
 * person. A storefront card needs the product, so each one that turned up in a
 * visual audit is recorded here and can never be selected again. Keyed by
 * source URL rather than title because titles collide -- two different images
 * are both called "Glass cleaner", and only one of them is a person.
 */
const REJECTED_SOURCES = new Set([
  // Mobiles audit: car interiors and a heritage rail carriage for "Car Mount",
  // an ASUS netbook box and two bare phones for "Screen Protector", ethernet
  // patch leads for "Cable Pack", and a pile of feature phones for "Compact
  // Smartphone" -- all accurate captions, none of them the product.
  'https://commons.wikimedia.org/w/index.php?curid=54756250',
  'https://www.flickr.com/photos/30364433@N05/15247501745',
  'https://www.flickr.com/photos/30364433@N05/15060751559',
  'https://www.flickr.com/photos/15515307@N00/3255756196',
  'https://www.flickr.com/photos/7678586@N06/4537267007',
  'https://www.flickr.com/photos/7678586@N06/4537267417',
  'https://www.flickr.com/photos/26777097@N03/4835259477',
  'https://www.flickr.com/photos/14589121@N00/4557983583',
  'https://www.flickr.com/photos/49143119@N00/8101163452',
  'https://www.flickr.com/photos/185514373@N06/49061311448',
  // Fifth produce pass: a plated dish for "Spinach Leaves" and a bowl of
  // gazpacho for "Tomatoes".
  'https://commons.wikimedia.org/w/index.php?curid=883996',
  'https://www.flickr.com/photos/35022955@N06/5130968081',
  // Fourth produce pass: two plated dishes for "Spinach", and one more crowd
  // shot for "Ginger" -- the type word doubles as a name and a hair colour, so
  // the search fallback keeps finding people. Ginger settles for two photos.
  'https://www.flickr.com/photos/14507113@N04/8114509154',
  'https://www.flickr.com/photos/24062889@N00/24319484933',
  'https://www.flickr.com/photos/71865026@N00/3478499255',
  // Third produce pass: a spinach wrap and a farm stall for "Spinach", banana
  // plants for "Bananas", and two the title guard could never catch -- a crowd
  // shot called "Gingers have souls" and a woman captioned "Orange fruits for
  // nutrition".
  'https://www.flickr.com/photos/86537625@N00/2610751935',
  'https://www.flickr.com/photos/35899785@N00/15488282513',
  'https://www.flickr.com/photos/62295966@N07/42280544262',
  'https://www.flickr.com/photos/182613284@N02/48317587306',
  'https://www.flickr.com/photos/69135870@N00/6106754025',
  // Second produce pass: an afternoon-tea tray for "Cucumber", potato blight
  // leaves for "Potatoes", a market seller for "Pomegranate", fruit tea for
  // "Oranges", a hand holding lettuce and a bag of wilted leaves for "Spinach".
  'https://wordpress.org/photos/photo/12269689cd/',
  'https://www.flickr.com/photos/130460019@N02/35517503553',
  'https://www.flickr.com/photos/10559879@N00/2409917038',
  'https://www.flickr.com/photos/24532534@N02/4119271076',
  'https://www.flickr.com/photos/64607715@N05/9640700287',
  'https://www.flickr.com/photos/62295966@N07/11468311906',
  // Produce, from the fruits-and-vegetables audit: a sea cucumber for
  // "Cucumber", a sandwich and a chopping board for "Onions", palm trees for
  // "Oranges", a glass of ginger ale for "Ginger", a dog for "Spinach".
  'https://www.flickr.com/photos/68975104@N00/27978405',
  'https://www.flickr.com/photos/7927684@N03/6315153551',
  'https://www.flickr.com/photos/21001756@N06/3464841961',
  'https://www.flickr.com/photos/87718306@N00/2336528175',
  'https://www.flickr.com/photos/66493466@N00/4017403068',
  'https://wordpress.org/photos/photo/685694ddb4/',
  'https://www.flickr.com/photos/77887212@N00/519167956',
  'https://www.flickr.com/photos/10710442@N08/4390171260',
  'https://www.flickr.com/photos/16533831@N03/5444291110',
  'https://commons.wikimedia.org/w/index.php?curid=121548',
  'https://commons.wikimedia.org/w/index.php?curid=322674',
  'https://www.flickr.com/photos/56652293@N08/5360914655',
  'https://www.flickr.com/photos/37072378@N08/15519744506',
  'https://www.flickr.com/photos/23155134@N06/12347198403',
  'https://www.flickr.com/photos/138248475@N03/26646664436',
  'https://www.flickr.com/photos/75612671@N03/44159305774',
  'https://www.flickr.com/photos/7603557@N08/2394427285',
  'https://commons.wikimedia.org/w/index.php?curid=19953051',
  'https://commons.wikimedia.org/w/index.php?curid=157212',
  'https://www.flickr.com/photos/60417477@N00/4755783029',
  'https://commons.wikimedia.org/w/index.php?curid=2216580',
  'https://commons.wikimedia.org/w/index.php?curid=20134351',
  'https://www.flickr.com/photos/31664253@N04/5568578795',
  'https://commons.wikimedia.org/w/index.php?curid=12305279',
  'https://commons.wikimedia.org/w/index.php?curid=138118054',
  'https://commons.wikimedia.org/w/index.php?curid=140276375',
  'https://commons.wikimedia.org/w/index.php?curid=194185169',
  'https://commons.wikimedia.org/w/index.php?curid=21059',
  'https://www.flickr.com/photos/10069023@N00/16054954517',
  'https://www.flickr.com/photos/10515323@N08/34854047663',
  'https://www.flickr.com/photos/11597293@N00/7714985106',
  'https://www.flickr.com/photos/145078281@N04/31740445004',
  'https://www.flickr.com/photos/19663529@N00/219078806',
  'https://www.flickr.com/photos/197103350@N07/52579645561',
  'https://www.flickr.com/photos/20086101@N00/2824020842',
  'https://www.flickr.com/photos/22473198@N00/7113982853',
  'https://www.flickr.com/photos/22651740@N00/5988738110',
  'https://www.flickr.com/photos/22950176@N06/2895685127',
  'https://www.flickr.com/photos/23227178@N00/3794525961',
  'https://www.flickr.com/photos/23307937@N04/4410057028',
  'https://www.flickr.com/photos/23566085@N00/552547909',
  'https://www.flickr.com/photos/24256351@N04/5782200846',
  'https://www.flickr.com/photos/24736216@N07/7223735218',
  'https://www.flickr.com/photos/24854893@N00/3820641835',
  'https://www.flickr.com/photos/26445715@N00/25642738357',
  'https://www.flickr.com/photos/27365671@N00/3318473936',
  'https://www.flickr.com/photos/28922094@N03/13890157702',
  'https://www.flickr.com/photos/34553027@N03/4535831555',
  'https://www.flickr.com/photos/34756977@N00/430974643',
  'https://www.flickr.com/photos/36521958135@N01/46342592',
  'https://www.flickr.com/photos/37387065@N05/8442709074',
  'https://www.flickr.com/photos/37585279@N03/9547607230',
  'https://www.flickr.com/photos/38190880@N06/9094283077',
  'https://www.flickr.com/photos/41340252@N08/4889240519',
  'https://www.flickr.com/photos/42546226@N08/3964405100',
  'https://www.flickr.com/photos/43989966@N03/7894666920',
  'https://www.flickr.com/photos/46907600@N02/8279165588',
  'https://www.flickr.com/photos/48741368@N00/2518961429',
  'https://www.flickr.com/photos/49503214348@N01/137732656',
  'https://www.flickr.com/photos/50216714@N00/41885440372',
  'https://www.flickr.com/photos/50245168@N00/4055349159',
  'https://www.flickr.com/photos/50457550@N00/1202644571',
  'https://www.flickr.com/photos/50592584@N05/5880881581',
  'https://www.flickr.com/photos/50592584@N05/5881433392',
  'https://www.flickr.com/photos/50592584@N05/5881444390',
  'https://www.flickr.com/photos/51035566865@N01/275084788',
  'https://www.flickr.com/photos/51035619500@N01/3260857674',
  'https://www.flickr.com/photos/51796626@N03/8603633112',
  'https://www.flickr.com/photos/51986662@N05/5790549014',
  'https://www.flickr.com/photos/53326337@N00/4569760193',
  'https://www.flickr.com/photos/55768440@N00/4481795432',
  'https://www.flickr.com/photos/55768440@N00/6664534811',
  'https://www.flickr.com/photos/56755410@N00/2566700237',
  'https://www.flickr.com/photos/60944931@N00/4413568063',
  'https://www.flickr.com/photos/62126383@N00/513650264',
  'https://www.flickr.com/photos/62322787@N03/52059279662',
  'https://www.flickr.com/photos/62322787@N03/52059280962',
  'https://www.flickr.com/photos/63405864@N04/11430577275',
  'https://www.flickr.com/photos/63405864@N04/11430577465',
  'https://www.flickr.com/photos/63405864@N04/12735249763',
  'https://www.flickr.com/photos/63669472@N00/11452114374',
  'https://www.flickr.com/photos/65763797@N00/7935981694',
  'https://www.flickr.com/photos/65763797@N00/7935983586',
  'https://www.flickr.com/photos/65763797@N00/7935987364',
  'https://www.flickr.com/photos/67872859@N00/19436484573',
  'https://www.flickr.com/photos/67872859@N00/19869372158',
  'https://www.flickr.com/photos/67872859@N00/19870788199',
  'https://www.flickr.com/photos/67872859@N00/20057465245',
  'https://www.flickr.com/photos/69131582@N00/1784912827',
  'https://www.flickr.com/photos/7168480@N02/17030603478',
  'https://www.flickr.com/photos/75348994@N00/244147869',
  'https://www.flickr.com/photos/76614238@N00/8377097172',
  'https://www.flickr.com/photos/77742560@N06/7985921220',
  'https://www.flickr.com/photos/7862936@N08/461793272',
  'https://www.flickr.com/photos/80676352@N03/19432640504',
  'https://www.flickr.com/photos/80676352@N03/19434316343',
  'https://www.flickr.com/photos/80676352@N03/19868633689',
  'https://www.flickr.com/photos/80682954@N00/3943591379',
  'https://www.flickr.com/photos/81565156@N00/364087880',
  'https://www.flickr.com/photos/82181006@N00/2207476758',
  'https://www.flickr.com/photos/86518301@N00/1466953851',
  'https://www.flickr.com/photos/89165847@N00/483830982',
  'https://www.flickr.com/photos/90037546@N00/3219966909',
  'https://www.flickr.com/photos/90802476@N00/15093189832',
  'https://www.flickr.com/photos/95519741@N00/7527616154',
  'https://www.flickr.com/photos/96558615@N02/8945817322',
  'https://www.flickr.com/photos/9807674@N04/8317414553',
  'https://www.flickr.com/photos/9952716@N05/1355713437',
  'https://www.rawpixel.com/image/14008491/image-cartoon-person-art',
  'https://www.rawpixel.com/image/5919224/hair-salon-free-public-domain-cc0-photo',
  'https://www.rawpixel.com/image/6818989/png-sticker-public-domain',
]);

interface Candidate {
  title: string;
  imageUrl: string;
  license: string;
  rawLicense: string;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
  needsAttribution: boolean;
}

interface CataloguePhoto {
  title: string;
  images: string[];
  sourceUrl: string;
}

/** Loads DummyJSON's catalogue once, keyed by exact product title. */
async function loadCataloguePhotos(): Promise<Map<string, CataloguePhoto>> {
  const response = await fetch(
    'https://dummyjson.com/products?limit=0&select=title,images,category',
    {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`DummyJSON returned ${response.status}`);

  const payload = (await response.json()) as {
    products?: Array<{ id?: number; title?: string; images?: string[] }>;
  };

  const byTitle = new Map<string, CataloguePhoto>();
  for (const product of payload.products ?? []) {
    if (!product.title || !product.images?.length) continue;
    byTitle.set(product.title, {
      title: product.title,
      images: product.images,
      sourceUrl: `https://dummyjson.com/products/${product.id ?? ''}`,
    });
  }
  return byTitle;
}

function needsAttribution(license: string): boolean {
  return !/^(cc0|pdm)$/i.test(license);
}

/**
 * Wikimedia Commons is searched before the rest of the corpus.
 *
 * Commons is catalogued encyclopedically, so a search for "hiking boots"
 * returns "SCARPA Boreas gtx hiking boots" -- the object, photographed to be
 * looked at. The wider corpus is mostly Flickr, where the same search returns
 * someone's holiday snapshot and a pair of boots used as plant pots. Commons
 * is thin in places, so the full corpus stays as the fallback.
 */
const PREFERRED_SOURCE = 'wikimedia';

async function search(query: string, source?: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    q: query,
    ...(source ? { source } : {}),
    license_type: 'commercial',
    page_size: '20',
  });

  let response: Response;
  try {
    response = await fetch(`${API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as {
    results?: Array<Record<string, unknown>>;
  } | null;
  if (!payload) return [];

  return (payload.results ?? [])
    .map((result) => {
      const license = String(result.license ?? '');
      return {
        title: String(result.title ?? 'Untitled').slice(0, 120),
        imageUrl: String(result.url ?? ''),
        license: `${license.toUpperCase()} ${String(result.license_version ?? '')}`.trim(),
        rawLicense: license,
        creator: String(result.creator ?? 'Unknown').slice(0, 80),
        creatorUrl: String(result.creator_url ?? ''),
        sourceUrl: String(result.foreign_landing_url ?? ''),
        needsAttribution: needsAttribution(license),
      };
    })
    .filter(
      (candidate) =>
        candidate.imageUrl &&
        !/nd\b/i.test(candidate.rawLicense) &&
        !REJECTED_SOURCES.has(candidate.sourceUrl),
    );
}

/**
 * Words that make a title wrong regardless of what else it matches.
 *
 * The keyword guard alone is not enough: "M27 -- Dumbbell Nebula" contains
 * "dumbbell" and sailed into the fitness bucket on the first run. These are
 * the domains whose vocabulary collides with product vocabulary -- astronomy,
 * anatomy, and stock-photo model shots -- not a general profanity list.
 */
const BLOCKED = [
  'nebula',
  'galaxy cluster',
  'messier',
  'supernova',
  'astronomy',
  'telescope',
  'star cluster',
  'constellation',
  'x-ray',
  'diagram',
  'anatomy',
  'skeleton',
  'cemetery',
  'gravestone',
  'protest',
  'funeral',
  'advertisement',
  'advert',
  'poster',
  'cartoon',
  'engraving',
  'painting',
  'sketch',
  'selfie',
  'portrait',
  // People. A storefront card wants the object, not someone holding it, and
  // these words were behind the worst results: a woman's face for Vitamin C
  // Serum, a man for Solid Perfume, someone eating for Hair Oil.
  'woman',
  'women',
  'girl',
  'lady',
  'ladies',
  'people',
  'person',
  'model',
  'wearing',
  'wears',
  'my face',
  'her ',
  'his ',
  'family',
  'crowd',
  'child',
  'kids',
  'baby',
  'teacher',
  'student',
  'friend',
  'mum',
  'dad',
  'guy',
  'clip art',
  'clipart',
  'screenshot',
  'logo',
  'batman',
  'library',
  // Produce homographs: 'cucumber' matched a sea cucumber on the seabed and
  // 'ginger' a glass of ginger ale, both perfectly accurate titles.
  'sea cucumber',
  'ginger ale',
];

/**
 * Scores a candidate title, or returns -1 to reject it.
 *
 * Two rules, both learned from looking at the first run's output rather than
 * guessed at:
 *
 *  1. *Every* significant word of the query must appear. Matching any single
 *     word let "glass cleaner" pull in a school's "Hour Glass Cleaners" award
 *     photo and "monitor" pull in a monitor's power brick.
 *  2. Short, literal titles win. The usable results were called "Running
 *     Shoes", "cast iron skillet", "Ground Coffee"; the unusable ones were
 *     narrated snapshots ("If you were ground coffee, you'd be espresso..."),
 *     because someone photographing a product names it after the product and
 *     someone photographing their life writes a sentence.
 */
function scoreTitle(title: string, queryWords: string[]): number {
  const lower = title.toLowerCase();
  if (BLOCKED.some((word) => lower.includes(word))) return -1;
  if (queryWords.length === 0) return -1;
  if (!queryWords.every((word) => lower.includes(word))) return -1;

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  return 100 - wordCount * 6;
}

/**
 * Shared across buckets so neighbouring product types do not land on the same
 * photo -- on an early run all three books subcategories were byte-identical,
 * because their vocabularies overlap and Openverse ranks the same results for
 * each. Check-and-add is atomic within a tick, so the bounded-concurrency
 * workers cannot both claim one URL.
 *
 * A type that finds nothing left unclaimed is retried in a second pass with
 * `allowReuse`, because a shared photo beats no photo.
 */
const claimed = new Set<string>();

/** DummyJSON's catalogue, loaded once by main() before any bucket runs. */
let cataloguePhotos = new Map<string, CataloguePhoto>();

function claim(key: string, allowReuse: boolean): boolean {
  const normalized = key.toLowerCase().trim();
  if (!allowReuse && claimed.has(normalized)) return false;
  claimed.add(normalized);
  return true;
}

interface Downloaded {
  bytes: Buffer;
}

/**
 * Fetches an image, or null if it is not usable.
 *
 * `minBytes` exists because a tiny response from a *search* is almost always an
 * error page or a placeholder, while a tiny response from the demo catalogue is
 * just a small photograph -- its 7 KB iPhone 5s shot was being dropped by an
 * 8 KB floor written for the other source, and the type silently fell through
 * to a stock picture of a pile of old handsets.
 */
async function download(url: string, minBytes = 8_000): Promise<Downloaded | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  // Reading the body can abort on the same timeout as the request itself, so
  // it needs its own guard -- one slow host must not kill the whole run.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.length < minBytes) return null;

  const isPng = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  // DummyJSON serves WebP (RIFF container with a 'WEBP' tag at offset 8).
  const isWebp =
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isPng && !isJpg && !isWebp) return null; // trust the bytes, not the URL

  return { bytes };
}

/** Rejects images too small or too extreme in aspect to be product photos. */
async function isUsablePhoto(bytes: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(bytes).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 400 || h < 400) return false;
    const ratio = w / h;
    if (ratio < 0.5 || ratio > 2.2) return false;
    return true;
  } catch {
    return false;
  }
}

/** Cover-crops to a square tile and re-encodes, stripping EXIF/GPS metadata. */
async function toTile(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate() // apply EXIF orientation before stripping metadata
    .resize(TILE_SIZE, TILE_SIZE, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/**
 * Names a tile after its own content.
 *
 * Without the hash a replaced image keeps its old URL, and because Next serves
 * /_next/image with a long immutable cache header, browsers and the build
 * cache go on showing the picture that was there before. That is exactly how a
 * face that had already been removed from disk kept appearing on the Vitamin C
 * Serum cards. A content hash gives replaced artwork a new URL, so a fix is
 * visible immediately instead of after a manual cache clear.
 */
function tileName(fileSlug: string, index: number, bytes: Buffer): string {
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  return `real-${fileSlug}-${index}-${hash}.jpg`;
}

interface ManifestEntry {
  path: string;
  title: string;
  license: string;
  needsAttribution: boolean;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
}

async function fetchBucket(
  bucket: Bucket,
  force: boolean,
  allowReuse = false,
): Promise<{ key: string; entries: ManifestEntry[]; log: string }> {
  const label = bucket.key.padEnd(46);
  // A catalogue-mapped type is complete as soon as it has its first image --
  // DummyJSON products carry between one and four photos, so requiring three
  // would re-fetch those types on every run.
  const wanted = CATALOGUE_PHOTOS[bucket.key] ? 1 : IMAGES_PER_BUCKET;
  // Matched by prefix rather than exact name: filenames carry a content hash,
  // so the suffix is not known ahead of the download.
  const onDisk = readdirSync(OUT_DIR).filter((file) => file.startsWith(`real-${bucket.fileSlug}-`));
  const haveIndex = (n: number) =>
    onDisk.some((file) => file.startsWith(`real-${bucket.fileSlug}-${n}-`));
  if (!force && Array.from({ length: wanted }, (_, n) => haveIndex(n + 1)).every(Boolean)) {
    return { key: bucket.key, entries: [], log: `${label} skip (already fetched)` };
  }

  const entries: ManifestEntry[] = [];

  // Catalogue photography first: where a type is mapped, these are real
  // product shots and there is no reason to search for anything worse.
  for (const title of CATALOGUE_PHOTOS[bucket.key] ?? []) {
    const photo = cataloguePhotos.get(title);
    if (!photo) {
      console.warn(`  ! DummyJSON has no product titled "${title}" (${bucket.key})`);
      continue;
    }
    // Only the product's first image. The later ones in a DummyJSON entry are
    // lifestyle shots -- the second photo for "Attitude Super Leaves Hand
    // Soap" is a child at a basin, which is exactly the kind of picture this
    // whole exercise is meant to keep off a product card.
    for (const imageUrl of photo.images.slice(0, 1)) {
      if (entries.length >= IMAGES_PER_BUCKET) break;
      try {
        // 1 KB, not 8: this URL came from the catalogue API, not a search.
        const file = await download(imageUrl, 1_000);
        if (!file) continue;
        const tile = await toTile(file.bytes);
        const filename = tileName(bucket.fileSlug, entries.length + 1, tile);
        writeFileSync(join(OUT_DIR, filename), tile);
        entries.push({
          path: `/products/${filename}`,
          title: photo.title,
          license: 'DummyJSON demo catalogue',
          needsAttribution: false,
          creator: 'DummyJSON',
          creatorUrl: 'https://dummyjson.com',
          sourceUrl: photo.sourceUrl,
        });
      } catch {
        continue;
      }
    }
  }

  async function collect(source?: string): Promise<void> {
    for (const query of bucket.queries) {
      if (entries.length >= IMAGES_PER_BUCKET) return;

      const queryWords = significantWords(query);
      const candidates = (await search(query, source))
        .map((candidate) => ({ candidate, score: scoreTitle(candidate.title, queryWords) }))
        .filter((scored) => scored.score >= 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            Number(a.candidate.needsAttribution) - Number(b.candidate.needsAttribution),
        )
        .map((scored) => scored.candidate);

      for (const candidate of candidates) {
        if (entries.length >= IMAGES_PER_BUCKET) return;
        // Both, so neither the same file nor a near-duplicate shot of the same
        // subject appears twice in one gallery or across two product types.
        if (!claim(candidate.imageUrl, allowReuse)) continue;
        if (!claim(candidate.title, allowReuse)) continue;

        try {
          const file = await download(candidate.imageUrl);
          if (!file) continue;
          if (!(await isUsablePhoto(file.bytes))) continue;

          const tile = await toTile(file.bytes);
          const filename = tileName(bucket.fileSlug, entries.length + 1, tile);
          writeFileSync(join(OUT_DIR, filename), tile);

          entries.push({
            path: `/products/${filename}`,
            title: candidate.title,
            license: candidate.license,
            needsAttribution: candidate.needsAttribution,
            creator: candidate.creator,
            creatorUrl: candidate.creatorUrl,
            sourceUrl: candidate.sourceUrl,
          });
        } catch {
          continue; // a single bad image must not abandon the type
        }
      }
    }
  }

  // Only search when the type has no catalogue photography. Topping a mapped
  // type up to three with search results defeats the point: the gallery -- and
  // whichever image the card happens to rotate to -- would mix a clean studio
  // shot with a weaker one. Fewer correct images beat three uneven ones.
  if (entries.length === 0) {
    await collect(PREFERRED_SOURCE);
    await collect();
  }

  const log =
    entries.length > 0
      ? `${label} ${entries.length}/${IMAGES_PER_BUCKET}  ${entries.map((e) => e.title.slice(0, 24)).join(' | ')}`
      : `${label} 0/${IMAGES_PER_BUCKET}  no relevant result`;

  return { key: bucket.key, entries, log };
}

/** Runs async tasks with bounded concurrency, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');

  const buckets = buildBuckets(SUBCATEGORY_TEMPLATES);
  cataloguePhotos = await loadCataloguePhotos();
  const mapped = buckets.filter((bucket) => CATALOGUE_PHOTOS[bucket.key]).length;
  console.log(
    `Fetching photography for ${buckets.length} product types:\n` +
      `  ${mapped} from the DummyJSON catalogue (studio product shots)\n` +
      `  ${buckets.length - mapped} from Openverse (openly licensed photography)\n`,
  );

  // An incremental run must not hand a new type a photo an existing type is
  // already using, so previously accepted titles count as claimed.
  if (existsSync(MANIFEST_PATH) && !force) {
    const previous = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<
      string,
      ManifestEntry[]
    >;
    for (const entries of Object.values(previous)) {
      for (const entry of entries) claim(entry.title, false);
    }
  }

  const firstPass = await mapWithConcurrency(buckets, CONCURRENCY, (bucket) =>
    fetchBucket(bucket, force),
  );

  // Anything still empty lost every candidate to another type's claim rather
  // than to the relevance guard. Retry those allowing a shared photo.
  const starved = buckets.filter((bucket, index) => (firstPass[index]?.entries.length ?? 0) === 0);
  const retried = new Map<string, Awaited<ReturnType<typeof fetchBucket>>>();
  if (starved.length > 0) {
    console.log(`\nRetrying ${starved.length} type(s) that found nothing unclaimed...\n`);
    for (const result of await mapWithConcurrency(starved, CONCURRENCY, (bucket) =>
      fetchBucket(bucket, true, true),
    )) {
      retried.set(result.key, result);
    }
  }

  const results = firstPass.map((result) => {
    const better = retried.get(result.key);
    return better && better.entries.length > result.entries.length ? better : result;
  });
  for (const r of results) console.log(r.log);

  const manifest: Record<string, ManifestEntry[]> = {};
  let attributionCount = 0;
  let coveredBuckets = 0;

  for (const r of results) {
    if (r.entries.length === 0) continue;
    manifest[r.key] = r.entries;
    coveredBuckets += 1;
    attributionCount += r.entries.filter((e) => e.needsAttribution).length;
  }

  // Keep manifest entries for buckets skipped this run (already fetched).
  //
  // Only entries whose file is still on disk. A type whose images were deleted
  // and which then found nothing acceptable would otherwise have its old
  // entries restored here, leaving the manifest pointing at files that no
  // longer exist -- a broken image on every product of that type.
  if (existsSync(MANIFEST_PATH) && !force) {
    const previous = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<
      string,
      ManifestEntry[]
    >;
    for (const [key, entries] of Object.entries(previous)) {
      if (manifest[key]) continue;

      const stillOnDisk = entries.filter((entry) =>
        existsSync(join(process.cwd(), 'public', entry.path.slice(1))),
      );
      if (stillOnDisk.length === 0) continue;

      manifest[key] = stillOnDisk;
      coveredBuckets += 1;
    }
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // CC BY / CC BY-SA require credit; writing this file, and the in-app
  // /image-credits page that reads the manifest, is part of complying with it.
  const attributionLines: string[] = [];
  for (const [key, entries] of Object.entries(manifest)) {
    for (const entry of entries) {
      if (!entry.needsAttribution) continue;
      attributionLines.push(
        `- **${key}** — [${entry.title}](${entry.sourceUrl}) by ${entry.creator}, ${entry.license}`,
      );
    }
  }
  writeFileSync(
    join(OUT_DIR, 'ATTRIBUTION.md'),
    [
      '# Product image attribution',
      '',
      'Studio catalogue shots come from [DummyJSON](https://dummyjson.com), a public',
      'demo-data service for development, and need no attribution. The rest is',
      'fetched from [Openverse](https://openverse.org) by',
      '`pnpm products:fetch-images`. Entries not listed here are CC0 or public',
      'domain and need no attribution. This file, and the equivalent listing at',
      '`/image-credits` in the running app, are how this project keeps that credit.',
      '',
      ...(attributionLines.length > 0
        ? attributionLines
        : ['_None — every image is CC0 or public domain._']),
      '',
    ].join('\n'),
    'utf8',
  );

  // Prune real-*.jpg files no longer referenced, so a --force re-run does not
  // leave orphans from a type that later failed. Only ever touches files this
  // script itself writes -- the generated SVG art is a different extension.
  const expected = new Set(
    Object.values(manifest).flatMap((entries) => entries.map((e) => e.path.split('/').pop())),
  );
  for (const file of readdirSync(OUT_DIR)) {
    if (file.startsWith('real-') && file.endsWith('.jpg') && !expected.has(file)) {
      rmSync(join(OUT_DIR, file));
    }
  }

  console.log(`\n${coveredBuckets}/${buckets.length} product types have real photography.`);
  console.log(
    `${attributionCount} image(s) require attribution -- see public/products/ATTRIBUTION.md`,
  );
  console.log('Re-run the seed (pnpm seed) to apply the new images, and restart the dev server.');
}

main().catch((error: unknown) => {
  console.error('Fetch failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
