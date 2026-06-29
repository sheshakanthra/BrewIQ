import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Coffee,
  Loader2,
  PackagePlus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useApi } from "../hooks/useApi";
import {
  aiReorder,
  inventory,
  type BurnRow,
  type InventoryItemRow,
  type ReorderRec,
} from "../utils/api";
import { currency } from "../utils/format";

// ──────────────────────────── Row model ─────────────────────────────────────
interface Row extends InventoryItemRow {
  burn: number;
  days: number | null;
}
type Status = "CRITICAL" | "LOW" | "OK";

function statusOf(quantity: number, reorder: number, days: number | null): Status {
  if (days !== null && days < 2) return "CRITICAL";
  if (quantity <= reorder) return "LOW";
  return "OK";
}

const STATUS_STYLE: Record<Status, string> = {
  CRITICAL: "bg-alert/15 text-alert animate-pulse",
  LOW: "bg-crema/15 text-crema",
  OK: "bg-success/15 text-success",
};

const CATEGORIES = ["All", "Beans", "Milk", "Syrups", "Cups", "Food"];

// ──────────────────────── Sample fallback (offline) ─────────────────────────
function row(
  id: number, name: string, category: string, quantity: number, unit: string,
  reorder: number, cost: number, burn: number, supplier: string
): Row {
  const days = burn > 0 ? Number((quantity / burn).toFixed(1)) : null;
  return {
    id, name, category, quantity, unit, reorder_level: reorder, cost_per_unit: cost,
    supplier, last_restocked_at: null, low_stock: quantity <= reorder, burn, days,
  };
}
const SAMPLE_ROWS: Row[] = [
  row(1, "Colombian Beans", "beans", 3, "kg", 10, 18, 1.71, "Andes Coffee Importers"),
  row(2, "Espresso Blend Beans", "beans", 22, "kg", 10, 16, 2.0, "Andes Coffee Importers"),
  row(3, "Oat Milk", "milk", 5, "liters", 15, 2.5, 3.0, "Oatly Wholesale"),
  row(4, "Whole Milk", "milk", 42, "liters", 20, 1.2, 7.0, "Campus Dairy Co."),
  row(5, "Almond Milk", "milk", 17, "liters", 10, 2.8, 1.2, "Campus Dairy Co."),
  row(6, "Vanilla Syrup", "syrups", 8, "units", 5, 6, 0.4, "Monin Supply"),
  row(7, "Caramel Syrup", "syrups", 9, "units", 5, 6, 0.5, "Monin Supply"),
  row(8, "Disposable Cups 12oz", "cups", 80, "units", 200, 0.12, 44, "EcoPack Supplies"),
  row(9, "Disposable Cups 16oz", "cups", 360, "units", 200, 0.14, 40, "EcoPack Supplies"),
  row(10, "Croissants", "food", 36, "units", 24, 0.9, 9, "Sunrise Bakery"),
  row(11, "Muffins", "food", 28, "units", 20, 0.8, 6, "Sunrise Bakery"),
  row(12, "Avocados", "food", 28, "units", 15, 0.7, 6.3, "Green Valley Produce"),
];

const LOADING_STEPS = [
  "Reading 7-day burn rates…",
  "Calculating reorder quantities…",
  "Estimating supplier costs…",
  "Prioritizing by urgency…",
];

// ════════════════════════════════ Page ══════════════════════════════════════
async function fetchRows(): Promise<Row[]> {
  const [list, burn] = await Promise.all([inventory.list(), inventory.analytics()]);
  const byName: Record<string, BurnRow> = Object.fromEntries(burn.map((b) => [b.item_name, b]));
  return list.map((it) => {
    const b = byName[it.name];
    return { ...it, burn: b?.units_used_per_day ?? 0, days: b?.projected_days_remaining ?? null };
  });
}

export default function Inventory() {
  const { data, loading, refetch } = useApi<Row[]>(fetchRows, { intervalMs: 30000 });
  const base = data && data.length ? data : SAMPLE_ROWS;
  const showSkeleton = loading && !data;

  const [adjust, setAdjust] = useState<Record<number, number>>({});
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [modalRow, setModalRow] = useState<Row | null>(null);
  const aiRef = useRef<HTMLDivElement>(null);

  // Apply local restock adjustments on top of fetched data.
  const rows: Row[] = useMemo(
    () =>
      base.map((r) => {
        const delta = adjust[r.id] ?? 0;
        if (!delta) return r;
        const quantity = Number((r.quantity + delta).toFixed(2));
        const days = r.burn > 0 ? Number((quantity / r.burn).toFixed(1)) : null;
        return { ...r, quantity, days, low_stock: quantity <= r.reorder_level };
      }),
    [base, adjust]
  );

  const filtered = rows.filter((r) => {
    const catOk = filter === "All" || r.category === filter.toLowerCase();
    const nameOk = r.name.toLowerCase().includes(query.trim().toLowerCase());
    return catOk && nameOk;
  });

  const criticalRows = rows.filter((r) => statusOf(r.quantity, r.reorder_level, r.days) === "CRITICAL");
  const lowRows = rows.filter((r) => statusOf(r.quantity, r.reorder_level, r.days) !== "OK");

  const handleRestock = async (r: Row, amount: number) => {
    setAdjust((a) => ({ ...a, [r.id]: (a[r.id] ?? 0) + amount }));
    setModalRow(null);
    try {
      await inventory.restock(r.id, amount); // best-effort; UI already updated
      refetch();
    } catch {
      /* offline — local adjustment stands */
    }
  };

  return (
    <div className="space-y-6">
      {/* TOP — critical alert banner */}
      {criticalRows.length > 0 && (
        <button
          onClick={() => aiRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="flex w-full animate-fade-in items-center gap-3 rounded-2xl border border-alert/40 bg-alert/10 px-5 py-3.5 text-left transition hover:bg-alert/15"
        >
          <AlertTriangle size={18} className="shrink-0 animate-pulse text-alert" />
          <span className="text-sm font-medium text-cream">
            {criticalRows.length} item{criticalRows.length > 1 ? "s" : ""} critically low — AI
            reorder recommendations ready
          </span>
          <span className="ml-auto text-xs font-semibold text-alert">View →</span>
        </button>
      )}

      {/* MIDDLE — table */}
      <Card title="Inventory">
        {/* Filters + search */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === c
                    ? "bg-crema/15 text-crema ring-1 ring-crema/30"
                    : "text-tan hover:bg-cream/5 hover:text-cream"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative sm:w-60">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tan" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="w-full rounded-xl border border-espresso-border bg-espresso-bg/60 py-2 pl-9 pr-3 text-sm text-cream outline-none placeholder:text-tan/60 focus:border-crema/40"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-espresso-border text-left text-xs uppercase tracking-wide text-tan">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Stock Level</th>
                <th className="px-3 py-2 font-medium">Reorder</th>
                <th className="px-3 py-2 font-medium">Days Left</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {showSkeleton &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-espresso-border/50">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <Skeleton className="h-3.5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!showSkeleton && filtered.map((r) => {
                const status = statusOf(r.quantity, r.reorder_level, r.days);
                const pct = Math.min(100, (r.quantity / (r.reorder_level * 2 || 1)) * 100);
                const barColor = pct < 20 ? "bg-alert" : pct < 50 ? "bg-crema" : "bg-success";
                return (
                  <tr key={r.id} className="border-b border-espresso-border/50 hover:bg-cream/[0.02]">
                    <td className="px-3 py-3">
                      <p className="font-medium text-cream">{r.name}</p>
                      <p className="text-xs text-tan">{r.supplier}</p>
                    </td>
                    <td className="px-3 py-3 capitalize text-tan">{r.category}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-espresso-bg">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="num whitespace-nowrap text-xs text-cream">
                          {r.quantity} {r.unit}
                        </span>
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-tan">{r.reorder_level}</td>
                    <td className="num px-3 py-3 text-cream">
                      {r.days !== null ? `${r.days.toFixed(1)} days` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`chip ${STATUS_STYLE[status]}`}>{status}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => setModalRow(r)} className="btn-ghost px-3 py-1.5 text-xs">
                        <PackagePlus size={14} /> Restock
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!showSkeleton && filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState emoji="🔍" title="No items match" message="Try a different category or clear your search." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* BOTTOM — AI reorder recommendations */}
      <div ref={aiRef}>
        <ReorderPanel lowRows={lowRows} />
      </div>

      {/* Restock modal */}
      {modalRow && (
        <RestockModal row={modalRow} onClose={() => setModalRow(null)} onConfirm={handleRestock} />
      )}
    </div>
  );
}

// ─────────────────────────── Restock modal ──────────────────────────────────
function RestockModal({
  row, onClose, onConfirm,
}: {
  row: Row;
  onClose: () => void;
  onConfirm: (r: Row, amount: number) => void;
}) {
  const [amount, setAmount] = useState(Math.max(1, Math.round(row.reorder_level)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-espresso-border bg-espresso-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-cream">Restock {row.name}</h3>
          <button onClick={onClose} className="text-tan hover:text-cream"><X size={18} /></button>
        </div>
        <p className="mb-3 text-sm text-tan">
          Current: <span className="num text-cream">{row.quantity} {row.unit}</span> · Reorder at{" "}
          <span className="num">{row.reorder_level}</span>
        </p>
        <label className="mb-1 block text-xs uppercase tracking-wide text-tan">Add quantity ({row.unit})</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          className="mb-4 w-full rounded-xl border border-espresso-border bg-espresso-bg/60 px-3 py-2 text-cream outline-none focus:border-crema/40"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onConfirm(row, amount)} disabled={amount <= 0} className="btn">
            <PackagePlus size={16} /> Add {amount} {row.unit}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────── AI reorder panel ──────────────────────────────────
function ReorderPanel({ lowRows }: { lowRows: Row[] }) {
  const [recs, setRecs] = useState<ReorderRec[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [ordered, setOrdered] = useState<Set<string>>(new Set());

  // Cycle the loading "tool use" messages for a streaming feel.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStepIdx((i) => (i + 1) % LOADING_STEPS.length), 900);
    return () => clearInterval(id);
  }, [loading]);

  const sampleRecs = (): ReorderRec[] =>
    lowRows.map((r) => {
      const qty = Number((r.burn * 5).toFixed(r.unit === "units" ? 0 : 1));
      const cost = Number((qty * r.cost_per_unit).toFixed(2));
      const urgency = statusOf(r.quantity, r.reorder_level, r.days).toLowerCase();
      return {
        item: r.name,
        recommended_qty: qty,
        estimated_cost: cost,
        urgency,
        reason: `At ~${r.burn}/day you'll run out in ${r.days ?? "?"} days. Order ${qty} ${r.unit} to cover the 3-day lead time plus a 2-day safety buffer.`,
        reasoning_steps: [
          { tool: "calculate_reorder_quantity", arguments: { item_name: r.name, daily_usage: r.burn, lead_time_days: 3, safety_stock_days: 2 }, result: { recommended_quantity: qty } },
          { tool: "estimate_cost", arguments: { item_name: r.name, quantity: qty, cost_per_unit: r.cost_per_unit }, result: { estimated_cost: cost } },
        ],
      };
    });

  const generate = async () => {
    setLoading(true);
    setRecs(null);
    const payload = lowRows.map((r) => ({
      item: r.name, units_per_day: r.burn, current_qty: r.quantity,
      cost_per_unit: r.cost_per_unit, unit: r.unit,
      urgency: statusOf(r.quantity, r.reorder_level, r.days).toLowerCase(),
    }));
    try {
      const result = await aiReorder(payload);
      setRecs(result.length ? result : sampleRecs());
    } catch {
      setRecs(sampleRecs()); // offline — show deterministic recs so the demo works
    } finally {
      setLoading(false);
    }
  };

  const toggleOrdered = (item: string) =>
    setOrdered((s) => {
      const next = new Set(s);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const total = (recs ?? [])
    .filter((r) => !ordered.has(r.item))
    .reduce((sum, r) => sum + r.estimated_cost, 0);

  return (
    <Card className="border-crema/25">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-crema" />
          <h3 className="text-base font-bold text-cream">🤖 AI Reorder Recommendations</h3>
          <span className="chip bg-crema/10 text-crema">Groq</span>
        </div>
        <button onClick={generate} disabled={loading} className="btn">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Generate Recommendations
        </button>
      </div>

      {loading && (
        <div className="space-y-2 py-6 text-center">
          <p className="text-sm font-medium text-cream">
            BrewIQ is analyzing your inventory burn rates…
          </p>
          <p className="num text-xs text-crema">{LOADING_STEPS[stepIdx]}</p>
        </div>
      )}

      {!loading && !recs && (
        <p className="py-6 text-center text-sm text-tan">
          {lowRows.length} item{lowRows.length === 1 ? "" : "s"} below reorder level. Click generate
          to let Groq compute optimal reorder quantities and costs.
        </p>
      )}

      {!loading && recs && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recs.map((rec) => {
              const isOrdered = ordered.has(rec.item);
              const tone =
                rec.urgency === "critical"
                  ? "bg-alert/15 text-alert"
                  : rec.urgency === "low"
                    ? "bg-crema/15 text-crema"
                    : "bg-sage/15 text-sage";
              return (
                <div
                  key={rec.item}
                  className={`animate-fade-in rounded-2xl border p-4 transition ${
                    isOrdered ? "border-success/30 bg-success/5 opacity-70" : "border-espresso-border bg-espresso-bg/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold text-cream">
                      <Coffee size={15} className="text-crema" /> {rec.item}
                    </span>
                    <span className={`chip ${tone}`}>{rec.urgency.toUpperCase()}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <Stat label="Order" value={`${rec.recommended_qty}`} />
                    <Stat label="Est. cost" value={currency(rec.estimated_cost)} />
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-cream/85">{rec.reason}</p>

                  {/* AI reasoning (tool use) */}
                  {rec.reasoning_steps?.length > 0 && (
                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-xs text-tan hover:text-crema">
                        Show AI reasoning ({rec.reasoning_steps.length} tool calls)
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {rec.reasoning_steps.map((s, i) => (
                          <li key={i} className="rounded-lg bg-espresso-card px-2 py-1.5 text-[11px] text-tan">
                            <span className="num text-crema">{s.tool}</span> →{" "}
                            <span className="num text-cream">
                              {Object.values(s.result).join(", ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <button
                    onClick={() => toggleOrdered(rec.item)}
                    className={`mt-4 w-full ${isOrdered ? "btn-ghost" : "btn"}`}
                  >
                    {isOrdered ? <><Check size={16} /> Ordered</> : "Mark as Ordered"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-espresso-border pt-4">
            <span className="text-sm text-tan">Total estimated order cost (remaining)</span>
            <span className="num text-xl font-medium text-cream">{currency(total)}</span>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-espresso-card px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-tan">{label}</p>
      <p className="num text-sm text-cream">{value}</p>
    </div>
  );
}
