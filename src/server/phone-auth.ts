"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRole, getUser } from "@/lib/auth";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Runs after the browser signed in with a mobile number and code, and says whether to ask
 * for a name (a new account has none yet). It leaves cookies alone: changing them would
 * re-render the sign-in page, which sends signed-in visitors on before the name is asked.
 */
export async function phoneSignInComplete(): Promise<ActionResult<{ needsName: boolean }>> {
  const user = await getUser();
  if (!user) return fail("We couldn't sign you in. Please try again.");
  const sb = await supabaseServer();
  // The SMS hook never sends codes to staff accounts; this is a second line of defence.
  if (await getRole()) {
    await sb.auth.signOut();
    return fail("Staff accounts sign in with email and password.");
  }
  const { data } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return ok({ needsName: !data?.full_name });
}

const nameSchema = z.string().trim().min(1, "Enter your name.").max(120, "Use at most 120 characters.");

/** The name a new account gives on its first sign-in. */
export async function saveName(name: string): Promise<ActionResult<null>> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter your name.");
  const user = await getUser();
  if (!user) return fail("Please sign in again.");
  const sb = await supabaseServer();
  const { error } = await sb.from("profiles").update({ full_name: parsed.data }).eq("id", user.id);
  if (error) return fail(friendlyError(error));
  await sb.auth.updateUser({ data: { full_name: parsed.data } });
  revalidatePath("/account");
  return ok(null);
}
