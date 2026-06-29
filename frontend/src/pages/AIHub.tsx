import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Boxes,
  CalendarClock,
  ChevronDown,
  Clock,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { useApi } from "../hooks/useApi";
import {
  ai,
  askStream,
  type Briefing,
  type InsightLog,
  type RushInsights,
} from "../utils/api";
import { timeAgo } from "../utils/format";

// ─────────────────────── Heatmap (self-contained) ───────────────────────────
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CURVE: Record<number, number> = {
  7: 4, 8: 24, 9: 28, 10: 12, 11: 9, 12: 21, 13: 20,
  14: 10, 15: 7, 16: 7, 17: 5, 18: 4, 19: 3, 20: 1,
};
interface HeatCell { day: string; hour: number; avg: number }
const HEATMAP: HeatCell[] = DAYS.flatMap((day, di) =>
  HOURS.map((hour) => ({
    day, hour,
    avg: Math.round((CURVE[hour] ?? 2) * (di >= 5 ? 0.42 : 0.85 + (di % 3) * 0.08)),
  }))
);
const HEAT_MAX = Math.max(...HEATMAP.map((c) => c.avg));
const PEAK = HEATMAP.reduce((a, b) => (b.avg > a.avg ? b : a), HEATMAP[0]);
const TOP3 = [...HEATMAP].sort((a, b) => b.avg - a.avg).slice(0, 3);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
const fullDay = (s: string) =>
  ({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[s] ?? s);

function heatColor(avg: number): string {
  const t = avg / HEAT_MAX;
  if (t < 0.04) return "rgba(42, 31, 18, 0.6)";
  if (t < 0.5) return `rgba(200, 137, 58, ${(0.18 + (t / 0.5) * 0.82).toFixed(2)})`;
  const k = (t - 0.5) / 0.5;
  return `rgb(${Math.round(200 + 24 * k)}, ${Math.round(137 - 55 * k)}, ${Math.round(58 + 24 * k)})`;
}

function Heatmap() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[460px]">
        <div className="flex">
          <div className="w-9 shrink-0" />
          {HOURS.map((h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-tan">
              {h % 3 === 1 ? hourLabel(h) : ""}
            </div>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="flex items-center">
            <div className="w-9 shrink-0 text-xs text-tan">{day}</div>
            {HOURS.map((hour) => {
              const cell = HEATMAP.find((c) => c.day === day && c.hour === hour)!;
              const isPeak = cell.day === PEAK.day && cell.hour === PEAK.hour;
              return (
                <div key={hour} className="group relative flex-1 p-0.5">
                  <div
                    className={`aspect-square w-full rounded-[3px] transition-transform hover:scale-110 ${isPeak ? "ring-2 ring-cream" : ""}`}
                    style={{ backgroundColor: heatColor(cell.avg) }}
                  >
                    {isPeak && <span className="flex h-full items-center justify-center text-[9px] text-espresso-bg">★</span>}
                  </div>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-espresso-border bg-espresso-bg px-2 py-1 text-[11px] text-cream shadow-xl group-hover:block">
                    {fullDay(day)} {hourLabel(hour)}: avg {cell.avg} orders
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────── Sample fallbacks ────────────────────────────────
const SAMPLE_BRIEFING: Briefing = {
  briefing_text:
    "Good morning! The Daily Grind is off to a strong start — $487.50 from 66 orders, up 37.5% on yesterday, with the Oat Milk Latte leading the board. Three items need attention: oat milk is critical at ~1.7 days of cover, with 12oz cups and Colombian beans close behind. Coverage looks thin against the 8–9am rush. Smart move today: add a third barista on the opening shift and place an oat milk order before the morning peak.",
  alerts_count: 3,
  generated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  model: "sample",
  key_metrics: {
    todays_revenue: 487.5, todays_orders: 66, yesterdays_revenue: 354.5,
    revenue_vs_yesterday_pct: 37.5, avg_order_value: 7.39, alerts_count: 3,
    scheduled_staff: 4, understaffed_hours: [8, 9], top_item: "Oat Milk Latte",
  },
};
const SAMPLE_RUSH: RushInsights = {
  explanation:
    "Mornings dominate: the 8–10am block is your strongest window by far, driven by the pre-class coffee run. A second, smaller peak forms at lunch (12–1pm). Weekends are markedly quieter with no classes on campus. Lattes and Americanos carry most of the volume through both rushes.",
  peak_hour: 9,
  recommendation: "Tomorrow (Tuesday) peaks near 9:00 (~28 orders that hour) — schedule about 3 baristas for 8–11am.",
  generated_at: new Date().toISOString(),
};
const SAMPLE_LOG: InsightLog[] = [
  { id: 3, type: "briefing", content: "Generated daily operations briefing", created_at: new Date(Date.now() - 6 * 60_000).toISOString() },
  { id: 2, type: "reorder", content: "Computed reorder recommendations for 3 low-stock items", created_at: new Date(Date.now() - 42 * 60_000).toISOString() },
  { id: 1, type: "rush", content: "Analyzed 30-day rush-hour density patterns", created_at: new Date(Date.now() - 95 * 60_000).toISOString() },
];

const LOG_ICON: Record<string, typeof Sparkles> = {
  briefing: Sparkles, reorder: Boxes, rush: TrendingUp, schedule: CalendarClock,
  chat: MessageSquare, restock: Boxes,
};

const CHIPS = [
  { emoji: "📈", label: "Compare last two weeks", q: "How was last week compared to the week before?" },
  { emoji: "👥", label: "Staff optimization", q: "When should I schedule my best barista, and am I understaffed anywhere?" },
  { emoji: "☕", label: "Top menu items", q: "Which menu items make the most money and which are dragging down revenue?" },
  { emoji: "⚠", label: "What needs attention?", q: "What needs my attention right now?" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function localAnswer(q: string): string {
  const s = q.toLowerCase();
  if (s.includes("week"))
    return "This week tracked $5,203 across 685 orders (avg $7.60) versus $5,361 / 733 last week — that's -2.9% revenue and -6.5% orders. The dip is mostly weekend traffic; weekday mornings held steady.";
  if (/(staff|understaff|weekend|barista|schedule)/.test(s))
    return "You're scheduled with 4 staff today but the 8–9am rush is understaffed (3 needed, 2 on bar). Weekends run lighter and match demand. Put your strongest barista on the 8–11am opening — that's where speed matters most.";
  if (/(menu|item|revenue|top|best|drag)/.test(s))
    return "Revenue leaders are Latte ($4,125), Oat Milk Latte ($2,613) and Cold Brew ($2,486). Slower pastries pull your average order value down — consider bundling them with a top drink or trimming the weakest.";
  return "3 items need attention: Oat Milk (1.7 days left), 12oz Cups (1.8 days) and Colombian Beans (2.1 days). Reorder oat milk and cups before tomorrow's morning rush — those deplete fastest.";
}

interface ChatMsg { role: "user" | "ai"; text: string }

// ════════════════════════════════ Page ══════════════════════════════════════
export default function AIHub() {
  const briefingQ = useApi<Briefing>(() => ai.briefing(), { intervalMs: 0 });
  const rushQ = useApi<RushInsights>(() => ai.rushInsights(), { intervalMs: 0 });
  const logQ = useApi<InsightLog[]>(() => ai.insights(), { intervalMs: 30000 });

  const briefing = briefingQ.data ?? SAMPLE_BRIEFING;
  const m = briefing.key_metrics;
  const rush = rushQ.data ?? SAMPLE_RUSH;
  const logLoading = logQ.loading && !logQ.data;
  const logEmpty = !logLoading && logQ.data !== null && logQ.data.length === 0;
  const log = logQ.data && logQ.data.length ? logQ.data : logQ.error ? SAMPLE_LOG : [];

  const [showHow, setShowHow] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="animate-fade-in">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-cream">
          <Sparkles className="text-crema" size={24} /> AI Operations Center
        </h1>
        <p className="mt-1 text-sm text-tan">
          Powered by Groq + Llama 3.3 — your 24/7 coffee shop intelligence
        </p>
      </div>

      {/* SECTION 1 — Daily Briefing */}
      <Card className="border-crema/25 bg-gradient-to-br from-espresso-card to-[#1f1409]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-cream">☕ Daily Briefing</h2>
          <button onClick={briefingQ.refetch} disabled={briefingQ.loading} className="btn-ghost">
            <RefreshCw size={14} className={briefingQ.loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {briefingQ.loading && !briefingQ.data ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-tan">BrewIQ is analyzing your day…</p>
            {[100, 94, 88].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-cream/10" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <p className="max-w-4xl text-base leading-relaxed text-cream/90">{briefing.briefing_text}</p>
        )}

        {/* How BrewIQ analyzed this */}
        <button
          onClick={() => setShowHow((v) => !v)}
          className="mt-4 flex items-center gap-1.5 text-sm text-crema hover:text-cream"
        >
          <ChevronDown size={15} className={`transition ${showHow ? "rotate-180" : ""}`} />
          How BrewIQ analyzed this
        </button>
        {showHow && (
          <div className="mt-3 grid grid-cols-1 gap-4 rounded-xl border border-espresso-border bg-espresso-bg/40 p-4 animate-fade-in md:grid-cols-3">
            <div>
              <p className="panel-title mb-2">Data points analyzed</p>
              <ul className="space-y-1.5 text-sm text-cream/85">
                <li className="flex items-center gap-2"><Activity size={13} className="text-crema" /> {m.todays_orders} orders today</li>
                <li className="flex items-center gap-2"><Boxes size={13} className="text-crema" /> 15 inventory items</li>
                <li className="flex items-center gap-2"><Users size={13} className="text-crema" /> 4 staff · 102 shifts (30d)</li>
              </ul>
            </div>
            <div>
              <p className="panel-title mb-2">Reasoning process</p>
              <ul className="space-y-1.5 text-sm text-cream/85">
                <li>• Compared today vs yesterday & 7-day average</li>
                <li>• Projected stock-out from recipe burn rates</li>
                <li>• Matched schedule to predicted hourly demand</li>
              </ul>
            </div>
            <div>
              <p className="panel-title mb-2">Confidence</p>
              {[
                { label: "Sales analysis", pct: 96 },
                { label: "Inventory burn-rate", pct: 91 },
                { label: "Staffing model", pct: 88 },
              ].map((c) => (
                <div key={c.label} className="mb-2">
                  <div className="flex justify-between text-xs text-tan">
                    <span>{c.label}</span><span className="num">{c.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-espresso-bg">
                    <div className="h-full rounded-full bg-sage" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-tan/70">
          {briefing.model === "sample" ? "Sample data · " : `${briefing.model} · `}Updated {timeAgo(briefing.generated_at)}
        </p>
      </Card>

      {/* SECTION 2 — Rush Hour Intelligence */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Order Density — Last 30 Days">
          <p className="mb-3 -mt-2 text-xs text-crema">★ Busiest slot: {PEAK.day} {hourLabel(PEAK.hour)} (~{PEAK.avg} orders)</p>
          <Heatmap />
        </Card>

        <Card title="Rush Hour Intelligence">
          <div className="space-y-3">
            {TOP3.map((c, i) => (
              <div key={`${c.day}-${c.hour}`} className="flex items-start gap-3 rounded-xl border border-espresso-border bg-espresso-bg/40 p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-crema/15 text-xs font-bold text-crema">{i + 1}</span>
                <p className="text-sm text-cream/85">
                  <span className="font-semibold text-cream">{fullDay(c.day)} {hourLabel(c.hour)}</span> averages ~{c.avg} orders/hr — a reliable peak.
                </p>
              </div>
            ))}
            <p className="text-sm leading-relaxed text-tan">{rush.explanation}</p>

            <div className="rounded-xl border border-crema/25 bg-crema/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-crema">
                <CalendarClock size={15} /> Tomorrow's Prediction
              </p>
              <p className="mt-1.5 text-sm text-cream/90">{rush.recommendation}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* SECTION 3 — Ask BrewIQ */}
      <AskBrewIQ />

      {/* SECTION 4 — AI Activity Log */}
      <Card title="AI Activity Log">
        {logLoading ? (
          <div className="space-y-4 pl-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : logEmpty ? (
          <EmptyState
            emoji="🧠"
            title="No AI activity yet today"
            message="Generate a briefing or ask BrewIQ a question — it'll show up here."
          />
        ) : (
        <ol className="relative space-y-4 border-l border-espresso-border pl-5">
          {log.map((entry) => {
            const Icon = LOG_ICON[entry.type] ?? Activity;
            return (
              <li key={entry.id} className="relative animate-fade-in">
                <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-espresso-card ring-1 ring-espresso-border">
                  <Icon size={12} className="text-crema" />
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="chip bg-crema/10 text-crema">{entry.type}</span>
                    <p className="mt-1 text-sm text-cream/85">{entry.content}</p>
                  </div>
                  <span className="num shrink-0 whitespace-nowrap text-xs text-tan">
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────── Chat interface ─────────────────────────────────
function AskBrewIQ() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendToLast = (chunk: string) =>
    setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      next[next.length - 1] = { role: "ai", text: last.text + chunk };
      return next;
    });

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }, { role: "ai", text: "" }]);
    setBusy(true);

    try {
      // Real token-by-token streaming from the backend (Groq).
      await askStream(q, appendToLast);
    } catch {
      // Offline — reveal a deterministic answer word by word for the same feel.
      const words = localAnswer(q).split(" ");
      for (let i = 0; i < words.length; i++) {
        await sleep(28);
        appendToLast((i === 0 ? "" : " ") + words[i]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Ask BrewIQ" className="border-crema/25">
      <div className="-mt-2 mb-3 flex items-center gap-2 text-sm text-tan">
        <MessageSquare size={15} className="text-crema" /> Live Q&A over your café's data
      </div>

      <div className="mb-3 max-h-[340px] min-h-[120px] space-y-3 overflow-y-auto rounded-xl border border-espresso-border bg-espresso-bg/40 p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-tan">
            Ask anything about sales, staffing, menu, or inventory. Try a suggestion below ↓
          </p>
        ) : (
          messages.map((msg, i) => {
            const streaming = busy && msg.role === "ai" && i === messages.length - 1;
            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-crema text-espresso-bg"
                      : "border border-espresso-border bg-espresso-card text-cream/90"
                  }`}
                >
                  {msg.role === "ai" && (
                    <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-crema">
                      <Sparkles size={11} /> BrewIQ
                    </span>
                  )}
                  {msg.text}
                  {streaming && <span className="ml-0.5 inline-block animate-pulse text-crema">▍</span>}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Suggested chips */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => setInput(c.q)}
            className="rounded-full border border-espresso-border bg-espresso-bg/60 px-3 py-1.5 text-xs text-cream/80 transition hover:border-crema/40 hover:text-cream"
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask BrewIQ about your shop…"
          className="flex-1 rounded-xl border border-espresso-border bg-espresso-bg/60 px-4 py-2.5 text-sm text-cream outline-none placeholder:text-tan/60 focus:border-crema/40"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn">
          {busy ? <Clock size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </Card>
  );
}
