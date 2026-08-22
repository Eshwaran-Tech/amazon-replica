/**
 * Category taxonomy for seeding.
 *
 * Two levels: twelve top-level categories, each with subcategories. Slugs are
 * the stable identifier used in URLs and in product documents; names are for
 * display only and can change without breaking a link.
 */

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  children: Array<{ name: string; slug: string }>;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Audio, cameras, wearables and everyday tech.',
    children: [
      { name: 'Headphones', slug: 'headphones' },
      { name: 'Speakers', slug: 'speakers' },
      { name: 'Cameras', slug: 'cameras' },
      { name: 'Wearables', slug: 'wearables' },
    ],
  },
  {
    name: 'Computers',
    slug: 'computers',
    description: 'Laptops, desktops, components and peripherals.',
    children: [
      { name: 'Laptops', slug: 'laptops' },
      { name: 'Monitors', slug: 'monitors' },
      { name: 'Storage', slug: 'storage' },
      { name: 'Peripherals', slug: 'peripherals' },
    ],
  },
  {
    name: 'Mobiles',
    slug: 'mobiles',
    description: 'Smartphones, tablets and accessories.',
    children: [
      { name: 'Smartphones', slug: 'smartphones' },
      { name: 'Tablets', slug: 'tablets' },
      { name: 'Phone Accessories', slug: 'phone-accessories' },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Clothing, footwear and accessories.',
    children: [
      { name: "Men's Clothing", slug: 'mens-clothing' },
      { name: "Women's Clothing", slug: 'womens-clothing' },
      { name: 'Footwear', slug: 'footwear' },
      { name: 'Watches', slug: 'watches' },
    ],
  },
  {
    name: 'Home',
    slug: 'home',
    description: 'Furniture, decor and home improvement.',
    children: [
      { name: 'Furniture', slug: 'furniture' },
      { name: 'Decor', slug: 'decor' },
      { name: 'Lighting', slug: 'lighting' },
    ],
  },
  {
    name: 'Kitchen',
    slug: 'kitchen',
    description: 'Appliances, cookware and dining.',
    children: [
      { name: 'Appliances', slug: 'appliances' },
      { name: 'Cookware', slug: 'cookware' },
      { name: 'Dining', slug: 'dining' },
    ],
  },
  {
    name: 'Books',
    slug: 'books',
    description: 'Fiction, non-fiction and reference.',
    children: [
      { name: 'Fiction', slug: 'fiction' },
      { name: 'Non-Fiction', slug: 'non-fiction' },
      { name: 'Technology', slug: 'technology-books' },
    ],
  },
  {
    name: 'Beauty',
    slug: 'beauty',
    description: 'Skincare, haircare and fragrance.',
    children: [
      { name: 'Skincare', slug: 'skincare' },
      { name: 'Haircare', slug: 'haircare' },
      { name: 'Fragrance', slug: 'fragrance' },
    ],
  },
  {
    name: 'Sports',
    slug: 'sports',
    description: 'Fitness equipment and outdoor gear.',
    children: [
      { name: 'Fitness', slug: 'fitness' },
      { name: 'Outdoor', slug: 'outdoor' },
      { name: 'Cycling', slug: 'cycling' },
    ],
  },
  {
    name: 'Toys',
    slug: 'toys',
    description: 'Games, puzzles and building sets.',
    children: [
      { name: 'Building Sets', slug: 'building-sets' },
      { name: 'Board Games', slug: 'board-games' },
      { name: 'Learning', slug: 'learning-toys' },
    ],
  },
  {
    name: 'Grocery',
    slug: 'grocery',
    description: 'Fresh fruit and vegetables, pantry staples, beverages and snacks.',
    children: [
      { name: 'Fruits & Vegetables', slug: 'fruits-vegetables' },
      { name: 'Beverages', slug: 'beverages' },
      { name: 'Snacks', slug: 'snacks' },
      { name: 'Pantry', slug: 'pantry' },
      { name: 'Meat & Seafood', slug: 'meat-seafood' },
    ],
  },
  {
    name: 'Automotive',
    slug: 'automotive',
    description: 'Car care, electronics and accessories.',
    children: [
      { name: 'Car Electronics', slug: 'car-electronics' },
      { name: 'Car Care', slug: 'car-care' },
      { name: 'Tools', slug: 'car-tools' },
    ],
  },
];

/** Flat set of every valid category and subcategory slug, for validation. */
export const ALL_CATEGORY_SLUGS: string[] = SEED_CATEGORIES.flatMap((category) => [
  category.slug,
  ...category.children.map((child) => child.slug),
]);
