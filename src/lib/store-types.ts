// What a store sells. Its type sets the words the storefront uses ("pieces" or "pairs", "Find
// your fit" or "Shop by pet"), the names of the two options a product's variants differ in
// (size and colour, or pack size and flavour), what the product page calls its details, the
// sizes the product editor suggests, how the Rail section shows products, and the departments
// and starter text a new store begins with. A product can rename its two options for itself
// (products.option_names), for stores that sell more than one kind of thing.

export const STORE_TYPES = ["fashion", "footwear", "jewellery", "beauty", "pets", "instruments", "home", "electronics", "grocery", "kids", "books", "general"] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export interface StoreKind {
  key: StoreType;
  label: string;
  /** What such a store sells, for the admin. */
  example: string;
  /** What one thing it sells is called, and several. */
  one: string;
  many: string;
  /** The two options a product's variants can differ in (the size and colour columns). */
  options: { size: string; color: string };
  /**
   * The product page's three detail fields (fabric, fit and care in the database) and the titles
   * of their sections; madeOf: the first says what the product is made of (shared with search
   * engines as its material).
   */
  details: { material: string; fit: string; care: string; materialTitle: string; fitTitle: string; madeOf: boolean };
  /** Whether its products come in sizes a size guide explains. */
  sizeGuide: boolean;
  /** Examples for the product editor's three detail fields. */
  detailExamples: { material: string; fit: string; care: string };
  /** Ready-made sets of sizes (or pack sizes, ages...) the product editor offers. */
  sizeSets: { label: string; sizes: string[] }[];
  /** Departments a new store starts with. */
  departments: string[];
  /** How the Rail section shows products: hanging on a clothes rail, or standing on a shelf. */
  display: "hangers" | "shelf";
  /** What can be returned, and what can't, for the starter returns policy and FAQ. */
  returnCondition: string;
  noReturns: string;
  /** A question a new store's FAQ starts with, besides delivery, cash on delivery and returns. */
  faq: { q: string; a: string };
  words: {
    /** The store's chosen pieces (the Showcase, the Rail, best sellers before there are sales). */
    favourites: string;
    /** Departments, as a title. */
    browse: string;
    newsletter: string;
    newsletterText: string;
    /** Under the opening banner's heading when the store has no banner yet. */
    heroText: string;
    emptyBag: string;
    reviewPrompt: string;
    /** The opening of the starter "About" page: "{name} brings together …". */
    about: string;
  };
}

const KINDS: Record<StoreType, Omit<StoreKind, "key">> = {
  fashion: {
    label: "Clothing and fashion",
    example: "Sarees, kurtas, shirts, dresses",
    one: "piece",
    many: "pieces",
    options: { size: "Size", color: "Colour" },
    details: { material: "Fabric", fit: "Fit", care: "Care", materialTitle: "Fabric & care", fitTitle: "Fit", madeOf: true },
    sizeGuide: true,
    detailExamples: { material: "100% linen, 180 gsm", fit: "Relaxed fit. Model is 175 cm and wears S.", care: "Machine wash cold. Dry in shade." },
    sizeSets: [
      { label: "XS – XL", sizes: ["XS", "S", "M", "L", "XL"] },
      { label: "S – XXL", sizes: ["S", "M", "L", "XL", "XXL"] },
      { label: "Waist 28 – 38", sizes: ["28", "30", "32", "34", "36", "38"] },
      { label: "Free size", sizes: ["Free Size"] },
    ],
    departments: ["Women", "Men", "Kids", "Accessories"],
    display: "hangers",
    returnCondition: "unworn items with their tags",
    noReturns: "Sale items, innerwear and earrings cannot be returned for hygiene reasons.",
    faq: { q: "How do I find my size?", a: "Every product page has a size guide with garment measurements. If you are between sizes, the product's fit notes tell you which way to go." },
    words: {
      favourites: "Pieces we love",
      browse: "Find your fit",
      newsletter: "First to know, first to wear",
      newsletterText: "Early access to new collections and the sale, and stories from the people who make them.",
      heroText: "New pieces every season, made to be worn for many more.",
      emptyBag: "Pieces you add will appear here.",
      reviewPrompt: "How did it fit? How does the fabric feel?",
      about: "clothing that is made carefully and meant to be worn for years",
    },
  },
  footwear: {
    label: "Shoes and slippers",
    example: "Sneakers, sandals, chappals, slippers",
    one: "pair",
    many: "pairs",
    options: { size: "Size", color: "Colour" },
    details: { material: "Materials", fit: "Fit", care: "Care", materialTitle: "Materials & care", fitTitle: "Size & fit", madeOf: true },
    sizeGuide: true,
    detailExamples: { material: "Full-grain leather upper, rubber sole", fit: "True to size. For wide feet, go a size up.", care: "Wipe clean. Keep away from direct heat." },
    sizeSets: [
      { label: "UK 3 – 11", sizes: ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"] },
      { label: "EU 36 – 46", sizes: ["EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "EU 46"] },
      { label: "Free size", sizes: ["Free Size"] },
    ],
    departments: ["Women", "Men", "Kids", "Slippers and sliders"],
    display: "shelf",
    returnCondition: "unworn pairs in their original box",
    noReturns: "Worn shoes and sale pairs cannot be returned.",
    faq: { q: "How do I find my size?", a: "Every product page has a size guide in UK sizes. If you are between sizes, we suggest the larger one." },
    words: {
      favourites: "Pairs we love",
      browse: "Find your pair",
      newsletter: "First to know, first to step out",
      newsletterText: "New pairs, restocks and the sale, before anyone else.",
      heroText: "New pairs every season, made for the miles ahead.",
      emptyBag: "Pairs you add will appear here.",
      reviewPrompt: "How did they fit? Are they comfortable all day?",
      about: "shoes and slippers made to be comfortable from the first step",
    },
  },
  jewellery: {
    label: "Jewellery and accessories",
    example: "Earrings, necklaces, bags, watches",
    one: "piece",
    many: "pieces",
    options: { size: "Size", color: "Finish" },
    details: { material: "Materials", fit: "Size", care: "Care", materialTitle: "Materials & care", fitTitle: "Size", madeOf: true },
    sizeGuide: true,
    detailExamples: { material: "925 sterling silver, 18k gold plated", fit: "Drop length 3 cm. Adjustable chain, 40–45 cm.", care: "Keep dry. Store in its pouch." },
    sizeSets: [
      { label: "Free size", sizes: ["Free Size"] },
      { label: "Rings 6 – 12", sizes: ["6", "7", "8", "9", "10", "11", "12"] },
      { label: "Chains 16 – 24 in", sizes: ["16 in", "18 in", "20 in", "22 in", "24 in"] },
    ],
    departments: ["Earrings", "Necklaces", "Rings and bangles", "Bags"],
    display: "shelf",
    returnCondition: "unworn pieces in their original packaging",
    noReturns: "Earrings and personalised pieces cannot be returned for hygiene reasons.",
    faq: { q: "Will it tarnish?", a: "Every product page gives the materials and how to care for the piece so it keeps its shine." },
    words: {
      favourites: "Pieces we love",
      browse: "Find your piece",
      newsletter: "First to know, first to shine",
      newsletterText: "New pieces, restocks and the sale, before anyone else.",
      heroText: "Pieces made to be worn every day and kept for years.",
      emptyBag: "Pieces you add will appear here.",
      reviewPrompt: "How does it look and feel? Is it as pictured?",
      about: "jewellery and accessories made carefully, to be worn every day",
    },
  },
  beauty: {
    label: "Beauty and personal care",
    example: "Skincare, makeup, haircare, fragrance",
    one: "product",
    many: "products",
    options: { size: "Size", color: "Shade" },
    details: { material: "Ingredients", fit: "How to use", care: "Good to know", materialTitle: "Ingredients & care", fitTitle: "How to use", madeOf: false },
    sizeGuide: false,
    detailExamples: { material: "Aqua, glycerin, niacinamide 5%…", fit: "Apply two drops to clean skin, morning and night.", care: "Patch test first. Use within 12 months of opening." },
    sizeSets: [
      { label: "15 – 200 ml", sizes: ["15 ml", "30 ml", "50 ml", "100 ml", "200 ml"] },
      { label: "50 – 500 g", sizes: ["50 g", "100 g", "250 g", "500 g"] },
    ],
    departments: ["Skin", "Hair", "Makeup", "Fragrance"],
    display: "shelf",
    returnCondition: "unopened products with their seal intact",
    noReturns: "Opened or used products cannot be returned for hygiene reasons.",
    faq: { q: "Which shade or type suits me?", a: "Product pages describe each shade and the skin or hair type it suits. Write to us and we'll help you choose." },
    words: {
      favourites: "Our favourites",
      browse: "Shop by need",
      newsletter: "First to know, first to glow",
      newsletterText: "New launches, restocks and offers, before anyone else.",
      heroText: "Care that works, made with ingredients you can read.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "How did it work for you? How does it feel?",
      about: "beauty and personal care made with ingredients chosen carefully",
    },
  },
  pets: {
    label: "Pet supplies",
    example: "Food, treats, toys, beds, collars",
    one: "product",
    many: "products",
    options: { size: "Size", color: "Variant" },
    details: { material: "Ingredients and materials", fit: "Sizing and feeding", care: "Care", materialTitle: "Ingredients & care", fitTitle: "Sizing & feeding", madeOf: false },
    sizeGuide: true,
    detailExamples: { material: "Chicken (40%), rice, peas…", fit: "For dogs of 10–25 kg: 150–250 g a day.", care: "Store in a cool, dry place." },
    sizeSets: [
      { label: "XS – XL", sizes: ["XS", "S", "M", "L", "XL"] },
      { label: "Packs 1 – 15 kg", sizes: ["1 kg", "3 kg", "7 kg", "15 kg"] },
    ],
    departments: ["Dogs", "Cats", "Birds and small pets", "Food and treats"],
    display: "shelf",
    returnCondition: "unused items in their original packaging",
    noReturns: "Opened food and treats cannot be returned.",
    faq: { q: "Which size suits my pet?", a: "Product pages give each size by your pet's weight or measurements. Write to us if you're unsure." },
    words: {
      favourites: "Pet favourites",
      browse: "Shop by pet",
      newsletter: "First to know, first to wag",
      newsletterText: "New treats, toys and offers for your pet, before anyone else.",
      heroText: "Everything your pet needs, chosen with care.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "Did your pet love it? How has it held up?",
      about: "food, toys and everyday things for pets, chosen with care",
    },
  },
  instruments: {
    label: "Musical instruments",
    example: "Guitars, keyboards, drums, accessories",
    one: "instrument",
    many: "instruments",
    options: { size: "Size", color: "Finish" },
    details: { material: "Specifications", fit: "Sound and playability", care: "Care and setup", materialTitle: "Specifications & care", fitTitle: "Sound & playability", madeOf: false },
    sizeGuide: false,
    detailExamples: { material: "Solid spruce top, mahogany back and sides, 20 frets", fit: "Warm, balanced tone; low action, easy to play.", care: "Set up before shipping. Wipe the strings after playing." },
    sizeSets: [
      { label: "Full size – 1/4", sizes: ["Full size", "3/4", "1/2", "1/4"] },
      { label: "One size", sizes: ["One size"] },
    ],
    departments: ["Guitars", "Keys", "Drums and percussion", "Accessories"],
    display: "shelf",
    returnCondition: "unused instruments in their original packaging",
    noReturns: "Strings, reeds and other consumables cannot be returned once opened.",
    faq: { q: "Do instruments arrive ready to play?", a: "Yes. We check and set up every instrument before it ships." },
    words: {
      favourites: "Instruments we love",
      browse: "Find your sound",
      newsletter: "First to know, first to play",
      newsletterText: "New arrivals, restocks and offers, before anyone else.",
      heroText: "Instruments chosen by players, set up to play well.",
      emptyBag: "Instruments you add will appear here.",
      reviewPrompt: "How does it sound and play? Did it arrive set up well?",
      about: "instruments chosen by players and set up to play well",
    },
  },
  home: {
    label: "Home and living",
    example: "Decor, kitchen, bedding, furniture",
    one: "piece",
    many: "pieces",
    options: { size: "Size", color: "Colour" },
    details: { material: "Materials", fit: "Dimensions", care: "Care", materialTitle: "Materials & care", fitTitle: "Dimensions", madeOf: true },
    sizeGuide: false,
    detailExamples: { material: "Solid mango wood, natural oil finish", fit: "W 45 × D 40 × H 75 cm", care: "Wipe with a dry cloth." },
    sizeSets: [
      { label: "Small – Large", sizes: ["Small", "Medium", "Large"] },
      { label: "Bed sizes", sizes: ["Single", "Double", "Queen", "King"] },
    ],
    departments: ["Living", "Kitchen and dining", "Bedroom", "Decor"],
    display: "shelf",
    returnCondition: "unused items in their original packaging",
    noReturns: "Personalised and made-to-order pieces cannot be returned.",
    faq: { q: "Where can I see the size?", a: "Every product page lists the dimensions and materials." },
    words: {
      favourites: "Pieces we love",
      browse: "Shop by room",
      newsletter: "First to know, first at home",
      newsletterText: "New pieces, restocks and the sale, before anyone else.",
      heroText: "Pieces for the home, made to be lived with.",
      emptyBag: "Pieces you add will appear here.",
      reviewPrompt: "How does it look in your home? Is the quality as described?",
      about: "things for the home that are made well and meant to be lived with",
    },
  },
  electronics: {
    label: "Electronics and gadgets",
    example: "Phones, audio, chargers, smart home",
    one: "product",
    many: "products",
    options: { size: "Model", color: "Colour" },
    details: { material: "Specifications", fit: "In the box", care: "Warranty and care", materialTitle: "Specifications & warranty", fitTitle: "In the box", madeOf: false },
    sizeGuide: false,
    detailExamples: { material: "Bluetooth 5.3, 30-hour battery, USB-C", fit: "Earbuds, charging case, USB-C cable, three sizes of ear tips", care: "One-year warranty. Keep away from water." },
    sizeSets: [
      { label: "64 GB – 1 TB", sizes: ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB"] },
      { label: "One size", sizes: ["One size"] },
    ],
    departments: ["Phones and tablets", "Audio", "Computers", "Accessories"],
    display: "shelf",
    returnCondition: "unused products in their sealed box",
    noReturns: "Opened software and items with a broken seal cannot be returned unless faulty.",
    faq: { q: "Is there a warranty?", a: "Yes. Every product comes with the maker's warranty, and its product page says for how long." },
    words: {
      favourites: "Top picks",
      browse: "Shop by category",
      newsletter: "First to know, first to try",
      newsletterText: "Launches, restocks and deals, before anyone else.",
      heroText: "The gadgets worth having, with warranty and fast delivery.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "How has it worked for you? How are the build and battery?",
      about: "electronics and gadgets that are worth having, with honest advice",
    },
  },
  grocery: {
    label: "Food and groceries",
    example: "Snacks, spices, tea and coffee, fresh produce",
    one: "product",
    many: "products",
    options: { size: "Pack size", color: "Flavour" },
    details: { material: "Ingredients", fit: "Nutrition", care: "Storage", materialTitle: "Ingredients & storage", fitTitle: "Nutrition", madeOf: false },
    sizeGuide: false,
    detailExamples: { material: "Arabica coffee beans, medium roast", fit: "Per 100 g: energy 2 kcal, sugar 0 g", care: "Keep airtight, away from light. Best within four weeks of opening." },
    sizeSets: [
      { label: "100 g – 2 kg", sizes: ["100 g", "250 g", "500 g", "1 kg", "2 kg"] },
      { label: "250 ml – 2 L", sizes: ["250 ml", "500 ml", "1 L", "2 L"] },
    ],
    departments: ["Fresh", "Pantry", "Snacks", "Drinks"],
    display: "shelf",
    returnCondition: "unopened products",
    noReturns: "Food cannot be returned once opened; tell us within a day if anything arrives damaged.",
    faq: { q: "How fresh is it?", a: "We pack orders on the day they ship, and every product page shows how to store it." },
    words: {
      favourites: "Customer favourites",
      browse: "Shop the aisles",
      newsletter: "First to know, first to taste",
      newsletterText: "New arrivals, seasonal picks and offers, before anyone else.",
      heroText: "Good food, sourced well and delivered fresh.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "How did it taste? Did it arrive fresh?",
      about: "good food, sourced carefully and delivered fresh",
    },
  },
  kids: {
    label: "Toys and kids",
    example: "Toys, games, baby gear, kids' clothing",
    one: "product",
    many: "products",
    options: { size: "Age", color: "Colour" },
    details: { material: "Materials", fit: "Age and safety", care: "Care", materialTitle: "Materials & care", fitTitle: "Age & safety", madeOf: true },
    sizeGuide: true,
    detailExamples: { material: "BPA-free plastic, water-based paints", fit: "Ages 3 and up. Contains small parts.", care: "Wipe clean with a damp cloth." },
    sizeSets: [
      { label: "Ages 0 – 12", sizes: ["0–6 months", "6–12 months", "1–2 years", "3–5 years", "6–8 years", "9–12 years"] },
      { label: "Clothes 2 – 12 years", sizes: ["2–3 years", "4–5 years", "6–7 years", "8–9 years", "10–12 years"] },
    ],
    departments: ["Toys", "Games and puzzles", "Baby", "Clothing"],
    display: "shelf",
    returnCondition: "unused items in their original packaging",
    noReturns: "Opened baby care products cannot be returned for hygiene reasons.",
    faq: { q: "Which age is it for?", a: "Every product page gives the age it suits and its safety notes." },
    words: {
      favourites: "Favourites",
      browse: "Shop by age",
      newsletter: "First to know, first to play",
      newsletterText: "New toys, restocks and offers, before anyone else.",
      heroText: "Toys and things for little ones, chosen to last.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "Did they love it? How has it held up?",
      about: "toys and things for children that are safe, fun and made to last",
    },
  },
  books: {
    label: "Books and stationery",
    example: "Books, notebooks, pens, art supplies",
    one: "item",
    many: "items",
    options: { size: "Format", color: "Colour" },
    details: { material: "Details", fit: "Format and size", care: "Good to know", materialTitle: "Details", fitTitle: "Format & size", madeOf: false },
    sizeGuide: false,
    detailExamples: { material: "Hardcover, 320 pages, English", fit: "15 × 23 cm, 450 g", care: "Signed by the author." },
    sizeSets: [
      { label: "Paperback, hardcover", sizes: ["Paperback", "Hardcover"] },
      { label: "A6 – A4", sizes: ["A6", "A5", "A4"] },
    ],
    departments: ["Fiction", "Non-fiction", "Children's books", "Stationery"],
    display: "shelf",
    returnCondition: "unused items in their original condition",
    noReturns: "Opened art supplies cannot be returned.",
    faq: { q: "How are books packed?", a: "Flat and well protected, so they arrive with their corners sharp." },
    words: {
      favourites: "Staff picks",
      browse: "Browse the shelves",
      newsletter: "First to know, first to read",
      newsletterText: "New titles, restocks and offers, before anyone else.",
      heroText: "Books and paper goods, chosen by readers.",
      emptyBag: "Items you add will appear here.",
      reviewPrompt: "What did you think of it?",
      about: "books and paper goods chosen by people who love them",
    },
  },
  general: {
    label: "Something else",
    example: "Gifts, crafts, a little of everything",
    one: "product",
    many: "products",
    options: { size: "Size", color: "Colour" },
    details: { material: "Details", fit: "Size and fit", care: "Care", materialTitle: "Details & care", fitTitle: "Size & fit", madeOf: false },
    sizeGuide: true,
    detailExamples: { material: "What it's made of, and how", fit: "Its size, and who or what it suits", care: "How to look after it" },
    sizeSets: [
      { label: "Small – Large", sizes: ["Small", "Medium", "Large"] },
      { label: "One size", sizes: ["One size"] },
    ],
    departments: [],
    display: "shelf",
    returnCondition: "unused items in their original packaging",
    noReturns: "Personalised items cannot be returned.",
    faq: { q: "Can I ask about a product?", a: "Of course. Write to us from the contact page and we'll reply within a day." },
    words: {
      favourites: "Our favourites",
      browse: "Shop by category",
      newsletter: "Be the first to know",
      newsletterText: "New arrivals, restocks and offers, before anyone else.",
      heroText: "Good things, chosen with care.",
      emptyBag: "Products you add will appear here.",
      reviewPrompt: "What did you think of it?",
      about: "good things, chosen with care",
    },
  },
};

export const isStoreType = (v: unknown): v is StoreType => typeof v === "string" && (STORE_TYPES as readonly string[]).includes(v);

/** A store type's words and settings; fashion for anything unknown (stores from before store types). */
export function storeKind(type: unknown): StoreKind {
  const key = isStoreType(type) ? type : "fashion";
  return { key, ...KINDS[key] };
}

export const STORE_KINDS: StoreKind[] = STORE_TYPES.map((k) => storeKind(k));

/** A product's own names for its two options, where it has them, else its store's. */
export function optionNames(kind: StoreKind, own?: unknown): { size: string; color: string } {
  const o = own && typeof own === "object" && !Array.isArray(own) ? (own as Record<string, unknown>) : {};
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 30) : fallback);
  return { size: pick(o.size, kind.options.size), color: pick(o.color, kind.options.color) };
}
