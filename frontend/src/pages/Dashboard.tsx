import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Coffee,
  DollarSign,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useApi } from "../hooks/useApi";
import { useCountUp } from "../hooks/useCountUp";
import {
  ai,
  demo,
  getOrders,
  type Briefing,
  type OrderLine,
  type OrderRow,
  type RushInsights,
} from "../utils/api";
import { currency, timeAgo } from "../utils/format";

// ════════════════════════ Sample fallbacks (keep the page alive offline) ═════
const SAMPLE_BRIEFING: Briefing = {
  briefing_text:
    "Good morning! The Daily Grind is off to a strong start — $487.50 from 66 orders, up 37.5% on yesterday, with the Oat Milk Latte leading the board. Three items need attention: oat milk is critical at ~1.7 days of cover, and 12oz cups and Colombian beans are close behind. Coverage looks thin against the 8–9am rush. Smart move today: add a third barista on the opening shift and place a supplier order for oat milk before the morning peak.",
  alerts_count: 3,
  generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  model: "sample",
  key_metrics: {
    todays_revenue: 487.5,
    todays_orders: 66,
    yesterdays_revenue: 354.5,
    revenue_vs_yesterday_pct: 37.5,
    avg_order_value: 7.39,
    alerts_count: 3,
    scheduled_staff: 4,
    understaffed_hours: [8, 9],
    top_item: "Oat Milk Latte",
  },
};

const SAMPLE_RUSH: RushInsights = {
  explanation: "",
  peak_hour: 9,
  recommendation: "",
  generated_at: new Date().toISOString(),
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_CURVE: Record<number, number> = {
  7: 4, 8: 24, 9: 28, 10: 12, 11: 9, 12: 21, 13: 20,
  14: 10, 15: 7, 16: 7, 17: 5, 18: 4, 19: 3, 20: 1,
};

interface HeatCell { day: string; hour: number; avg: number }
function buildHeatmap(): HeatCell[] {
  const cells: HeatCell[] = [];
  DAYS.forEach((day, di) => {
    const weekend = di >= 5;
    HOURS.forEach((hour) => {
      const base = WEEKDAY_CURVE[hour] ?? 2;
      const factor = weekend ? 0.42 : 0.85 + (di % 3) * 0.08;
      cells.push({ day, hour, avg: Math.round(base * factor) });
    });
  });
  return cells;
}
const HEATMAP = buildHeatmap();
const HEAT_MAX = Math.max(...HEATMAP.map((c) => c.avg));
const PEAK_CELL = HEATMAP.reduce((a, b) => (b.avg > a.avg ? b : a), HEATMAP[0]);

function heatColor(avg: number): string {
  const t = avg / HEAT_MAX;
  if (t < 0.04) return "rgba(42, 31, 18, 0.6)";
  // light amber -> deep amber (crema) -> alert red
  if (t < 0.5) {
    const k = t / 0.5; // 0..1
    const a = 0.18 + k * 0.82;
    return `rgba(200, 137, 58, ${a.toFixed(2)})`;
  }
  const k = (t - 0.5) / 0.5; // 0..1 crema(200,137,58) -> red(224,82,82)
  const r = Math.round(200 + (224 - 200) * k);
  const g = Math.round(137 + (82 - 137) * k);
  const b = Math.round(58 + (82 - 58) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

const SAMPLE_ORDERS: OrderRow[] = [
  { id: 9001, created_at: iso(20), items: [{ name: "Latte", price: 5.5, quantity: 1 }], total_price: 5.5, status: "preparing", customer_name: "Emma", order_type: "takeaway" },
  { id: 9000, created_at: iso(75), items: [{ name: "Oat Milk Latte", price: 6.5, quantity: 1 }, { name: "Croissant", price: 4.5, quantity: 1 }], total_price: 11.0, status: "ready", customer_name: "Prof. Hayes", order_type: "dine_in" },
  { id: 8999, created_at: iso(140), items: [{ name: "Americano", price: 4.0, quantity: 2 }], total_price: 8.0, status: "completed", customer_name: "Kai", order_type: "takeaway" },
  { id: 8998, created_at: iso(220), items: [{ name: "Cold Brew", price: 5.5, quantity: 1 }], total_price: 5.5, status: "pending", customer_name: "Ava", order_type: "takeaway" },
  { id: 8997, created_at: iso(310), items: [{ name: "Cappuccino", price: 5.0, quantity: 1 }, { name: "Muffin", price: 3.5, quantity: 1 }], total_price: 8.5, status: "completed", customer_name: "Noah", order_type: "dine_in" },
  { id: 8996, created_at: iso(400), items: [{ name: "Matcha Latte", price: 6.0, quantity: 1 }], total_price: 6.0, status: "completed", customer_name: null, order_type: "takeaway" },
  { id: 8995, created_at: iso(520), items: [{ name: "Espresso", price: 3.5, quantity: 1 }], total_price: 3.5, status: "completed", customer_name: "Olivia", order_type: "dine_in" },
];

function iso(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

interface RevPoint { date: string; revenue: number; prev: number }
function buildRevenue(): RevPoint[] {
  const out: RevPoint[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const seed = Math.sin(i * 1.3) * 80;
    const revenue = Math.round((weekend ? 420 : 820) + seed + (i === 4 ? 620 : 0));
    const prev = Math.round((weekend ? 400 : 760) + Math.cos(i * 1.1) * 70);
    out.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), revenue, prev });
  }
  return out;
}
const REVENUE_14 = buildRevenue();

// ════════════════════════════════ KPI card ══════════════════════════════════
interface KpiProps {
  label: string;
  target: number;
  format: (n: number) => string;
  icon: LucideIcon;
  delta?: number;
  hint?: string;
  delay: number;
}
function KpiCard({ label, target, format, icon: Icon, delta, hint, delay }: KpiProps) {
  const animated = useCountUp(target);
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      className="card animate-fade-in border-l-4 border-l-crema/70 p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-crema/10 text-crema ring-1 ring-crema/20">
          <Icon size={16} />
        </span>
        {delta !== undefined && (
          <span className={`chip ${positive ? "bg-success/10 text-success" : "bg-alert/10 text-alert"}`}>
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {positive ? "+" : ""}{delta}% vs yest
          </span>
        )}
      </div>
      <p className="num mt-4 text-[28px] font-medium leading-none text-cream">{format(animated)}</p>
      <p className="mt-2 text-sm text-tan">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-tan/70">{hint}</p>}
    </div>
  );
}

// ═══════════════════════════ Recharts tooltips ══════════════════════════════
interface TipProps { active?: boolean; payload?: Array<{ value: number; payload: RevPoint }>; label?: string }
function RevenueTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-espresso-border bg-espresso-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-semibold text-cream">{label}</p>
      <p className="num text-crema">This period: {currency(p.revenue)}</p>
      <p className="num text-tan">Previous: {currency(p.prev)}</p>
    </div>
  );
}

// ══════════════════════════════ Live order feed ═════════════════════════════
function parseItems(items: OrderLine[] | string): OrderLine[] {
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items) as OrderLine[];
  } catch {
    return [];
  }
}
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-400/10 text-yellow-300",
  preparing: "bg-crema/15 text-crema",
  ready: "bg-success/10 text-success",
  completed: "bg-espresso-bg text-tan",
  cancelled: "bg-alert/10 text-alert",
};

function OrderItem({ order, index }: { order: OrderRow; index: number }) {
  const lines = parseItems(order.items);
  const summary =
    lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name)).join(", ") || "—";
  const TypeIcon = order.order_type === "dine_in" ? Coffee : ShoppingBag;
  return (
    <li
      className="flex animate-fade-in items-center gap-3 border-b border-espresso-border/60 px-1 py-3 last:border-0"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-espresso-bg text-tan">
        <TypeIcon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-cream">{order.customer_name || "Walk-in"}</p>
          <span className={`chip ${STATUS_STYLES[order.status] ?? STATUS_STYLES.completed} px-1.5 py-0.5`}>
            {order.status}
          </span>
        </div>
        <p className="truncate text-xs text-tan">{summary}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm text-cream">{currency(order.total_price)}</p>
        <p className="text-[11px] text-tan">{timeAgo(order.created_at)}</p>
      </div>
    </li>
  );
}

// ══════════════════════════════════ Page ════════════════════════════════════
export default function Dashboard() {
  // Briefing: POST, supports forced refresh via a ref the fetcher reads.
  const forceRef = useRef(false);
  const briefingQ = useApi<Briefing>(
    () => {
      const force = forceRef.current;
      forceRef.current = false;
      return ai.briefing(force);
    },
    { intervalMs: 0 }
  );
  const rushQ = useApi<RushInsights>(() => ai.rushInsights(), { intervalMs: 0 });
  const ordersQ = useApi<OrderRow[]>(() => getOrders(15), { intervalMs: 15000 });

  const briefing = briefingQ.data ?? SAMPLE_BRIEFING;
  const m = briefing.key_metrics;
  const peakHour = (rushQ.data ?? SAMPLE_RUSH).peak_hour ?? PEAK_CELL.hour;
  const briefingLoading = briefingQ.loading && !briefingQ.data;

  // Live feed states: loading skeleton, empty (backend up, no orders), or data/offline sample.
  const ordersLoading = ordersQ.loading && !ordersQ.data;
  const ordersEmpty = !ordersLoading && ordersQ.data !== null && ordersQ.data.length === 0;
  const liveOrders = (ordersQ.data ?? (ordersQ.error ? SAMPLE_ORDERS : [])).slice(0, 10);

  const refreshBriefing = () => {
    forceRef.current = true;
    briefingQ.refetch();
  };

  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  return (
    <div className="space-y-6">
      {/* ROW 1 — KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Today's Revenue" target={m.todays_revenue} format={currency} icon={DollarSign} delta={m.revenue_vs_yesterday_pct} hint={`vs ${currency(m.yesterdays_revenue)} yesterday`} delay={0} />
        <KpiCard label="Orders Today" target={m.todays_orders} format={(n) => Math.round(n).toString()} icon={ShoppingCart} delta={12} hint="across all channels" delay={70} />
        <KpiCard label="Avg Order Value" target={m.avg_order_value} format={currency} icon={ShoppingBag} delta={4} hint="last 7-day trend" delay={140} />
        <KpiCard label="Items Low Stock" target={m.alerts_count} format={(n) => Math.round(n).toString()} icon={Boxes} delta={-8} hint="at/below reorder level" delay={210} />
      </div>

      {/* ROW 2 — AI Daily Briefing */}
      <Card className="border-crema/25 bg-gradient-to-br from-espresso-card to-[#1f1409] animate-fade-in">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-crema" />
            <h3 className="text-base font-bold text-cream">☕ AI Daily Briefing</h3>
          </div>
          <button onClick={refreshBriefing} disabled={briefingQ.loading} className="btn-ghost">
            <RefreshCw size={14} className={briefingQ.loading ? "animate-spin" : ""} />
            Refresh Briefing
          </button>
        </div>

        {briefingLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-tan">BrewIQ is analyzing your day…</p>
            {[100, 92, 96, 70].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-cream/10" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <p className="max-w-4xl text-[15px] leading-relaxed text-cream/90">{briefing.briefing_text}</p>
        )}

        {/* Bottom quick-stats strip */}
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-espresso-border pt-4">
          <QuickStat label="Alerts" value={String(briefing.alerts_count)} tone="alert" />
          <QuickStat label="Peak Hour" value={fmtHour(peakHour)} tone="crema" />
          <QuickStat label="Top Item" value={m.top_item ?? "—"} tone="sage" />
        </div>
        <p className="mt-3 text-xs text-tan/70">
          {briefing.model === "sample" ? "Sample data · " : ""}Updated {timeAgo(briefing.generated_at)}
        </p>
      </Card>

      {/* ROW 3 — Heatmap (60%) + Live feed (40%) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Heatmap */}
        <Card title="Order Density — Last 30 Days" className="lg:col-span-3">
          <p className="mb-3 -mt-2 text-xs text-crema">↘ Star marks your busiest slot: {PEAK_CELL.day} {fmtHour(PEAK_CELL.hour)}</p>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="flex">
                <div className="w-10 shrink-0" />
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 text-center text-[10px] text-tan">
                    {h % 3 === 1 ? fmtHour(h) : ""}
                  </div>
                ))}
              </div>
              {DAYS.map((day) => (
                <div key={day} className="flex items-center">
                  <div className="w-10 shrink-0 text-xs text-tan">{day}</div>
                  {HOURS.map((hour) => {
                    const cell = HEATMAP.find((c) => c.day === day && c.hour === hour)!;
                    const isPeak = cell.day === PEAK_CELL.day && cell.hour === PEAK_CELL.hour;
                    return (
                      <div key={hour} className="group relative flex-1 p-0.5">
                        <div
                          className={`aspect-square w-full rounded-[3px] transition-transform hover:scale-110 ${
                            isPeak ? "ring-2 ring-cream" : ""
                          }`}
                          style={{ backgroundColor: heatColor(cell.avg) }}
                        >
                          {isPeak && (
                            <span className="flex h-full items-center justify-center text-[9px] text-espresso-bg">★</span>
                          )}
                        </div>
                        {/* tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-espresso-border bg-espresso-bg px-2 py-1 text-[11px] text-cream shadow-xl group-hover:block">
                          {fullDay(day)} {fmtHour(hour)}: avg {cell.avg} orders
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* legend */}
              <div className="mt-3 flex items-center gap-2 text-[11px] text-tan">
                <span>Fewer</span>
                <div className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, rgba(200,137,58,0.2), #C8893A, #E05252)" }} />
                <span>More</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Live order feed */}
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-live-ping rounded-full bg-success" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <h3 className="panel-title !text-cream">Live Orders</h3>
            <span className="ml-auto text-xs text-tan">auto-refresh 15s</span>
          </div>
          {ordersLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-40" />
                  </div>
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          ) : ordersEmpty ? (
            <EmptyState
              emoji="🛎️"
              title="No orders yet"
              message="The counter is quiet. Kick off a few orders to see the live feed in action."
              actionLabel="Simulate some orders"
              onAction={async () => {
                await demo.triggerRush();
                await ordersQ.refetch();
              }}
            />
          ) : (
            <ul className="max-h-[420px] overflow-y-auto pr-1">
              {liveOrders.map((o, i) => (
                <OrderItem key={o.id} order={o} index={i} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ROW 4 — Revenue trend */}
      <Card title="Revenue Trend — Last 14 Days">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={REVENUE_14} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C8893A" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#C8893A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A1F12" vertical={false} />
            <XAxis dataKey="date" stroke="#A89880" fontSize={11} tickLine={false} axisLine={false} interval={1} />
            <YAxis stroke="#A89880" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<RevenueTooltip />} />
            <Area type="monotone" dataKey="revenue" stroke="#C8893A" strokeWidth={2.5} fill="url(#revFill)" isAnimationActive animationDuration={900} />
            <Line type="monotone" dataKey="prev" stroke="#A89880" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive animationDuration={900} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-2 flex gap-4 text-xs text-tan">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-crema" /> This period</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-tan" /> Previous period</span>
        </div>
      </Card>
    </div>
  );
}

// Small helpers used in JSX above.
function QuickStat({ label, value, tone }: { label: string; value: string; tone: "alert" | "crema" | "sage" }) {
  const color = tone === "alert" ? "text-alert" : tone === "sage" ? "text-sage" : "text-crema";
  return (
    <div className="rounded-xl border border-espresso-border bg-espresso-bg/50 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-tan">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
function fullDay(short: string): string {
  const map: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return map[short] ?? short;
}
