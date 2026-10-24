import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED } from "./env";
import { sessionClient } from "./supabase/session";

/** The signed-in user, verified with Supabase Auth (not just decoded from the cookie). */
export const getUser = cache(async (): Promise<User | null> => {
  if (!SUPABASE_CONFIGURED) return null;
  const { data, error } = await (await sessionClient(null)).auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});
