// Generates supabase/seed.sql: the replaceable sample catalog used in development and
// demos. Every row it creates is flagged is_sample, and Admin > Settings > Sample data
// removes them all in one click.
//
//   node scripts/generate-seed.mjs
//
// Brands, products and copy are fictional. Photos are from Unsplash (free to use under
// the Unsplash License, https://unsplash.com/license) and are loaded from their CDN.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const img = (id, ar = "4:5") => `https://images.unsplash.com/photo-${id}?ar=${ar}&fit=crop&w=1200&q=80&auto=format`;
const wide = (id) => img(id, "16:9");
const tall = (id) => img(id, "3:4");

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(q).join(", ")}]::text[]`;
const json = (o) => `${q(JSON.stringify(o))}::jsonb`;

const sizeGuides = [
  {
    key: "women",
    name: "Women's tops, dresses and trousers",
    unit: "cm",
    columns: ["Size", "Bust", "Waist", "Hip"],
    rows: [["XS", "81", "63", "89"], ["S", "86", "68", "94"], ["M", "91", "73", "99"], ["L", "97", "79", "105"], ["XL", "103", "85", "111"]],
    how: "Bust: around the fullest part. Waist: around the narrowest part. Hip: around the fullest part, feet together.",
  },
  {
    key: "men",
    name: "Men's shirts, tees and knitwear",
    unit: "cm",
    columns: ["Size", "Chest", "Waist", "Sleeve"],
    rows: [["S", "92", "78", "62"], ["M", "98", "84", "63"], ["L", "104", "90", "64"], ["XL", "110", "96", "65"], ["XXL", "116", "102", "66"]],
    how: "Chest: under the arms around the fullest part. Sleeve: from the centre back of the neck to the wrist.",
  },
  {
    key: "trousers",
    name: "Trousers and denim",
    unit: "in",
    columns: ["Size", "Waist", "Hip", "Inseam"],
    rows: [["28", "28", "36", "32"], ["30", "30", "38", "32"], ["32", "32", "40", "32"], ["34", "34", "42", "32"], ["36", "36", "44", "32"]],
    how: "Measure your natural waist and the inside leg from crotch to ankle.",
  },
  {
    key: "blazer",
    name: "Tailoring",
    unit: "in",
    columns: ["Size", "Chest", "Shoulder", "Sleeve"],
    rows: [["38", "38", "17.5", "25"], ["40", "40", "18", "25.5"], ["42", "42", "18.5", "26"], ["44", "44", "19", "26.5"]],
    how: "Your tailoring size is your chest measurement in inches.",
  },
  {
    key: "belts",
    name: "Belts",
    unit: "in",
    columns: ["Size", "Fits waist"],
    rows: [["S", "28-30"], ["M", "32-34"], ["L", "36-38"]],
    how: "Choose the size of the trousers you wear the belt with.",
  },
];

const brands = [
  { slug: "atelier-mira", name: "Atelier Mira", code: "AM", featured: true, banner: img("1779406165962-7df12de281b1", "16:9"),
    description: "Fluid womenswear in satin, georgette and fine cotton. Atelier Mira designs in small seasonal drops and cuts every piece to move." },
  { slug: "northloom", name: "Northloom", code: "NL", featured: true, banner: wide("1641642231157-0849081598a2"),
    description: "Knitwear spun from merino, cotton and wool blends, made in short runs so nothing sits in a warehouse for long." },
  { slug: "kaari-studio", name: "Kaari Studio", code: "KS", featured: true, banner: wide("1761369332487-777e59fa4bcf"),
    description: "Handloom weaves, hand embroidery and handmade jewellery from artisan clusters across India. Kaari means craft." },
  { slug: "sable-row", name: "Sable Row", code: "SR", featured: true, banner: wide("1619603364904-c0498317e145"),
    description: "Tailoring and shirting with a quiet, exact fit. Natural fibres, considered details, nothing extra." },
  { slug: "field-and-fold", name: "Field & Fold", code: "FF", featured: false, banner: wide("1489987707025-afc232f7ea0f"),
    description: "Everyday essentials in organic cotton and denim, designed to be worn hard and washed often." },
  { slug: "lumen-leather", name: "Lumen Leather", code: "LL", featured: true, banner: wide("1760624089496-01ae68a92d58"),
    description: "Vegetable-tanned leather goods, stitched to soften and darken beautifully with use." },
];

const categories = [
  { slug: "women", name: "Women", image: tall("1668952135120-7d997b1b3778"), banner: wide("1779406165962-7df12de281b1"), sort: 1,
    description: "Dresses, tailoring, knitwear and handloom for every day and every occasion." },
  { slug: "men", name: "Men", image: tall("1619603364904-c0498317e145"), banner: wide("1617137968427-85924c800a22"), sort: 2,
    description: "Shirting, knitwear, denim and outerwear, cut with care." },
  { slug: "unisex", name: "Unisex", image: tall("1521572163474-6864f9cf17ab"), banner: wide("1562157873-818bc0726f68"), sort: 3,
    description: "Wardrobe essentials designed to fit everyone." },
  { slug: "accessories", name: "Accessories", image: tall("1624687943971-e86af76d57de"), banner: wide("1760624089496-01ae68a92d58"), sort: 4,
    description: "Leather bags, belts, handmade jewellery and woven stoles." },
  { slug: "women-dresses", parent: "women", name: "Dresses", guide: "women", sort: 1 },
  { slug: "women-tops", parent: "women", name: "Tops & Shirts", guide: "women", sort: 2 },
  { slug: "women-trousers", parent: "women", name: "Trousers", guide: "women", sort: 3 },
  { slug: "women-knitwear", parent: "women", name: "Knitwear", guide: "women", sort: 4 },
  { slug: "women-outerwear", parent: "women", name: "Coats & Jackets", guide: "women", sort: 5 },
  { slug: "women-ethnic", parent: "women", name: "Sarees & Ethnic", sort: 6 },
  { slug: "men-shirts", parent: "men", name: "Shirts", guide: "men", sort: 1 },
  { slug: "men-tshirts", parent: "men", name: "T-Shirts", guide: "men", sort: 2 },
  { slug: "men-knitwear", parent: "men", name: "Knitwear", guide: "men", sort: 3 },
  { slug: "men-trousers", parent: "men", name: "Trousers & Denim", guide: "trousers", sort: 4 },
  { slug: "men-outerwear", parent: "men", name: "Coats & Jackets", guide: "men", sort: 5 },
  { slug: "men-ethnic", parent: "men", name: "Kurtas", guide: "men", sort: 6 },
  { slug: "unisex-essentials", parent: "unisex", name: "Essentials", guide: "men", sort: 1 },
  { slug: "accessories-bags", parent: "accessories", name: "Bags", sort: 1 },
  { slug: "accessories-belts", parent: "accessories", name: "Belts", guide: "belts", sort: 2 },
  { slug: "accessories-jewellery", parent: "accessories", name: "Jewellery", sort: 3 },
  { slug: "accessories-scarves", parent: "accessories", name: "Scarves & Stoles", sort: 4 },
];

const W = ["XS", "S", "M", "L"];
const WX = ["XS", "S", "M", "L", "XL"];
const M = ["S", "M", "L", "XL", "XXL"];
const ONE = [""];

// colours: [name, hex, [image ids]]
const products = [
  // Women
  { t: "Bias-Cut Satin Slip Dress", b: "atelier-mira", c: "women-dresses", p: 6490, sizes: W, featured: true,
    colors: [["Champagne", "#E8D9C0", ["1750064159040-c37883f82014"]], ["Black", "#151515", ["1594019739447-6c8a1d744d61"]]],
    tags: ["occasion", "evening", "satin"], fabric: "100% viscose satin with a soft sheen.",
    fit: "Cut on the bias to skim the body. True to size; size down for a closer fit.",
    care: "Dry clean recommended. Cool iron on the reverse.",
    d: "A slip dress cut on the bias so it falls in a clean line from adjustable straps to a mid-calf hem. Wear it alone in the evening or under a knit by day." },
  { t: "Liquid Satin Maxi Dress", b: "atelier-mira", c: "women-dresses", p: 8990, cmp: 11990, sizes: W,
    colors: [["Pewter", "#8E8C88", ["1790802243983-e6de0e275f59", "1790802162556-453f0527091f"]]],
    tags: ["occasion", "evening", "satin"], fabric: "Recycled polyester satin, fully lined.",
    fit: "Floor-length, close through the body with a cowl neckline. True to size.",
    care: "Dry clean only.",
    d: "A floor-length dress in heavyweight liquid satin with a draped cowl neck and low back. Made for evenings that go on." },
  { t: "Floral Print Midi Dress", b: "atelier-mira", c: "women-dresses", p: 4290, sizes: WX,
    colors: [["Poppy", "#B3261E", ["1572804013309-59a88b7e92f1"]]],
    tags: ["summer", "print"], fabric: "100% cotton voile.",
    fit: "Relaxed bodice with a full, swishy skirt. Belt included.",
    care: "Machine wash cold on a gentle cycle. Line dry in shade.",
    d: "A breezy cotton voile midi printed with small poppies, with flutter sleeves and a self-tie belt to cinch the waist." },
  { t: "Ruffled Off-Shoulder Dress", b: "atelier-mira", c: "women-dresses", p: 3490, cmp: 4490, sizes: W,
    colors: [["Ivory", "#F4F0E6", ["1515372039744-b8f02a3ae446"]]],
    tags: ["summer", "resort"], fabric: "Cotton poplin.",
    fit: "Elasticated neckline sits off the shoulder. Mini length.",
    care: "Machine wash cold. Warm iron.",
    d: "A crisp cotton mini with a tiered ruffle skirt and an elasticated off-shoulder neckline." },
  { t: "Puff-Sleeve Tiered Dress", b: "atelier-mira", c: "women-dresses", p: 5290, sizes: W,
    colors: [["Blush Dot", "#E8C4C4", ["1581044777550-4cfa60707c03"]]],
    tags: ["occasion", "print"], fabric: "Polka-dot georgette with a cotton lining.",
    fit: "Voluminous puff sleeves, relaxed through the body.",
    care: "Hand wash cold or dry clean.",
    d: "Georgette in a scattered blush dot, gathered into dramatic puff sleeves and a tiered skirt." },
  { t: "Wrap Maxi Dress", b: "atelier-mira", c: "women-dresses", p: 4990, cmp: 6490, sizes: ["S", "M", "L", "XL"],
    colors: [["Powder Blue", "#AFC6DC", ["1539008835657-9e8e9680c956"]]],
    tags: ["resort", "summer"], fabric: "Lightweight crepe.",
    fit: "True wrap with a long tie. Adjustable fit at the waist.",
    care: "Machine wash cold, gentle cycle.",
    d: "A true wrap dress in fluid crepe with a high side slit. Packs flat and never needs an iron." },
  { t: "Pleated Georgette Gown", b: "atelier-mira", c: "women-dresses", p: 9490, sizes: W,
    colors: [["Crimson", "#A4161A", ["1595777457583-95e059d581b8"]]],
    tags: ["occasion", "evening", "festive"], fabric: "Georgette with sunray pleats.",
    fit: "Fitted halter bodice with a full pleated skirt.",
    care: "Dry clean only. Store hanging.",
    d: "Hundreds of permanent sunray pleats give this halter gown its movement. A statement for weddings and festive evenings." },
  { t: "Tie-Neck Georgette Blouse", b: "atelier-mira", c: "women-tops", p: 2990, sizes: WX,
    colors: [["Ivory", "#F2EEE4", ["1608234807905-4466023792f5"]]],
    tags: ["workwear"], fabric: "Georgette.",
    fit: "Relaxed with long cuffed sleeves.",
    care: "Hand wash cold. Cool iron.",
    d: "A soft georgette blouse with a slim neck tie to wear as a bow or loose. Tucks neatly into tailored trousers." },
  { t: "Hand-Embroidered Cotton Shirt", b: "kaari-studio", c: "women-tops", p: 3290, sizes: WX,
    colors: [["White", "#FAFAF7", ["1564257631407-4deb1f99d992"]]],
    tags: ["handcrafted", "summer"], fabric: "Handwoven cotton with hand embroidery.",
    fit: "Boxy and cropped; wear open or knotted.",
    care: "Hand wash cold, inside out. Do not wring.",
    d: "Embroidered by hand with tiny wildflowers on handwoven cotton. Each piece takes an artisan around two days." },
  { t: "Linen Drawstring Trousers", b: "kaari-studio", c: "women-trousers", p: 2990, sizes: WX,
    colors: [["Olive", "#6B5E3C", ["1789110520148-bb52ba37759b"]], ["Mint", "#BFD8C9", ["1789110520410-4fce7246f844"]]],
    tags: ["linen", "summer"], fabric: "100% linen, garment washed.",
    fit: "High rise with a drawstring waist and cropped straight leg.",
    care: "Machine wash cold. Linen softens with every wash.",
    d: "Garment-washed linen trousers with a drawstring waist and deep pockets. The easiest thing to wear on a hot day." },
  { t: "Wide-Leg Pleated Trousers", b: "atelier-mira", c: "women-trousers", p: 3490, sizes: WX,
    colors: [["Sand", "#CDBA9A", ["1789110853687-71692f0e86be"]]],
    tags: ["workwear", "aw26"], fabric: "Crepe suiting with stretch.",
    fit: "High waist, double front pleats, full-length wide leg.",
    care: "Dry clean or hand wash cold.",
    d: "Pleated, wide and fluid. These high-waisted trousers make flat shoes look deliberate." },
  { t: "Satin Jogger Pants", b: "atelier-mira", c: "women-trousers", p: 2790, cmp: 3590, sizes: W,
    colors: [["Blush", "#E5B9A8", ["1594633312681-425c7b97ccd1"]]],
    tags: ["lounge"], fabric: "Satin-finish viscose.",
    fit: "Elasticated waist and cuffs. Relaxed through the leg.",
    care: "Machine wash cold, gentle cycle.",
    d: "Pull-on satin joggers with patch pockets. Dress them up with a blouse or down with a tee." },
  { t: "Crochet Knit Poncho", b: "northloom", c: "women-knitwear", p: 3990, sizes: ONE,
    colors: [["Cream", "#EFE6D2", ["1434389677669-e08b4cac3105"]]],
    tags: ["knitwear", "handcrafted"], fabric: "Hand-crocheted cotton.",
    fit: "One size, drapes to the hip with a fringed hem.",
    care: "Hand wash cold and dry flat.",
    d: "An open-stitch crochet poncho with a fringed hem, hand-made in cotton yarn." },
  { t: "Chunky Rib Sweater", b: "northloom", c: "women-knitwear", p: 5490, sizes: W, featured: true,
    colors: [["Ivory", "#EEE8DC", ["1574201635302-388dd92a4c3f"]], ["Oatmeal", "#D9CDB8", ["1588271968087-4c51abe05afc"]]],
    tags: ["knitwear", "aw26"], fabric: "Merino wool blend.",
    fit: "Oversized with dropped shoulders. Size down for a neater fit.",
    care: "Hand wash cold with wool wash. Dry flat.",
    d: "A thick rib knit in a merino blend with a high neck and long, slouchy sleeves." },
  { t: "Cable Knit Cardigan", b: "northloom", c: "women-knitwear", p: 5990, sizes: W,
    colors: [["Mauve", "#9C7F7A", ["1581497396202-5645e76a3a8e"]]],
    tags: ["knitwear", "aw26"], fabric: "Wool and alpaca blend.",
    fit: "Relaxed with a long body.",
    care: "Hand wash cold. Dry flat.",
    d: "Soft wool-alpaca cable knit with horn buttons. The cardigan you will keep reaching for." },
  { t: "Classic Cotton Trench Coat", b: "atelier-mira", c: "women-outerwear", p: 12990, sizes: W, featured: true,
    colors: [["Camel", "#B08D5F", ["1592327877233-90b9bfd92e48", "1589400445193-c881a4b0b38a"]], ["Taupe", "#7A6A5A", ["1676716105765-e19fe6a01851"]]],
    tags: ["aw26", "outerwear"], fabric: "Water-repellent cotton gabardine.",
    fit: "Double-breasted with a belted waist. Relaxed enough for knitwear underneath.",
    care: "Dry clean only.",
    d: "The trench, done properly: storm flap, epaulettes, a belt at the waist and cuffs, in water-repellent cotton gabardine." },
  { t: "Belted Wool Wrap Coat", b: "atelier-mira", c: "women-outerwear", p: 14490, sizes: W,
    colors: [["Caramel", "#B5835A", ["1550872199-63f4382fe925"]]],
    tags: ["aw26", "outerwear"], fabric: "Wool and recycled polyester blend.",
    fit: "Wrap front with a tie belt and wide lapels.",
    care: "Dry clean only.",
    d: "A soft, heavy wrap coat with no buttons to fuss with, only a wide tie belt." },
  { t: "Handwoven Silk Saree", b: "kaari-studio", c: "women-ethnic", p: 18900, sizes: ONE, featured: true, returnable: false,
    colors: [["Sage", "#9DB4A0", ["1679006831648-7c9ea12e5807"]], ["Aubergine", "#4B2C4F", ["1610030469983-98e550d6193c"]]],
    tags: ["handcrafted", "occasion", "festive"], fabric: "Pure silk with zari border. Includes an unstitched blouse piece.",
    fit: "5.5 m saree with 0.8 m blouse piece.",
    care: "Dry clean only. Store wrapped in muslin.",
    d: "Woven on a handloom over three weeks, with a contrast zari border and pallu. Slight irregularities are the mark of the hand." },
  // Men
  { t: "Washed Linen Shirt", b: "sable-row", c: "men-shirts", p: 3490, sizes: M, featured: true,
    colors: [["Navy", "#1F2A44", ["1740711152088-88a009e877bb"]], ["Sky", "#A9C6E3", ["1792007194806-72a27dd975b0"]]],
    tags: ["linen", "summer"], fabric: "100% European linen, garment washed.",
    fit: "Regular fit with a camp collar.",
    care: "Machine wash cold. Wear it creased.",
    d: "Garment-washed linen that feels broken-in from the first wear, with a relaxed camp collar and a single chest pocket." },
  { t: "Poplin Dress Shirt", b: "sable-row", c: "men-shirts", p: 2990, sizes: M,
    colors: [["White", "#FBFBF8", ["1598033129183-c4f50c736f10"]]],
    tags: ["workwear"], fabric: "Two-ply cotton poplin.",
    fit: "Slim fit with a cutaway collar.",
    care: "Machine wash warm. Iron while damp.",
    d: "A crisp two-ply poplin shirt with a cutaway collar and mitred cuffs. The one to wear with a tie." },
  { t: "Striped Cotton Shirt", b: "sable-row", c: "men-shirts", p: 2790, sizes: M,
    colors: [["Tobacco Stripe", "#7A5A3A", ["1791631064276-af27e842af6a"]]],
    tags: ["summer"], fabric: "Cotton seersucker.",
    fit: "Regular fit.",
    care: "Machine wash cold.",
    d: "Wide tobacco and ecru stripes on airy seersucker cotton that never looks ironed, and never needs to." },
  { t: "Oxford Button-Down Shirt", b: "sable-row", c: "men-shirts", p: 2690, cmp: 3290, sizes: M,
    colors: [["Grey", "#8B8F94", ["1602810318383-e386cc2a3ccf"]], ["White", "#F7F7F2", ["1602810318383-e386cc2a3ccf"]], ["Burgundy", "#6D1F2B", ["1602810318383-e386cc2a3ccf"]]],
    tags: ["workwear"], fabric: "Brushed cotton oxford.",
    fit: "Regular fit with a button-down collar.",
    care: "Machine wash warm.",
    d: "The oxford shirt every wardrobe is built on, in brushed cotton that softens with each wash." },
  { t: "Printed Chambray Shirt", b: "field-and-fold", c: "men-shirts", p: 2490, sizes: ["S", "M", "L", "XL"], status: "draft",
    colors: [["Chambray", "#5B7DA8", ["1596755094514-f87e34085b2c"]]],
    tags: ["summer", "print"], fabric: "Cotton chambray.",
    fit: "Relaxed fit.",
    care: "Machine wash cold.",
    d: "Lightweight chambray with a tiny scattered print. (Draft: not yet on the store.)" },
  { t: "Piped Jersey Tee", b: "field-and-fold", c: "men-tshirts", p: 1690, sizes: M,
    colors: [["Navy", "#1E2433", ["1622519407650-3df9883f76a5"]]],
    tags: ["essentials"], fabric: "Heavyweight cotton jersey.",
    fit: "Boxy fit with contrast piping.",
    care: "Machine wash cold.",
    d: "A heavyweight tee with contrast piping at the collar and sleeves, inspired by vintage sportswear." },
  { t: "Merino Crew Sweater", b: "northloom", c: "men-knitwear", p: 4990, sizes: M, featured: true,
    colors: [["Rust", "#8A4B2E", ["1773747310662-e7cc9e681226"]], ["Grey Melange", "#B7B5B1", ["1604573824419-289a9a10672c"]]],
    tags: ["knitwear", "aw26"], fabric: "Extra-fine merino wool.",
    fit: "Regular fit.",
    care: "Hand wash cold or machine wash on a wool cycle. Dry flat.",
    d: "Fine-gauge merino that layers under a jacket or wears alone. Breathable, warm and never itchy." },
  { t: "Straight-Leg Selvedge Jeans", b: "field-and-fold", c: "men-trousers", p: 3990, sizes: ["28", "30", "32", "34", "36"], guide: "trousers",
    colors: [["Indigo Rinse", "#1E2A3A", ["1624378439575-d8705ad7ae80"]]],
    tags: ["denim"], fabric: "13.5 oz Japanese selvedge denim.",
    fit: "Mid rise, straight leg. Will stretch slightly with wear.",
    care: "Wash rarely, inside out, cold.",
    d: "Rigid selvedge denim that fades to fit you. Straight through the leg with a mid rise." },
  { t: "Cotton Twill Joggers", b: "field-and-fold", c: "men-trousers", p: 2490, sizes: M,
    colors: [["Khaki", "#B8A07E", ["1473966968600-fa801b869a1a"]]],
    tags: ["essentials"], fabric: "Stretch cotton twill.",
    fit: "Tapered with elasticated cuffs.",
    care: "Machine wash cold.",
    d: "Chino fabric, jogger comfort. A tapered leg with a drawstring waist." },
  { t: "Denim Trucker Jacket", b: "field-and-fold", c: "men-outerwear", p: 4590, cmp: 5990, sizes: M,
    colors: [["Indigo", "#2B3A55", ["1611312449408-fcece27cdbb7"]]],
    tags: ["denim", "aw26"], fabric: "Rigid cotton denim with a corduroy collar.",
    fit: "Classic fit, hits at the hip.",
    care: "Machine wash cold, inside out.",
    d: "A trucker jacket in rigid denim with a corduroy collar and copper shank buttons." },
  { t: "Leather Biker Jacket", b: "sable-row", c: "men-outerwear", p: 18990, sizes: ["S", "M", "L", "XL"],
    colors: [["Black", "#121212", ["1551028719-00167b16eac5"]]],
    tags: ["aw26", "outerwear"], fabric: "Full-grain lambskin leather with a cotton lining.",
    fit: "Close fit. Size up to wear over knitwear.",
    care: "Specialist leather clean only.",
    d: "An asymmetric biker in supple lambskin with silver zips. It only gets better with age." },
  { t: "Satin Bomber Jacket", b: "field-and-fold", c: "men-outerwear", p: 4290, sizes: ["S", "M", "L", "XL"],
    colors: [["Copper", "#B0673F", ["1591047139829-d91aecb6caea"]]],
    tags: ["outerwear"], fabric: "Satin shell with a quilted lining.",
    fit: "Relaxed with ribbed cuffs and hem.",
    care: "Machine wash cold, gentle cycle.",
    d: "A lightweight bomber in a copper satin, with a utility sleeve pocket." },
  { t: "Single-Breasted Overcoat", b: "sable-row", c: "men-outerwear", p: 15990, sizes: ["S", "M", "L", "XL"], scheduled: true,
    colors: [["Camel", "#B4875A", ["1619603364904-c0498317e145"]]],
    tags: ["aw26", "outerwear"], fabric: "Wool and cashmere blend.",
    fit: "Regular fit, falls below the knee.",
    care: "Dry clean only.",
    d: "A camel overcoat in a wool-cashmere blend. (Scheduled: goes live a week after the seed runs.)" },
  { t: "Tailored Wool-Blend Blazer", b: "sable-row", c: "men-outerwear", p: 12490, sizes: ["38", "40", "42", "44"], guide: "blazer",
    colors: [["Navy", "#1D2B4A", ["1617137968427-85924c800a22"]]],
    tags: ["workwear", "occasion"], fabric: "Wool blend with a half canvas.",
    fit: "Tailored fit with natural shoulders.",
    care: "Dry clean only.",
    d: "A half-canvassed blazer with natural shoulders and patch pockets. Pairs with its own trousers or with denim." },
  { t: "Silk-Blend Kurta Set", b: "kaari-studio", c: "men-ethnic", p: 6490, sizes: M,
    colors: [["Royal Blue", "#24479B", ["1770359993283-a2c2f386584e"]]],
    tags: ["festive", "occasion", "handcrafted"], fabric: "Silk-cotton blend kurta with cotton pyjama.",
    fit: "Classic fit kurta to the knee.",
    care: "Dry clean recommended.",
    d: "A festive kurta set in a lustrous silk-cotton blend, with a mandarin collar and concealed placket." },
  { t: "Printed Cotton Kurta", b: "kaari-studio", c: "men-ethnic", p: 2890, sizes: M,
    colors: [["Mint Print", "#BFE0C8", ["1727835523545-70ee992b5763"]], ["Slate", "#7D8288", ["1785613590746-f57d638c7d38"]]],
    tags: ["festive", "summer", "handcrafted"], fabric: "Hand block-printed cotton.",
    fit: "Relaxed fit, mid-thigh length.",
    care: "Hand wash cold separately; block prints may bleed at first.",
    d: "Hand block-printed cotton kurta, light enough for summer days and smart enough for celebrations." },
  // Unisex
  { t: "Organic Cotton Crew Tee", b: "field-and-fold", c: "unisex-essentials", p: 1290, sizes: ["XS", "S", "M", "L", "XL", "XXL"], featured: true,
    colors: [
      ["White", "#FAFAF8", ["1521572163474-6864f9cf17ab", "1562157873-818bc0726f68"]],
      ["Black", "#151515", ["1562157873-818bc0726f68"]],
      ["Navy", "#1F2A48", ["1562157873-818bc0726f68"]],
      ["Burgundy", "#6E1E2C", ["1562157873-818bc0726f68"]],
      ["Mustard", "#D9A62E", ["1562157873-818bc0726f68"]],
    ],
    tags: ["essentials", "organic"], fabric: "180 gsm organic cotton jersey, GOTS certified.",
    fit: "Regular fit for everyone. Size down for a closer fit.",
    care: "Machine wash cold. Tumble dry low.",
    d: "A mid-weight tee in organic cotton that holds its shape wash after wash. Designed to fit every body." },
  { t: "Heavyweight Cotton Sweatshirt", b: "field-and-fold", c: "unisex-essentials", p: 2690, sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    colors: [["Off-White", "#F2EFE8", ["1620799140408-edc6dcb6d633"]]],
    tags: ["essentials", "aw26"], fabric: "400 gsm brushed-back cotton fleece.",
    fit: "Relaxed fit with ribbed cuffs and hem.",
    care: "Machine wash cold, inside out.",
    d: "A thick, brushed-back sweatshirt with a relaxed shape. Gets softer every time you wash it." },
  // Accessories
  { t: "Everyday Leather Tote", b: "lumen-leather", c: "accessories-bags", p: 7490, sizes: ONE, featured: true,
    colors: [["Tan", "#A0632F", ["1624687943971-e86af76d57de", "1760624294504-211e763ee0fb"]]],
    tags: ["leather"], fabric: "Vegetable-tanned leather, unlined.",
    fit: "38 x 33 x 12 cm. Fits a 14-inch laptop.",
    care: "Wipe with a dry cloth. Condition twice a year.",
    d: "A roomy, unlined tote in vegetable-tanned leather that darkens to a rich patina. Inside zip pocket." },
  { t: "Tweed Weekender Tote", b: "lumen-leather", c: "accessories-bags", p: 8990, sizes: ONE,
    colors: [["Forest Tweed", "#4E5B3F", ["1774389080971-01bf5d938a92"]]],
    tags: ["leather", "aw26"], fabric: "Wool tweed with leather trims.",
    fit: "45 x 30 x 18 cm.",
    care: "Spot clean only.",
    d: "A structured weekender in wool tweed with green leather handles and trims." },
  { t: "Canvas Day Backpack", b: "field-and-fold", c: "accessories-bags", p: 3290, sizes: ONE,
    colors: [["Navy", "#1F2A44", ["1553062407-98eeb64c6a62"]]],
    tags: ["essentials"], fabric: "Waxed cotton canvas.",
    fit: "18 litres with a padded laptop sleeve.",
    care: "Spot clean. Re-wax yearly.",
    d: "A minimal daypack in water-resistant waxed canvas with a padded sleeve for a 15-inch laptop." },
  { t: "Woven Leather Belt", b: "lumen-leather", c: "accessories-belts", p: 1990, sizes: ["S", "M", "L"],
    colors: [["Tan", "#9A5B2E", ["1711443982852-b3df5c563448"]]],
    tags: ["leather"], fabric: "Hand-braided leather with a brass buckle.",
    fit: "3.5 cm wide.",
    care: "Wipe clean. Condition occasionally.",
    d: "Braided by hand from strips of soft leather, so it fastens at any point." },
  { t: "Classic Buckle Belt", b: "lumen-leather", c: "accessories-belts", p: 1790, sizes: ["S", "M", "L"],
    colors: [["Cognac", "#8B4A2B", ["1624222247344-550fb60583dc", "1705493655920-20c572928501"]]],
    tags: ["leather"], fabric: "Full-grain leather with a nickel-free buckle.",
    fit: "3 cm wide.",
    care: "Wipe clean. Condition occasionally.",
    d: "A full-grain leather belt with a polished square buckle. Smart enough for tailoring, easy with denim." },
  { t: "Gold Teardrop Earrings", b: "kaari-studio", c: "accessories-jewellery", p: 2490, sizes: ONE, returnable: false,
    colors: [["Gold", "#C9A646", ["1727990865600-91f8cb8b0168"]]],
    tags: ["jewellery"], fabric: "18k gold-plated brass. Nickel free.",
    fit: "2.5 cm drop, push-back fastening.",
    care: "Keep dry. Store in the pouch provided.",
    d: "Polished, puffed teardrops that catch the light. Earrings cannot be returned for hygiene reasons." },
  { t: "Temple Jhumka Earrings", b: "kaari-studio", c: "accessories-jewellery", p: 3190, sizes: ONE, returnable: false,
    colors: [["Antique Gold", "#B8913F", ["1626784215013-13322cb0e471"]]],
    tags: ["jewellery", "festive"], fabric: "Gold-plated brass with hand-set details.",
    fit: "4 cm drop, hook fastening.",
    care: "Keep away from perfume and water.",
    d: "Traditional temple-style jhumkas with a granulated dome and fine drops. Earrings cannot be returned for hygiene reasons." },
  { t: "Filigree Stud Earrings", b: "kaari-studio", c: "accessories-jewellery", p: 1890, sizes: ONE, returnable: false,
    colors: [["Rose Gold", "#C99A84", ["1701777892740-88419a701472"]]],
    tags: ["jewellery"], fabric: "Rose gold-plated silver filigree.",
    fit: "1.5 cm, hook fastening.",
    care: "Polish gently with a soft cloth.",
    d: "Delicate filigree flowers worked by hand in fine silver wire. Earrings cannot be returned for hygiene reasons." },
  { t: "Handloom Cotton Stole", b: "kaari-studio", c: "accessories-scarves", p: 1990, sizes: ONE,
    colors: [["Indigo", "#2E3F6E", ["1761369332487-777e59fa4bcf"]], ["Saffron", "#E39B2D", ["1761369332487-777e59fa4bcf"]], ["Emerald", "#2E7D5B", ["1761369332487-777e59fa4bcf"]]],
    tags: ["handcrafted", "summer"], fabric: "Handwoven cotton.",
    fit: "200 x 70 cm with tasselled ends.",
    care: "Hand wash cold separately.",
    d: "Light handwoven cotton stoles with tasselled ends, dyed in small batches." },
];

const collections = [
  { slug: "autumn-winter-26", title: "Autumn / Winter '26", kind: "automated", seasonal: true, season: "Autumn/Winter 2026", featured: true, sort: 1,
    rules: { match: "all", conditions: [{ field: "tag", op: "equals", value: "aw26" }] },
    banner: wide("1617733401065-c7bdf0b33417"), image: tall("1617733401065-c7bdf0b33417"),
    description: "Trench coats, merino and heavy rib knits in a palette of camel, rust and oat. Layers for the cooler months." },
  { slug: "the-occasion-edit", title: "The Occasion Edit", kind: "manual", featured: true, sort: 2,
    products: ["Pleated Georgette Gown", "Bias-Cut Satin Slip Dress", "Handwoven Silk Saree", "Liquid Satin Maxi Dress", "Silk-Blend Kurta Set", "Puff-Sleeve Tiered Dress", "Tailored Wool-Blend Blazer", "Temple Jhumka Earrings"],
    banner: wide("1790802243983-e6de0e275f59"), image: tall("1790802243983-e6de0e275f59"),
    description: "Satin, silk and sharp tailoring for weddings, festivals and evenings out." },
  { slug: "linen-and-light", title: "Linen & Light", kind: "automated", seasonal: true, season: "Summer", sort: 3,
    rules: { match: "any", conditions: [{ field: "tag", op: "equals", value: "linen" }, { field: "tag", op: "equals", value: "summer" }] },
    banner: wide("1792007194806-72a27dd975b0"), image: tall("1792007194806-72a27dd975b0"),
    description: "Garment-washed linen, voile and seersucker. Breathable pieces for hot days." },
  { slug: "handcrafted-in-india", title: "Handcrafted in India", kind: "automated", featured: true, sort: 4,
    rules: { match: "all", conditions: [{ field: "tag", op: "equals", value: "handcrafted" }] },
    banner: wide("1761369332487-777e59fa4bcf"), image: tall("1761369332487-777e59fa4bcf"),
    description: "Handloom, hand embroidery, block print and handmade jewellery from artisan workshops." },
  { slug: "under-3000", title: "Under ₹3,000", kind: "automated", featured: true, sort: 5,
    rules: { match: "all", conditions: [{ field: "price", op: "lt", value: "300000" }] },
    banner: wide("1562157873-818bc0726f68"), image: tall("1562157873-818bc0726f68"),
    description: "Everyday favourites under ₹3,000." },
  { slug: "workwear", title: "Workwear", kind: "automated", sort: 6,
    rules: { match: "all", conditions: [{ field: "tag", op: "equals", value: "workwear" }] },
    banner: wide("1613915617430-8ab0fd7c6baf"), image: tall("1613915617430-8ab0fd7c6baf"),
    description: "Crisp shirting, fluid blouses and tailoring for the working week." },
];

const colorCode = (name) => name.replace(/[^A-Za-z ]/g, "").split(" ").map((w) => w.slice(0, 3)).join("").toUpperCase().slice(0, 6);
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Deterministic "random" stock so the seed is stable between runs.
function stockFor(sku) {
  let h = 0;
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 100;
  if (r < 6) return 0;
  if (r < 16) return 1 + (h % 3);
  return 6 + (h % 20);
}

const out = [];
out.push(`-- Sample catalog for development and demos. Generated by scripts/generate-seed.mjs;
-- edit that file and re-run it rather than editing this one.
--
-- Everything here is flagged is_sample and can be removed from Admin > Settings >
-- Sample data. Brands and products are fictional. Photos: Unsplash (unsplash.com/license).
`);

out.push("-- Size guides");
for (const g of sizeGuides) {
  out.push(`insert into public.size_guides (name, unit, columns, rows, how_to_measure, is_sample) values (${q(g.name)}, ${q(g.unit)}, ${arr(g.columns)}, ${json(g.rows)}, ${q(g.how)}, true);`);
}
const guideRef = (key) => `(select id from public.size_guides where name = ${q(sizeGuides.find((g) => g.key === key).name)})`;

out.push("\n-- Brands");
brands.forEach((b, i) => {
  out.push(`insert into public.brands (name, slug, description, banner_url, is_featured, sort_order, is_sample) values (${q(b.name)}, ${q(b.slug)}, ${q(b.description)}, ${q(b.banner)}, ${b.featured}, ${i + 1}, true);`);
});

out.push("\n-- Categories (departments first, then their product types)");
for (const c of categories) {
  out.push(`insert into public.categories (parent_id, name, slug, description, image_url, banner_url, size_guide_id, sort_order, is_sample) values (${
    c.parent ? `(select id from public.categories where slug = ${q(c.parent)})` : "null"
  }, ${q(c.name)}, ${q(c.slug)}, ${q(c.description || "")}, ${q(c.image || null)}, ${q(c.banner || null)}, ${c.guide ? guideRef(c.guide) : "null"}, ${c.sort}, true);`);
}

out.push("\n-- Products, images and variants");
products.forEach((p, i) => {
  const brand = brands.find((b) => b.slug === p.b);
  const slug = slugify(p.t);
  const status = p.status || "active";
  // Newest products first: spread publication over the last few weeks.
  const published = p.scheduled ? "now() + interval '7 days'" : status === "active" ? `now() - interval '${(i * 19) % 60} days' - interval '${i} hours'` : "null";
  out.push(`insert into public.products (title, slug, brand_id, category_id, size_guide_id, description, fabric, fit, care, tags, status, published_at, is_featured, price, compare_at_price, is_returnable, is_sample) values (${q(p.t)}, ${q(slug)}, (select id from public.brands where slug = ${q(p.b)}), (select id from public.categories where slug = ${q(p.c)}), ${p.guide ? guideRef(p.guide) : "null"}, ${q(p.d)}, ${q(p.fabric)}, ${q(p.fit)}, ${q(p.care)}, ${arr(p.tags)}, '${status}', ${published}, ${!!p.featured}, ${p.p * 100}, ${p.cmp ? p.cmp * 100 : "null"}, ${p.returnable !== false}, true);`);
  // Each photo is stored once. A photo used by a single colour is tagged with it, so the
  // product page shows it when that colour is picked; shared photos have no colour.
  const ids = [...new Set(p.colors.flatMap(([, , list]) => list))];
  ids.forEach((id, pos) => {
    const owners = p.colors.filter(([, , list]) => list.includes(id)).map(([name]) => name);
    const color = owners.length === 1 ? owners[0] : null;
    const alt = color && p.colors.length > 1 ? `${p.t} in ${color.toLowerCase()}` : p.t;
    out.push(`insert into public.product_images (product_id, url, alt, color, position) values ((select id from public.products where slug = ${q(slug)}), ${q(img(id))}, ${q(alt)}, ${q(color)}, ${pos});`);
  });
  let vpos = 0;
  for (const [color, hex] of p.colors) {
    for (const size of p.sizes) {
      const sku = [brand.code, String(i + 1).padStart(3, "0"), colorCode(color), size].filter(Boolean).join("-");
      out.push(`insert into public.product_variants (product_id, sku, size, color, color_hex, stock_quantity, position) values ((select id from public.products where slug = ${q(slug)}), ${q(sku)}, ${q(size)}, ${q(color)}, ${q(hex)}, ${stockFor(sku)}, ${vpos++});`);
    }
  }
});

out.push("\n-- Collections");
for (const c of collections) {
  out.push(`insert into public.collections (title, slug, description, image_url, banner_url, kind, rules, is_seasonal, season, is_featured, sort_order, is_sample) values (${q(c.title)}, ${q(c.slug)}, ${q(c.description)}, ${q(c.image)}, ${q(c.banner)}, '${c.kind}', ${json(c.rules || { match: "all", conditions: [] })}, ${!!c.seasonal}, ${q(c.season || "")}, ${!!c.featured}, ${c.sort}, true);`);
  (c.products || []).forEach((title, pos) => {
    out.push(`insert into public.collection_products (collection_id, product_id, position) values ((select id from public.collections where slug = ${q(c.slug)}), (select id from public.products where slug = ${q(slugify(title))}), ${pos});`);
  });
}

out.push(`
-- Sample coupons
insert into public.coupons (code, description, kind, value, max_discount, min_subtotal, usage_limit_per_customer, first_order_only, is_sample)
values ('WELCOME10', '10% off your first order over ₹1,999 (up to ₹1,500).', 'percentage', 1000, 150000, 199900, 1, true, true);
insert into public.coupons (code, description, kind, value, min_subtotal, usage_limit, is_sample)
values ('FLAT500', '₹500 off orders over ₹4,999.', 'fixed', 50000, 499900, 500, true);
insert into public.coupons (code, description, kind, value, min_subtotal, is_sample)
values ('FREESHIP', 'Free delivery on any order over ₹999.', 'free_shipping', 0, 99900, true);
insert into public.coupons (code, description, kind, value, applies_to, collection_ids, is_sample)
values ('CRAFT15', '15% off everything handcrafted in India.', 'percentage', 1500, 'collections',
        array[(select id from public.collections where slug = 'handcrafted-in-india')], true);

-- Sample delivery zone: faster delivery to six metro areas (higher priority than the
-- default All India zone created by the migrations).
insert into public.shipping_zones (name, postal_prefixes, priority, is_sample)
values ('Metro cities (sample)', array['11', '40', '56', '60', '70', '50'], 10, true);
insert into public.shipping_rates (zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
select id, 'Standard', 'Tracked delivery', 7900, 299900, 2, 4, true, 1 from public.shipping_zones where name = 'Metro cities (sample)';
insert into public.shipping_rates (zone_id, name, description, price, min_days, max_days, cod_available, sort_order)
select id, 'Express', 'Next-day delivery for orders placed before 2pm', 19900, 1, 2, false, 2 from public.shipping_zones where name = 'Metro cities (sample)';
insert into public.postal_code_rules (postal_code, blocks, note) values ('744101', 'all', 'Sample rule: not serviceable');
insert into public.postal_code_rules (postal_code, blocks, note) values ('110001', 'cod', 'Sample rule: prepaid only');

-- Sample storefront content
update public.store_settings set
  free_shipping_threshold = 299900,
  homepage = ${json({
    announcement: "Complimentary delivery on orders over ₹2,999 · Easy 15-day returns",
    hero: [
      {
        sample: true,
        eyebrow: "Autumn / Winter '26",
        heading: "The quiet season",
        subheading: "Camel, oat and rust. Trench coats, heavy knits and tailoring made to be worn for years.",
        cta_label: "Shop the collection",
        cta_href: "/collections/autumn-winter-26",
        secondary_label: "New arrivals",
        secondary_href: "/shop?sort=newest",
        image_url: img("1779406165962-7df12de281b1", "4:5"),
        image_alt: "Model in a camel suit and long coat",
      },
      {
        sample: true,
        eyebrow: "Handcrafted in India",
        heading: "Made by hand, slowly",
        subheading: "Handloom silk, block print and filigree from the artisans of Kaari Studio.",
        cta_label: "Discover the edit",
        cta_href: "/collections/handcrafted-in-india",
        image_url: img("1679006831648-7c9ea12e5807", "4:5"),
        image_alt: "Woman wearing a sage handwoven silk saree",
      },
    ],
    promos: [
      { sample: true, eyebrow: "The Occasion Edit", heading: "Dressed for the evening", cta_label: "Shop occasionwear", cta_href: "/collections/the-occasion-edit", image_url: img("1790802243983-e6de0e275f59", "4:5"), image_alt: "Silver satin maxi dress" },
      { sample: true, eyebrow: "Knitwear", heading: "Layers for cooler days", cta_label: "Shop knitwear", cta_href: "/shop?q=knit", image_url: img("1641642231157-0849081598a2", "4:5"), image_alt: "A stack of knitted sweaters" },
      { sample: true, eyebrow: "Under ₹3,000", heading: "Everyday essentials", cta_label: "Shop now", cta_href: "/collections/under-3000", image_url: img("1562157873-818bc0726f68", "4:5"), image_alt: "Folded cotton t-shirts in six colours" },
    ],
  })},
  og_image_url = ${q(img("1779406165962-7df12de281b1", "1.91:1"))}
where id = 1;
`);

const target = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));
writeFileSync(target, out.join("\n") + "\n");
console.log(`Wrote ${target}: ${products.length} products, ${brands.length} brands, ${collections.length} collections.`);
