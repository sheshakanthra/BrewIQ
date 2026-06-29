import { useState } from "react";
import { Clock, Loader2, Plus, Sparkles, TrendingDown, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Card from "../components/Card";
import Skeleton from "../components/Skeleton";
import { useApi } from "../hooks/useApi";
import {
  smartSchedule,
  staff as staffApi,
  type CoverageHour,
  type ScheduleGap,
  type StaffRow,
  type WeeklySchedule,
} from "../utils/api";
import { currency } from "../utils/format";

const BLUE = "#5B8DEF";
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20

const fmtHM = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
const roleStyle = (role: string) =>
  role === "manager"
    ? "bg-crema/15 text-crema"
    : role === "cashier"
      ? "bg-[#5B8DEF]/15 text-[#9bb8f5]"
      : "bg-sage/15 text-sage";

// ─────────────────────── Sample fallbacks (offline) ─────────────────────────
const SAMPLE_STAFF: StaffRow[] = [
  { id: 1, name: "Maya Rodriguez", role: "manager", shift_start: "07:00:00", shift_end: "15:00:00", hourly_rate: 26, is_active: true, today_shift: { id: 1, staff_id: 1, date: "", start_time: "07:00:00", end_time: "15:00:00", notes: null }, on_shift_now: true },
  { id: 2, name: "Jordan Lee", role: "barista", shift_start: "07:00:00", shift_end: "15:00:00", hourly_rate: 17, is_active: true, today_shift: { id: 2, staff_id: 2, date: "", start_time: "07:00:00", end_time: "15:00:00", notes: null }, on_shift_now: true },
  { id: 3, name: "Priya Sharma", role: "barista", shift_start: "13:00:00", shift_end: "21:00:00", hourly_rate: 16.5, is_active: true, today_shift: { id: 3, staff_id: 3, date: "", start_time: "13:00:00", end_time: "21:00:00", notes: null }, on_shift_now: false },
  { id: 4, name: "Diego Torres", role: "cashier", shift_start: "13:00:00", shift_end: "21:00:00", hourly_rate: 15.5, is_active: true, today_shift: { id: 4, staff_id: 4, date: "", start_time: "13:00:00", end_time: "21:00:00", notes: null }, on_shift_now: false },
];

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildSampleSchedule(): WeeklySchedule {
  const start = mondayOf(new Date());
  const days = DAY_NAMES.map((name, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekend = i >= 5;
    const crew = weekend ? SAMPLE_STAFF.filter((s) => s.id === 1 || s.id === 3) : SAMPLE_STAFF;
    return {
      date: date.toISOString().slice(0, 10),
      day_of_week: name,
      shifts: crew.map((s) => ({
        id: s.id * 100 + i, staff_id: s.id, staff_name: s.name, role: s.role,
        start_time: s.shift_start, end_time: s.shift_end, notes: null,
      })),
    };
  });
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { week_start: start.toISOString().slice(0, 10), week_end: end.toISOString().slice(0, 10), days };
}

const SAMPLE_COVERAGE: CoverageHour[] = [
  { hour: 7, staff_count: 2, needed: 1, expected_orders: 3.8, understaffed: false },
  { hour: 8, staff_count: 2, needed: 3, expected_orders: 11.8, understaffed: true },
  { hour: 9, staff_count: 2, needed: 3, expected_orders: 12.8, understaffed: true },
  { hour: 10, staff_count: 2, needed: 2, expected_orders: 6.6, understaffed: false },
  { hour: 11, staff_count: 2, needed: 2, expected_orders: 5.4, understaffed: false },
  { hour: 12, staff_count: 2, needed: 2, expected_orders: 9.4, understaffed: false },
  { hour: 13, staff_count: 4, needed: 3, expected_orders: 10.2, understaffed: false },
  { hour: 14, staff_count: 4, needed: 2, expected_orders: 5.2, understaffed: false },
  { hour: 15, staff_count: 2, needed: 1, expected_orders: 3.2, understaffed: false },
  { hour: 16, staff_count: 2, needed: 1, expected_orders: 4.0, understaffed: false },
  { hour: 17, staff_count: 2, needed: 1, expected_orders: 3.2, understaffed: false },
  { hour: 18, staff_count: 2, needed: 1, expected_orders: 1.8, understaffed: false },
  { hour: 19, staff_count: 2, needed: 1, expected_orders: 2.0, understaffed: false },
  { hour: 20, staff_count: 1, needed: 1, expected_orders: 0.4, understaffed: false },
];

function buildSampleGaps(): ScheduleGap[] {
  const start = mondayOf(new Date());
  const out: ScheduleGap[] = [];
  // Next-week mornings are unstaffed in the seed → strong, realistic gaps.
  for (let i = 7; i <= 9; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dow = DAY_NAMES[i % 7];
    [8, 9, 10].forEach((hour, k) => {
      out.push({
        date: date.toISOString().slice(0, 10),
        day_of_week: dow,
        hour,
        expected_orders: [11.8, 12.8, 6.6][k],
        suggested_count: 3,
        current_count: 0,
        gap: 3,
      });
    });
  }
  return out;
}

// ──────────────────────────── Grouping ──────────────────────────────────────
interface Suggestion {
  id: string;
  type: "add" | "reduce";
  day: string;
  date: string;
  startHour: number;
  endHour: number;
  expected: number;
  current: number;
  count: number;
}

function groupGaps(gaps: ScheduleGap[]): Suggestion[] {
  const byDate: Record<string, ScheduleGap[]> = {};
  gaps.forEach((g) => (byDate[g.date] ??= []).push(g));
  const suggestions: Suggestion[] = [];
  Object.entries(byDate).forEach(([date, rows]) => {
    rows.sort((a, b) => a.hour - b.hour);
    let run: ScheduleGap[] = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0];
      const last = run[run.length - 1];
      suggestions.push({
        id: `${date}-${first.hour}`,
        type: "add",
        day: first.day_of_week,
        date,
        startHour: first.hour,
        endHour: last.hour + 1,
        expected: Math.round(run.reduce((s, r) => s + r.expected_orders, 0)),
        current: Math.min(...run.map((r) => r.current_count)),
        count: Math.max(...run.map((r) => r.gap)),
      });
      run = [];
    };
    rows.forEach((r) => {
      if (run.length && r.hour !== run[run.length - 1].hour + 1) flush();
      run.push(r);
    });
    flush();
  });
  return suggestions.slice(0, 5);
}

function overstaffedInsight(coverage: CoverageHour[]): Suggestion | null {
  const over = coverage.filter((c) => c.staff_count - c.needed >= 2);
  if (!over.length) return null;
  const first = over[0];
  const last = over[over.length - 1];
  return {
    id: "reduce", type: "reduce", day: "Today", date: "",
    startHour: first.hour, endHour: last.hour + 1,
    expected: 0, current: first.staff_count, count: first.staff_count - first.needed,
  };
}

// ════════════════════════════════ Page ══════════════════════════════════════
export default function Staff() {
  const staffQ = useApi<StaffRow[]>(() => staffApi.list(), { intervalMs: 60000 });
  const scheduleQ = useApi<WeeklySchedule>(() => staffApi.schedule(), { intervalMs: 60000 });
  const coverageQ = useApi<CoverageHour[]>(() => staffApi.coverage(), { intervalMs: 60000 });

  const staffLoading = staffQ.loading && !staffQ.data;
  const staffList = staffQ.data && staffQ.data.length ? staffQ.data : SAMPLE_STAFF;
  const schedule = scheduleQ.data ?? buildSampleSchedule();
  const coverage = coverageQ.data && coverageQ.data.length ? coverageQ.data : SAMPLE_COVERAGE;

  // Locally-added shifts (optimistic; survives offline backend).
  const [added, setAdded] = useState<Record<string, { start: string; end: string }>>({});
  const [modal, setModal] = useState<{ staffId: number; staffName: string; date: string; day: string } | null>(null);

  const cellKey = (staffId: number, date: string) => `${staffId}_${date}`;

  const submitShift = async (staffId: number, date: string, start: string, end: string) => {
    setAdded((a) => ({ ...a, [cellKey(staffId, date)]: { start, end } }));
    setModal(null);
    try {
      await staffApi.upsertShift({ staff_id: staffId, date, start_time: start, end_time: end });
      scheduleQ.refetch();
    } catch {
      /* offline — optimistic add stands */
    }
  };

  return (
    <div className="space-y-6">
      {/* TOP — today's staff cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {staffLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={`sk-${i}`} className="!p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-3 w-full" />
              </Card>
            ))
          : staffList.map((s) => (
          <Card key={s.id} className="!p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-crema/15 text-sm font-semibold text-crema ring-1 ring-crema/25">
                {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-cream">{s.name}</p>
                <span className={`chip mt-0.5 ${roleStyle(s.role)}`}>{s.role}</span>
              </div>
              <span className={`chip ml-auto ${s.on_shift_now ? "bg-success/15 text-success" : "bg-espresso-bg text-tan"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.on_shift_now ? "bg-success" : "bg-tan"}`} />
                {s.on_shift_now ? "On shift" : "Off"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-tan">
                <Clock size={14} /> {fmtHM(s.shift_start)}–{fmtHM(s.shift_end)}
              </span>
              <span className="num text-cream">{currency(s.hourly_rate)}/hr</span>
            </div>
          </Card>
        ))}
      </div>

      {/* MIDDLE — weekly schedule grid */}
      <Card title="Weekly Schedule">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* header row */}
            <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-1.5">
              <div />
              {schedule.days.map((d) => (
                <div key={d.date} className="px-1 pb-2 text-center">
                  <p className="text-xs font-semibold text-cream">{d.day_of_week.slice(0, 3)}</p>
                  <p className="num text-[10px] text-tan">{d.date.slice(5)}</p>
                </div>
              ))}
            </div>
            {/* staff rows */}
            {staffList.map((s) => (
              <div key={s.id} className="grid grid-cols-[140px_repeat(7,1fr)] items-center gap-1.5 py-1">
                <div className="truncate pr-2 text-sm text-cream">{s.name.split(" ")[0]}</div>
                {schedule.days.map((d) => {
                  const live = d.shifts.find((sh) => sh.staff_id === s.id);
                  const extra = added[cellKey(s.id, d.date)];
                  const block = live
                    ? { start: live.start_time, end: live.end_time }
                    : extra
                      ? { start: extra.start, end: extra.end }
                      : null;
                  if (block) {
                    return (
                      <div
                        key={d.date}
                        className="rounded-md border border-crema/30 bg-crema/15 px-1 py-1.5 text-center"
                        title={`${s.name}: ${fmtHM(block.start)}–${fmtHM(block.end)}`}
                      >
                        <span className="num text-[10px] font-medium text-crema">
                          {fmtHM(block.start)}–{fmtHM(block.end)}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={d.date}
                      onClick={() => setModal({ staffId: s.id, staffName: s.name, date: d.date, day: d.day_of_week })}
                      className="group flex items-center justify-center rounded-md border border-dashed border-espresso-border py-1.5 text-tan/40 transition hover:border-crema/40 hover:text-crema"
                    >
                      <Plus size={13} className="opacity-0 transition group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* BOTTOM — coverage chart + AI smart schedule */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CoverageChart coverage={coverage} />
        <SmartSchedulePanel
          coverage={coverage}
          staffList={staffList}
          onApply={(sug) => {
            const staffId = staffList[0]?.id ?? 1;
            submitShift(staffId, sug.date, `${String(sug.startHour).padStart(2, "0")}:00`, `${String(sug.endHour).padStart(2, "0")}:00`);
          }}
        />
      </div>

      {modal && (
        <AddShiftModal
          info={modal}
          onClose={() => setModal(null)}
          onSubmit={(start, end) => submitShift(modal.staffId, modal.date, start, end)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Coverage chart ─────────────────────────────────
interface ChartRow { hour: number; label: string; scheduled: number; recommended: number; understaffed: boolean }
function CoverageChart({ coverage }: { coverage: CoverageHour[] }) {
  const data: ChartRow[] = HOURS.map((h) => {
    const c = coverage.find((x) => x.hour === h);
    return {
      hour: h,
      label: hourLabel(h),
      scheduled: c?.staff_count ?? 0,
      recommended: c?.needed ?? 0,
      understaffed: c ? c.staff_count < c.needed : false,
    };
  });

  return (
    <Card title="Staffing vs Demand">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A1F12" vertical={false} />
          <XAxis dataKey="label" stroke="#A89880" fontSize={10} tickLine={false} axisLine={false} interval={1} />
          <YAxis stroke="#A89880" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(245,237,214,0.04)" }}
            contentStyle={{ background: "#1A1108", border: "1px solid #2A1F12", borderRadius: 12, color: "#F5EDD6", fontSize: 12 }}
          />
          <Bar dataKey="scheduled" name="Scheduled" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={800}>
            {data.map((d) => (
              <Cell key={d.hour} fill={d.understaffed ? "#E05252" : BLUE} />
            ))}
          </Bar>
          <Bar dataKey="recommended" name="Recommended" fill="#C8893A" radius={[3, 3, 0, 0]} fillOpacity={0.85} isAnimationActive animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-tan">
        <Legend color={BLUE} label="Scheduled" />
        <Legend color="#C8893A" label="Recommended" />
        <Legend color="#E05252" label="Understaffed" />
      </div>
    </Card>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {label}
    </span>
  );
}

// ───────────────────────── AI smart schedule ────────────────────────────────
function SmartSchedulePanel({
  coverage, staffList, onApply,
}: {
  coverage: CoverageHour[];
  staffList: StaffRow[];
  onApply: (s: Suggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const generate = async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const gaps = await smartSchedule();
      const base = groupGaps(gaps.length ? gaps : buildSampleGaps());
      const over = overstaffedInsight(coverage);
      setSuggestions(over ? [...base, over] : base);
    } catch {
      const over = overstaffedInsight(coverage);
      const base = groupGaps(buildSampleGaps());
      setSuggestions(over ? [...base, over] : base);
    } finally {
      setLoading(false);
    }
  };

  const apply = (s: Suggestion) => {
    onApply(s);
    setApplied((a) => new Set(a).add(s.id));
  };

  const assignee = staffList[0]?.name.split(" ")[0] ?? "a barista";

  return (
    <Card title="AI Smart Schedule" className="border-crema/25">
      <div className="-mt-2 mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-tan">
          <Sparkles size={15} className="text-crema" /> Coverage suggestions from rush-hour demand
        </span>
      </div>

      {!suggestions && (
        <button onClick={generate} disabled={loading} className="btn w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? "Analyzing demand…" : "Generate AI Schedule Suggestions"}
        </button>
      )}

      {suggestions && (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const isApplied = applied.has(s.id);
            if (s.type === "reduce") {
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-xl border border-espresso-border bg-espresso-bg/40 p-3">
                  <TrendingDown size={16} className="mt-0.5 shrink-0 text-sage" />
                  <p className="text-sm text-cream/85">
                    {s.day} {hourLabel(s.startHour)}–{hourLabel(s.endHour)} is consistently overstaffed
                    ({s.count} more than needed) — consider shifting cover to a busier window.
                  </p>
                </div>
              );
            }
            return (
              <div key={s.id} className="flex items-start gap-3 rounded-xl border border-crema/20 bg-crema/5 p-3">
                <Plus size={16} className="mt-0.5 shrink-0 text-crema" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream/90">
                    Add {s.count} {s.count === 1 ? "barista" : "staff"} on{" "}
                    <span className="font-semibold text-cream">{s.day} {hourLabel(s.startHour)}–{hourLabel(s.endHour)}</span>{" "}
                    (predicted <span className="num">{s.expected}</span> orders, currently{" "}
                    <span className="num">{s.current}</span> staff)
                  </p>
                  <p className="mt-0.5 text-xs text-tan">Suggested assignee: {assignee}</p>
                </div>
                <button
                  onClick={() => apply(s)}
                  disabled={isApplied}
                  className={isApplied ? "btn-ghost shrink-0" : "btn shrink-0"}
                >
                  {isApplied ? "Applied ✓" : "Apply"}
                </button>
              </div>
            );
          })}
          <button onClick={generate} disabled={loading} className="btn-ghost w-full">
            <Sparkles size={14} /> Regenerate
          </button>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────────── Add shift modal ──────────────────────────────
function AddShiftModal({
  info, onClose, onSubmit,
}: {
  info: { staffName: string; date: string; day: string };
  onClose: () => void;
  onSubmit: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("15:00");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-espresso-border bg-espresso-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-cream">Add Shift</h3>
          <button onClick={onClose} className="text-tan hover:text-cream"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-tan">
          <span className="text-cream">{info.staffName}</span> · {info.day} {info.date.slice(5)}
        </p>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="text-xs uppercase tracking-wide text-tan">
            Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-espresso-border bg-espresso-bg/60 px-3 py-2 text-cream outline-none focus:border-crema/40" />
          </label>
          <label className="text-xs uppercase tracking-wide text-tan">
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-xl border border-espresso-border bg-espresso-bg/60 px-3 py-2 text-cream outline-none focus:border-crema/40" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onSubmit(start, end)} className="btn"><Plus size={16} /> Add Shift</button>
        </div>
      </div>
    </div>
  );
}
