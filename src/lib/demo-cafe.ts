import { fillFromList } from "./dishes";
import { DEFAULT_TOPPINGS } from "./drinks";
import type { Dish, MenuData } from "./types";

/** Example milk-tea and coffee shop, shown at /m/demo-cafe. Built from the dish list so translations stay in one place. */
const ITEMS: [string, number][] = [
  ["Trà sữa trân châu", 35000],
  ["Trà sữa trân châu đường đen", 42000],
  ["Trà sữa matcha", 40000],
  ["Trà đào", 35000],
  ["Trà vải", 35000],
  ["Cà phê sữa đá", 25000],
  ["Bạc xỉu", 29000],
  ["Cà phê muối", 32000],
  ["Sinh tố xoài", 39000],
];

const dishes: Dish[] = ITEMS.map(([vi, price]) =>
  fillFromList({ vi, price, spice: 0, alg: [], pron: "", name: null, desc: null }, "tea"),
).filter((d): d is Dish => !!d);

// Coffee is sold in one size here, with sugar and ice choices only.
for (const d of dishes) {
  if (d.vi === "Trà sữa trân châu đường đen") d.special = true;
  if (/^(Cà phê|Bạc xỉu)/.test(d.vi)) d.opts = { sugar: true, ice: true };
  if (d.vi.startsWith("Sinh tố")) d.opts = { sugar: true };
}

export const EXAMPLE_CAFE: MenuData = {
  name: "Trà Sữa Mây",
  area: "Lê Lợi, Quận 1",
  slug: "demo-cafe",
  published: true,
  kind: "tea",
  toppings: DEFAULT_TOPPINGS,
  dishes,
};
