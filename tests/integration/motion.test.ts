// Motion: banner films go into the catalog's storage like pictures (only a store's own staff,
// only real videos), and a product's 360° view is the staff's choice and reaches its page.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, homeStoreId, makeProduct, makeUser, type TestUser } from "./helpers";

let home: string;
let admin: TestUser;
let customer: TestUser;

beforeAll(async () => {
  home = await homeStoreId();
  [admin, customer] = await Promise.all([makeUser("admin", "Film Admin"), makeUser(undefined, "Film Customer")]);
});

const put = (who: TestUser, bytes: BlobPart, type: string, ext: string) =>
  who.client.storage.from("catalog").upload(`${home}/homepage/${randomUUID()}.${ext}`, new Blob([bytes], { type }), { contentType: type });
const FILM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

describe("banner films", () => {
  it("can be uploaded as MP4 or WebM by the store's staff", async () => {
    expect((await put(admin, FILM, "video/webm", "webm")).error).toBeNull();
    expect((await put(admin, FILM, "video/mp4", "mp4")).error).toBeNull();
  });

  it("can't be uploaded by customers, and nothing but pictures and videos can", async () => {
    expect((await put(customer, FILM, "video/webm", "webm")).error).not.toBeNull();
    const page = "<script>alert(1)</script>";
    expect((await put(admin, page, "text/html", "html")).error).not.toBeNull();
    expect((await put(admin, page, "image/svg+xml", "svg")).error).not.toBeNull();
  });
});

describe("the 360° view", () => {
  it("is off until staff turn it on, and the product page says when it's on", async () => {
    const product = await makeProduct();
    const before = await anon().rpc("get_product_page", { p_slug: product.slug });
    expect((before.data as { spin: boolean }).spin).toBe(false);

    // Customers can't switch it on; staff can.
    await customer.client.from("products").update({ spin: true }).eq("id", product.productId);
    expect(((await anon().rpc("get_product_page", { p_slug: product.slug })).data as { spin: boolean }).spin).toBe(false);
    const { error } = await admin.client.from("products").update({ spin: true }).eq("id", product.productId);
    expect(error).toBeNull();
    expect(((await anon().rpc("get_product_page", { p_slug: product.slug })).data as { spin: boolean }).spin).toBe(true);
  });
});
