/** Shown on every page until the database is connected and migrated. */
export default function SetupNotice() {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
      The store database is not connected yet. Set the Supabase environment variables and run the migrations (see README),
      then this notice disappears.
    </div>
  );
}
