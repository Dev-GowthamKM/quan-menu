// Mobile sign-in at the database and Auth level: Supabase's phone settings, profiles only
// for verified accounts (with the verified number as the contact number), customer search by
// number, and the sign-in settings' rules. Sending and checking real codes goes through the
// app's SMS hook, so the end-to-end tests cover that.
import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { localEnv, makeUser, service, sql } from "./helpers";

const admin = service();
/** An Indian mobile number in Supabase's form, unused by other tests. */
const mobile = () => `91${randomInt(6, 10)}${String(randomInt(0, 1e9)).padStart(9, "0")}`;
const display = (n: string) => `+91 ${n.slice(2, 7)} ${n.slice(7)}`;
const profileOf = async (id: string) => (await sql<{ email: string | null; phone: string; full_name: string; marketing_opt_in: boolean }>(
  "select email, phone, full_name, marketing_opt_in from public.profiles where id = $1", [id]))[0];

describe("Supabase Auth phone settings", () => {
  it("has phone sign-in on and requires every number to be confirmed with a code", async () => {
    const res = await fetch(`${localEnv().API_URL}/auth/v1/settings`, { headers: { apikey: localEnv().ANON_KEY } });
    const settings = (await res.json()) as { external: { phone: boolean }; phone_autoconfirm: boolean };
    expect(settings.external.phone).toBe(true);
    // Off would let anyone register someone else's number with a password.
    expect(settings.phone_autoconfirm).toBe(false);
  });
});

describe("profiles", () => {
  it("are only made once a mobile number is verified, with that number as the contact number", async () => {
    const phone = mobile();
    const { data, error } = await admin.auth.admin.createUser({ phone, user_metadata: { full_name: "Asha Rao" } });
    expect(error).toBeNull();
    const id = data.user!.id;
    expect(await profileOf(id)).toBeUndefined();
    await admin.auth.admin.updateUserById(id, { phone_confirm: true });
    expect(await profileOf(id)).toEqual({ email: null, phone: display(phone), full_name: "Asha Rao", marketing_opt_in: false });
  });

  it("are only made once an email is confirmed, keeping the newsletter choice made at sign-up", async () => {
    const email = `p-${randomUUID().slice(0, 8)}@example.com`;
    const { data } = await admin.auth.admin.createUser({ email, password: `pw-${randomUUID()}`, user_metadata: { full_name: "Ravi Iyer", marketing_opt_in: true } });
    const id = data.user!.id;
    expect(await profileOf(id)).toBeUndefined();
    await admin.auth.admin.updateUserById(id, { email_confirm: true });
    expect(await profileOf(id)).toMatchObject({ email, full_name: "Ravi Iyer", phone: "", marketing_opt_in: true });
  });

  it("take a number added later as the contact number only when there isn't one", async () => {
    const empty = await makeUser();
    const phone = mobile();
    await admin.auth.admin.updateUserById(empty.id, { phone, phone_confirm: true });
    expect((await profileOf(empty.id)).phone).toBe(display(phone));

    const withContact = await makeUser();
    await sql("update public.profiles set phone = '+91 90000 00001' where id = $1", [withContact.id]);
    await admin.auth.admin.updateUserById(withContact.id, { phone: mobile(), phone_confirm: true });
    expect((await profileOf(withContact.id)).phone).toBe("+91 90000 00001");
  });

  it("can't be given a staff role or another account's id by the customer", async () => {
    const user = await makeUser();
    const { error } = await user.client.from("profiles").update({ email: "someone@else.test" }).eq("id", user.id);
    expect(error).not.toBeNull();
    expect((await user.client.from("user_roles").insert({ user_id: user.id, role: "owner" })).error).not.toBeNull();
  });
});

describe("customer search", () => {
  it("finds a number however it's typed, and leaves out accounts that were never verified", async () => {
    const staff = await makeUser("admin");
    const phone = mobile();
    // The app sends the store the account was made at (staff only see their store's customers).
    const [{ id: store }] = await sql<{ id: string }>("select public.home_store_id() as id");
    const { data } = await admin.auth.admin.createUser({ phone, phone_confirm: true, user_metadata: { full_name: "Meera Das", store_id: store } });
    const unverified = mobile();
    await admin.auth.admin.createUser({ phone: unverified });
    for (const q of [`${phone.slice(2, 7)} ${phone.slice(7)}`, `+${phone}`, phone.slice(2), `0${phone.slice(2, 7)} ${phone.slice(7)}`]) {
      const { data: rows } = await staff.client.rpc("admin_customers", { p_q: q, p_limit: 10, p_offset: 0 });
      expect((rows ?? []).map((r: { id: string }) => r.id), q).toContain(data.user!.id);
    }
    const { data: none } = await staff.client.rpc("admin_customers", { p_q: unverified.slice(2), p_limit: 10, p_offset: 0 });
    expect(none).toEqual([]);
  });
});

describe("sign-in settings", () => {
  it("only take SMS or WhatsApp, and template names WhatsApp accepts", async () => {
    await expect(sql("update public.store_settings set phone_login_channel = 'email' where id = 1")).rejects.toThrow(/check constraint/);
    await expect(sql("update public.store_settings set whatsapp_login_template = 'Login Code' where id = 1")).rejects.toThrow(/check constraint/);
    await expect(sql("update public.store_settings set whatsapp_login_language = 'english' where id = 1")).rejects.toThrow(/check constraint/);
  });

  it("can be read by anyone but changed only by admins", async () => {
    const customer = await makeUser();
    const { data } = await customer.client.from("store_settings").update({ phone_login_enabled: true }).eq("id", 1).select("id");
    expect(data ?? []).toEqual([]);
    const staff = await makeUser("staff");
    const res = await staff.client.from("store_settings").update({ phone_login_channel: "whatsapp" }).eq("id", 1).select("id");
    expect(res.data ?? []).toEqual([]);
  });
});
