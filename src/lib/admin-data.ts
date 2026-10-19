import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Option lists shared by admin forms and filters. Read with the staff member's session,
// so drafts and unpublished rows are included.

type Client = SupabaseClient<Database>;

export interface Option {
  id: string;
  label: string;
}

export interface CategoryOption extends Option {
  name: string;
  size_guide_id: string | null;
  depth: number;
  slug: string;
  parent_id: string | null;
  path: string;
}

/** Categories in tree order, with "Women › Dresses" style paths. */
export async function categoryOptions(sb: Client): Promise<CategoryOption[]> {
  const { data } = await sb.from("categories").select("id, name, slug, parent_id, sort_order, size_guide_id").order("sort_order").order("name");
  const rows = data ?? [];
  const children = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const list = children.get(r.parent_id) ?? [];
    list.push(r);
    children.set(r.parent_id, list);
  }
  const out: CategoryOption[] = [];
  const walk = (parent: string | null, depth: number, trail: string[]) => {
    for (const r of children.get(parent) ?? []) {
      const path = [...trail, r.name];
      out.push({ id: r.id, name: r.name, slug: r.slug, parent_id: r.parent_id, size_guide_id: r.size_guide_id, depth, path: path.join(" › "), label: `${" ".repeat(depth)}${r.name}` });
      if (depth < 6) walk(r.id, depth + 1, path);
    }
  };
  walk(null, 0, []);
  return out;
}

export async function brandOptions(sb: Client): Promise<Option[]> {
  const { data } = await sb.from("brands").select("id, name").order("name");
  return (data ?? []).map((b) => ({ id: b.id, label: b.name }));
}

export async function manualCollectionOptions(sb: Client): Promise<Option[]> {
  const { data } = await sb.from("collections").select("id, title").eq("kind", "manual").order("title");
  return (data ?? []).map((c) => ({ id: c.id, label: c.title }));
}

export async function sizeGuideOptions(sb: Client): Promise<Option[]> {
  const { data } = await sb.from("size_guides").select("id, name").order("name");
  return (data ?? []).map((g) => ({ id: g.id, label: g.name }));
}

/** Tags already used in the catalog, most common first, for suggestions. */
export async function tagSuggestions(sb: Client): Promise<string[]> {
  const { data } = await sb.from("products").select("tags").limit(2000);
  const counts = new Map<string, number>();
  for (const row of data ?? []) for (const t of row.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([t]) => t);
}

/** Brands keyed by slug, for collection rules (rules refer to slugs, which survive re-imports). */
export async function brandSlugOptions(sb: Client): Promise<Option[]> {
  const { data } = await sb.from("brands").select("slug, name").order("name");
  return (data ?? []).map((b) => ({ id: b.slug, label: b.name }));
}
