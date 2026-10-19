"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCatalogRow, saveSizeGuide } from "@/server/admin/catalog";
import { Badge, Button, cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { CloseIcon, PlusIcon } from "../../ui/icons";
import { SelectField, TextArea, TextField } from "../fields";
import { useToast } from "../Toaster";
import { Empty, Table, Td, Th } from "../ui";

export interface GuideRow {
  id: string;
  name: string;
  description: string;
  unit: "cm" | "in";
  columns: string[];
  rows: string[][];
  how_to_measure: string;
  is_sample: boolean;
  usage: number;
}

type Draft = Omit<GuideRow, "id" | "is_sample" | "usage"> & { id: string | null };

const blank = (): Draft => ({
  id: null, name: "", description: "", unit: "cm", columns: ["Size", "Chest", "Waist", "Length"],
  rows: [["S", "", "", ""], ["M", "", "", ""], ["L", "", "", ""]], how_to_measure: "",
});

const cell = "h-8 w-full min-w-16 rounded border border-black/10 bg-white px-2 text-sm focus:border-ink focus:outline-none";

export default function SizeGuidesManager({ rows }: { rows: GuideRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const setCell = (r: number, c: number, v: string) =>
    setDraft((d) => (d ? { ...d, rows: d.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) } : d));

  const save = () => {
    if (!draft) return;
    const columns = draft.columns.map((c) => c.trim());
    if (columns.some((c) => !c)) return setError("Name every column.");
    start(async () => {
      const res = await saveSizeGuide({ ...draft, columns, rows: draft.rows.filter((r) => r.some((x) => x.trim())).map((r) => r.map((x) => x.trim())) });
      if (!res.ok) return setError(res.error);
      toast("Size guide saved.");
      setDraft(null);
      router.refresh();
    });
  };

  const remove = () => {
    if (!draft?.id || !window.confirm(`Delete ${draft.name}? Products and categories using it will no longer show a size guide.`)) return;
    start(async () => {
      const res = await deleteCatalogRow("size_guides", draft.id!);
      if (!res.ok) return setError(res.error);
      toast("Size guide deleted.");
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setError(null); setDraft(blank()); }}><PlusIcon size={14} /> Add size guide</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title="No size guides yet" />
      ) : (
        <Table>
          <thead><tr><Th>Guide</Th><Th>Measurements</Th><Th className="text-right">Used by</Th><Th><span className="sr-only">Edit</span></Th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <Td>
                  <button type="button" onClick={() => { setError(null); setDraft({ ...g, rows: g.rows.map((r) => g.columns.map((_, i) => r[i] ?? "")) }); }} className="font-medium hover:underline">{g.name}</button>
                  {g.is_sample && <Badge tone="violet" className="ml-2">Sample</Badge>}
                </Td>
                <Td className="text-xs text-taupe">{g.columns.join(", ")} · {g.rows.length} sizes · {g.unit}</Td>
                <Td className="text-right text-xs text-stone">{g.usage ? `${g.usage} product${g.usage === 1 ? "" : "s"}/categor${g.usage === 1 ? "y" : "ies"}` : "Not used"}</Td>
                <Td className="text-right"><button type="button" onClick={() => { setError(null); setDraft({ ...g }); }} className="text-xs underline">Edit</button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        side="right"
        size="lg"
        title={draft?.id ? `Edit ${draft.name || "size guide"}` : "New size guide"}
        className="bg-white"
        footer={
          <div className="flex items-center gap-2">
            {draft?.id && <button type="button" onClick={remove} disabled={pending} className="text-sm text-red-700 underline">Delete</button>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" onClick={save} busy={pending} disabled={!draft?.name.trim()}>Save</Button>
            </div>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <TextField label="Name" value={draft.name} maxLength={120} autoFocus onChange={(e) => patch({ name: e.target.value })} placeholder="Women's dresses" />
              <SelectField label="Unit" value={draft.unit} onChange={(e) => patch({ unit: e.target.value as "cm" | "in" })}>
                <option value="cm">cm</option>
                <option value="in">inches</option>
              </SelectField>
            </div>
            <TextArea label="Note above the chart" value={draft.description} rows={2} maxLength={2000} onChange={(e) => patch({ description: e.target.value })} placeholder="Body measurements. If you're between sizes, size up." />
            <div>
              <p className="mb-1.5 text-xs font-medium text-taupe">Chart</p>
              <div className="overflow-x-auto rounded-md border border-black/10 p-2">
                <table className="border-separate border-spacing-1">
                  <thead>
                    <tr>
                      {draft.columns.map((c, i) => (
                        <th key={i} className="min-w-20">
                          <div className="flex items-center gap-1">
                            <input aria-label={`Column ${i + 1} name`} value={c} maxLength={40} onChange={(e) => patch({ columns: draft.columns.map((x, j) => (j === i ? e.target.value : x)) })} className={cx(cell, "font-medium")} />
                            {draft.columns.length > 1 && (
                              <button type="button" aria-label={`Remove column ${c || i + 1}`} onClick={() => patch({ columns: draft.columns.filter((_, j) => j !== i), rows: draft.rows.map((r) => r.filter((_, j) => j !== i)) })} className="text-stone hover:text-red-700"><CloseIcon size={12} /></button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th>
                        {draft.columns.length < 12 && (
                          <button type="button" onClick={() => patch({ columns: [...draft.columns, ""], rows: draft.rows.map((r) => [...r, ""]) })} className="h-8 rounded border border-dashed border-black/20 px-2 text-xs text-taupe hover:border-black/50">+ Column</button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.rows.map((row, r) => (
                      <tr key={r}>
                        {draft.columns.map((_, c) => (
                          <td key={c}><input aria-label={`${draft.columns[c] || `Column ${c + 1}`}, row ${r + 1}`} value={row[c] ?? ""} maxLength={40} onChange={(e) => setCell(r, c, e.target.value)} className={cx(cell, c === 0 && "font-medium")} /></td>
                        ))}
                        <td><button type="button" aria-label={`Remove row ${r + 1}`} onClick={() => patch({ rows: draft.rows.filter((_, i) => i !== r) })} className="px-1 text-stone hover:text-red-700"><CloseIcon size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {draft.rows.length < 40 && (
                  <button type="button" onClick={() => patch({ rows: [...draft.rows, draft.columns.map(() => "")] })} className="mt-1 ml-1 h-8 rounded border border-dashed border-black/20 px-3 text-xs text-taupe hover:border-black/50">+ Size</button>
                )}
              </div>
            </div>
            <TextArea label="How to measure" value={draft.how_to_measure} rows={4} maxLength={2000} onChange={(e) => patch({ how_to_measure: e.target.value })} placeholder="Chest: measure around the fullest part, keeping the tape level." />
          </div>
        )}
      </Dialog>
    </>
  );
}
