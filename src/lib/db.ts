/**
 * The generated RPC types mark every function argument as non-null, but our SQL
 * functions take SQL NULL for "not signed in" / "no guest cart". Pass such values
 * through this so they arrive as JSON null (omitting them would not match the function).
 */
export const sqlNull = <T>(value: T | null | undefined) => (value ?? null) as T;
