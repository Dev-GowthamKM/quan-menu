// Signing in with a mobile number. Supabase Auth makes and checks the codes and sends them
// through the store's SMS hook to the MSG91 and WhatsApp mocks: the owner's switch, a new
// shopper signing up (their bag comes along), a returning customer, adding a number to an
// email account, codes on WhatsApp, and the numbers and accounts that never get a code.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { addToBag, db, env, expectAccessible } from "./support/helpers";

const MSG91 = "http://localhost:4014";
const WHATSAPP = "http://localhost:4012";
const run = Date.now().toString(36);

/** A mobile number no other test uses: as typed ("98450 12345") and as Supabase stores it ("919845012345"). */
function newNumber() {
  const n = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  return { typed: `${n.slice(0, 5)} ${n.slice(5)}`, stored: `91${n}` };
}

interface Sms { to: string; vars: { otp: string } }
interface WhatsApp { to: string; template: string; params: string[] }

const smsTo = async (to: string) => (await (await fetch(`${MSG91}/__test/messages?to=${to}`)).json()) as Sms[];
const whatsappTo = async (to: string) => ((await (await fetch(`${WHATSAPP}/__test/messages`)).json()) as WhatsApp[]).filter((m) => m.to === to);

/** Asks for a code on the open form and returns it once the mock has it. */
async function requestCode(page: Page, number: { typed: string; stored: string }, channel: "sms" | "whatsapp" = "sms") {
  const inbox = channel === "sms" ? () => smsTo(number.stored) : () => whatsappTo(number.stored);
  const before = (await inbox()).length;
  await page.getByLabel("Mobile number", { exact: true }).fill(number.typed);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(`We sent a 6-digit code ${channel === "sms" ? "by text message" : "on WhatsApp"} to +91 ${number.typed}.`)).toBeVisible();
  let code = "";
  await expect
    .poll(async () => {
      const list = await inbox();
      const last = list.length > before ? list.at(-1)! : null;
      code = last ? ("vars" in last ? last.vars.otp : last.params[0]) : "";
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code;
}

/** Supabase Auth's own endpoint, as anyone could call it with the public key. */
const askSupabase = (phone: string) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });

async function signinSettings(browser: Browser, change: (page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: OWNER.state });
  const page = await ctx.newPage();
  await page.goto("/admin/settings?tab=signin");
  await change(page);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Sign-in settings saved.")).toBeVisible();
  await ctx.close();
}

test.describe.configure({ mode: "serial" });

// Leave the store as it was found: mobile sign-in off.
test.afterAll(async ({ browser }) => {
  await signinSettings(browser, async (admin) => {
    await admin.getByLabel("Let customers sign in with their mobile number").uncheck();
  });
});

test("the owner sees what's set up and turns mobile sign-in on, with codes by SMS", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: OWNER.state });
  const page = await ctx.newPage();
  await page.goto("/admin/settings?tab=signin");
  for (const done of ["Phone sign-in is on in Supabase", "Supabase asks for phone confirmation", "The Send SMS hook points at", "MSG91 is connected"]) {
    await expect(page.getByRole("listitem").filter({ hasText: done })).toContainText("Done:");
  }
  await page.getByLabel("SMS through MSG91").check();
  await page.getByLabel("Let customers sign in with their mobile number").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Sign-in settings saved.")).toBeVisible();
  await expectAccessible(page, "Settings › Customer sign-in");

  // A test code goes out the way customers' will, and is shown to compare.
  const n = newNumber();
  await page.getByLabel("Mobile number", { exact: true }).fill(n.typed);
  await page.getByRole("button", { name: "Send test code" }).click();
  const shown = (await page.getByText(/Sent the test code \d{6}/).textContent())!.match(/\d{6}/)![0];
  expect((await smsTo(n.stored)).at(-1)?.vars.otp).toBe(shown);
  await ctx.close();
});

test("a new shopper signs up with a mobile number and a code, and keeps their bag", async ({ page }) => {
  const slug = `e2e-phone-${run}`;
  const { data: product } = await db().from("products")
    .insert({ title: `Phone Tee ${run}`, slug, price: 129900, status: "active", published_at: new Date(Date.now() - 60_000).toISOString() })
    .select("id").single();
  await db().from("product_variants").insert({ product_id: product!.id, sku: `PH-${run}-M`.toUpperCase(), size: "M", color: "Ecru", stock_quantity: 5 });
  await addToBag(page, slug, "M");

  await page.goto("/signup");
  await page.getByRole("button", { name: "Continue with mobile number" }).click();
  await expectAccessible(page, "mobile number form");
  const n = newNumber();
  const code = await requestCode(page, n);
  await expectAccessible(page, "code form");
  await page.getByLabel("Code", { exact: true }).fill(code);

  await expect(page.getByText("Your account is ready. What should we call you?")).toBeVisible();
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/account");
  await expect(page.getByRole("heading", { name: "Hello, Asha" })).toBeVisible();
  await expect(page.getByText(`+91 ${n.typed}`)).toBeVisible();
  await expect(page.locator("#p-phone")).toHaveValue(`+91 ${n.typed}`);
  await expect(page.getByRole("button", { name: "Add email" })).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);

  const { data: profile } = await db().from("profiles").select("full_name, email").eq("phone", `+91 ${n.typed}`).single();
  expect(profile).toEqual({ full_name: "Asha Rao", email: null });
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: `Phone Tee ${run}` }).first()).toBeVisible();
});

test("a returning customer signs in with a fresh code; a wrong code is refused", async ({ page }) => {
  const n = newNumber();
  await db().auth.admin.createUser({ phone: n.stored, phone_confirm: true, user_metadata: { full_name: "Ravi Iyer" } });
  await page.goto("/login?method=phone&next=/account/orders");
  const code = await requestCode(page, n);
  await expect(page.getByRole("button", { name: /Send a new code in \d+s/ })).toBeDisabled();
  await page.getByLabel("Code", { exact: true }).fill(`${code.slice(0, 5)}${(Number(code[5]) + 1) % 10}`);
  await expect(page.getByText("That code is wrong or has expired. Check it, or send a new one.")).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.waitForURL("**/account/orders");
  await expect(page.getByRole("heading", { name: "Hello, Ravi" })).toBeVisible();
});

test("a customer with an email account adds their mobile number, then signs in with it", async ({ browser }) => {
  const email = `link-${run}@example.com`;
  await db().auth.admin.createUser({ email, password: "Link-pass-2026!", email_confirm: true, user_metadata: { full_name: "Kiran Shah" } });
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "Link-pass-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/account");

  const n = newNumber();
  await page.getByRole("button", { name: "Add mobile number" }).click();
  const code = await requestCode(page, n);
  await page.getByLabel("Code", { exact: true }).fill(code);
  await expect(page.getByText("Your mobile number is verified.")).toBeVisible();
  await expect(page.getByText(`+91 ${n.typed}`)).toBeVisible();
  await expect(page.locator("#p-phone")).toHaveValue(`+91 ${n.typed}`);
  await first.close();

  const second = await browser.newContext();
  const phone = await second.newPage();
  await phone.goto("/login?method=phone");
  const signInCode = await requestCode(phone, n);
  await phone.getByLabel("Code", { exact: true }).fill(signInCode);
  await phone.waitForURL("**/account");
  await expect(phone.getByRole("heading", { name: "Hello, Kiran" })).toBeVisible();
  await expect(phone.getByText(email)).toBeVisible();
  await second.close();
});

test("codes can go on WhatsApp instead, with the copy-code button's template", async ({ browser, page }) => {
  await signinSettings(browser, async (admin) => {
    await admin.getByLabel("WhatsApp").check();
    await admin.getByLabel("Authentication template name").fill("login_code");
  });
  try {
    await page.goto("/login?method=phone");
    await expect(page.getByText("We'll send you a 6-digit code on WhatsApp. Indian numbers only.")).toBeVisible();
    const n = newNumber();
    const code = await requestCode(page, n, "whatsapp");
    // The code goes in the text and behind the copy-code button.
    expect((await whatsappTo(n.stored)).at(-1)).toMatchObject({ template: "login_code", params: [code, code] });
    await page.getByLabel("Code", { exact: true }).fill(code);
    await expect(page.getByText("Your account is ready. What should we call you?")).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.waitForURL("**/account");
  } finally {
    await signinSettings(browser, async (admin) => {
      await admin.getByLabel("SMS through MSG91").check();
    });
  }
});

test("codes only go to Indian mobile numbers of customer accounts, while the switch is on", async ({ page, baseURL }) => {
  // The form, then Supabase directly: the SMS hook refuses other countries.
  await page.goto("/login?method=phone");
  await page.getByLabel("Mobile number", { exact: true }).fill("415 555 0100");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toBeVisible();
  const foreign = await askSupabase("+14155550100");
  expect(foreign.status).toBe(400);
  expect(((await foreign.json()) as { msg: string }).msg).toMatch(/Indian mobile number/);

  // Staff accounts sign in with email and password: no code is sent, and nothing says why.
  const n = newNumber();
  const { data: staff } = await db().auth.admin.createUser({ email: `staff-phone-${run}@taana.test`, password: `Staff-${run}-pass!`, email_confirm: true, phone: n.stored, phone_confirm: true });
  await db().from("user_roles").insert({ user_id: staff.user!.id, role: "staff" });
  const before = (await smsTo(n.stored)).length;
  expect((await askSupabase(`+${n.stored}`)).status).toBe(200);
  expect((await smsTo(n.stored)).length).toBe(before);

  // Only Supabase, with the hook's secret, can ask the store to send a code.
  const forged = await fetch(`${baseURL}/api/auth/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "webhook-id": "msg_forged", "webhook-timestamp": String(Math.floor(Date.now() / 1000)), "webhook-signature": "v1,Zm9yZ2Vk" },
    body: JSON.stringify({ user: { id: staff.user!.id }, sms: { otp: "123456", phone: newNumber().stored } }),
  });
  expect(forged.status).toBe(401);

  // With the switch off, Supabase can't get a code sent at all.
  await db().from("store_settings").update({ phone_login_enabled: false }).eq("id", 1);
  try {
    const off = await askSupabase(`+${newNumber().stored}`);
    expect(((await off.json()) as { msg: string }).msg).toMatch(/turned off/);
  } finally {
    await db().from("store_settings").update({ phone_login_enabled: true }).eq("id", 1);
  }
});
