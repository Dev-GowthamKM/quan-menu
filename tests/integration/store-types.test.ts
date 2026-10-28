// Stores of every kind: what a store sells is its own setting (anyone may read it, only its
// admins change it), a new store starts with departments and starter text in the words of
// what it sells, the sample catalog files into departments a store already has, and a
// product's own names for its options are the staff's to set and reach its page.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { storeKind } from "../../src/lib/store-types";
import { anon, homeStoreId, makeProduct, makeUser, signedInAt, sql, storeClient, type TestUser } from "./helpers";

let home: string;
let platformAdmin: TestUser;
let admin: TestUser;
let customer: TestUser;

const letters = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");

/** A store of the given kind, as Platform › New store makes one. */
async function createStore(name: string, type: string, departments: boolean) {
  const kind = storeKind(type);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await platformAdmin.client.rpc("platform_create_store", {
      p: {
        name, slug: `t-${randomUUID().slice(0, 8)}`, order_prefix: letters(), store_type: type,
        kind: { about: kind.words.about, return_condition: kind.returnCondition, no_returns: kind.noReturns, faq_q: kind.faq.q, faq_a: kind.faq.a },
        departments: departments ? kind.departments : [],
      },
    });
    if (!error) return data as string;
    if (!/duplicate_prefix/.test(error.message)) throw error;
  }
  throw new Error("Couldn't pick a free order prefix.");
}

beforeAll(async () => {
  home = await homeStoreId();
  platformAdmin = await makeUser("owner", "Kinds Platform Admin");
  await sql("insert into public.platform_admins (user_id) values ($1)", [platformAdmin.id]);
  [admin, customer] = await Promise.all([makeUser("admin", "Kinds Admin"), makeUser(undefined, "Kinds Customer")]);
});

describe("what a store sells", () => {
  it("starts a pet shop with its departments and starter text in a pet shop's words", async () => {
    const id = await createStore("Wag and Purr", "pets", true);
    const [s] = await sql<{ store_type: string; returns: string; about: string; faq: { q: string }[] }>(
      "select store_type, policies ->> 'returns' as returns, policies ->> 'about' as about, faq from public.store_settings where store_id = $1",
      [id],
    );
    expect(s.store_type).toBe("pets");
    expect(s.about).toMatch(/^Wag and Purr brings together food, toys and everyday things for pets/);
    expect(s.returns).toContain("unused items in their original packaging");
    expect(s.returns).toContain("Opened food and treats cannot be returned.");
    expect(s.faq.map((f) => f.q)).toContain("Which size suits my pet?");
    const departments = await sql<{ name: string; slug: string; is_published: boolean; parent_id: string | null }>(
      "select name, slug, is_published, parent_id from public.categories where store_id = $1 order by sort_order",
      [id],
    );
    expect(departments.map((d) => d.name)).toEqual(["Dogs", "Cats", "Birds and small pets", "Food and treats"]);
    expect(departments.every((d) => d.is_published && d.parent_id === null)).toBe(true);
    expect(departments[2].slug).toBe("birds-and-small-pets");
    // Its shoppers' storefront reads the kind (store settings are public).
    const { data } = await storeClient(id).from("store_settings").select("store_type").eq("store_id", id).single();
    expect(data?.store_type).toBe("pets");
  });

  it("keeps a clothing store's words for callers that send no kind, and checks the name", async () => {
    const plain = await createStore("Plain Threads", "fashion", false);
    const [s] = await sql<{ store_type: string; returns: string; n: string }>(
      "select store_type, policies ->> 'returns' as returns, (select count(*) from public.categories where store_id = $1) as n from public.store_settings where store_id = $1",
      [plain],
    );
    expect(s).toEqual({ store_type: "fashion", returns: expect.stringContaining("unworn items with their tags"), n: "0" });
    const bad = await platformAdmin.client.rpc("platform_create_store", { p: { name: "Bad Kind", slug: `b-${randomUUID().slice(0, 8)}`, order_prefix: letters(), store_type: "Pets!" } });
    expect(bad.error?.message).toBe("invalid_store_type");
    await expect(sql("update public.store_settings set store_type = 'Not a kind!' where store_id = $1", [plain])).rejects.toThrow(/check constraint/);
  });

  it("is changed by the store's admins, never by its customers", async () => {
    const before = (await sql<{ store_type: string }>("select store_type from public.store_settings where store_id = $1", [home]))[0].store_type;
    try {
      await (await signedInAt(customer, home)).from("store_settings").update({ store_type: "instruments" }).eq("store_id", home);
      expect((await sql<{ store_type: string }>("select store_type from public.store_settings where store_id = $1", [home]))[0].store_type).toBe(before);
      const { error } = await (await signedInAt(admin, home)).from("store_settings").update({ store_type: "instruments" }).eq("store_id", home);
      expect(error).toBeNull();
      expect((await sql<{ store_type: string }>("select store_type from public.store_settings where store_id = $1", [home]))[0].store_type).toBe("instruments");
    } finally {
      await sql("update public.store_settings set store_type = $2 where store_id = $1", [home, before]);
    }
  });

  it("files the sample catalog under the departments a store already has", async () => {
    const id = await createStore("Starter Rail", "fashion", true);
    const [women] = await sql<{ id: string }>("select id from public.categories where store_id = $1 and slug = 'women'", [id]);
    const added = await platformAdmin.client.rpc("platform_add_samples", { p_store_id: id });
    expect(added.error).toBeNull();
    // One "women" department, the store's own, now holding the sample pieces filed there.
    const same = await sql<{ id: string }>("select id from public.categories where store_id = $1 and slug = 'women'", [id]);
    expect(same).toEqual([women]);
    const [filed] = await sql<{ n: string }>(
      `select count(*) as n from public.products p join public.categories c on c.id = p.category_id
       where p.store_id = $1 and p.is_sample and (c.id = $2 or c.parent_id = $2)`,
      [id, women.id],
    );
    expect(Number(filed.n)).toBeGreaterThan(0);
    const [stray] = await sql<{ n: string }>(
      "select count(*) as n from public.products p join public.categories c on c.id = p.category_id where p.store_id = $1 and c.store_id <> $1",
      [id],
    );
    expect(stray.n).toBe("0");
  });
});

describe("a product's own option names", () => {
  it("are set by staff, not customers, kept short, and reach the product page", async () => {
    const product = await makeProduct();
    const page = async () => ((await anon().rpc("get_product_page", { p_slug: product.slug })).data as { option_names: unknown }).option_names;
    expect(await page()).toEqual({});

    await customer.client.from("products").update({ option_names: { size: "Hacked" } }).eq("id", product.productId);
    expect(await page()).toEqual({});
    const { error } = await admin.client.from("products").update({ option_names: { size: "Pack size", color: "Flavour" } }).eq("id", product.productId);
    expect(error).toBeNull();
    expect(await page()).toEqual({ size: "Pack size", color: "Flavour" });

    const long = await admin.client.from("products").update({ option_names: { size: "x".repeat(31) } }).eq("id", product.productId);
    expect(long.error?.message).toMatch(/check constraint/);
    await expect(sql("update public.products set option_names = '[]'::jsonb where id = $1", [product.productId])).rejects.toThrow(/check constraint/);
  });
});
