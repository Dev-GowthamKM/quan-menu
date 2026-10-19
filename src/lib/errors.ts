// Turns database and API errors into messages a customer or staff member can act on.
// Our SQL functions raise a short code as the message and put the human sentence in the
// hint, so the hint wins when present.

export interface DbError {
  message?: string;
  hint?: string | null;
  code?: string;
  details?: string | null;
}

const BY_CODE: Record<string, string> = {
  "42501": "You don't have permission to do that.",
  "23505": "That already exists. Use a different value.",
  "23503": "That is still in use elsewhere, so it can't be removed.",
  "23514": "Some values are not allowed. Check the form and try again.",
  "22023": "Some details are missing or invalid.",
  P0002: "We couldn't find that. It may have been removed.",
  PGRST116: "We couldn't find that. It may have been removed.",
};

const BY_MESSAGE: Record<string, string> = {
  out_of_stock: "Sorry, that item just sold out.",
  insufficient_stock: "There isn't enough stock for that quantity.",
  cart_empty: "Your bag is empty.",
  not_signed_in: "Please sign in first.",
  forbidden: "You don't have permission to do that.",
};

export function friendlyError(error: DbError | null | undefined, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (error.hint) return error.hint;
  if (error.message && BY_MESSAGE[error.message]) return BY_MESSAGE[error.message];
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  if (error.message && /schema cache|does not exist|relation .* does not exist/i.test(error.message)) {
    return "The database is not set up yet. Run the migrations (see README).";
  }
  return fallback;
}

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });
