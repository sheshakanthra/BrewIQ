import axios from "axios";

export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Shared Axios instance pointed at the BrewIQ backend. */
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// ---- Types --------------------------------------------------------------
export interface BriefingMetrics {
  todays_revenue: number;
  todays_orders: number;
  yesterdays_revenue: number;
  revenue_vs_yesterday_pct: number;
  avg_order_value: number;
  alerts_count: number;
  scheduled_staff: number;
  understaffed_hours: number[];
  top_item: string | null;
}

export interface Briefing {
  briefing_text: string;
  alerts_count: number;
  generated_at: string;
  model: string;
  key_metrics: BriefingMetrics;
}

export interface RushInsights {
  explanation: string;
  peak_hour: number | null;
  recommendation: string;
  generated_at: string;
}

export interface OrderLine {
  name: string;
  price: number;
  quantity: number;
}

export interface OrderRow {
  id: number;
  created_at: string;
  items: OrderLine[] | string;
  total_price: number;
  status: string;
  customer_name?: string | null;
  order_type: string;
}

// ---- Health -------------------------------------------------------------
export const getHealth = () => api.get("/api/health").then((r) => r.data);

export interface AskResponse {
  answer: string;
  model: string;
  generated_at: string;
}

export interface InsightLog {
  id: number;
  type: string;
  content: string;
  created_at: string;
}

// ---- AI -----------------------------------------------------------------
export const ai = {
  briefing: (refresh = false) =>
    api.post<Briefing>(`/api/ai/briefing${refresh ? "?refresh=true" : ""}`).then((r) => r.data),
  rushInsights: () => api.get<RushInsights>("/api/ai/rush-insights").then((r) => r.data),
  insights: () => api.get<InsightLog[]>("/api/ai/insights").then((r) => r.data),
};

/**
 * Stream an answer from POST /api/ai/ask token by token.
 * Uses fetch() + a ReadableStream reader (axios can't stream response bodies).
 * `onToken` is called with each decoded chunk as it arrives.
 */
export async function askStream(
  question: string,
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onToken(chunk);
  }
}

// ---- Orders -------------------------------------------------------------
export const getOrders = (limit = 15) =>
  api.get<OrderRow[]>(`/api/orders?limit=${limit}`).then((r) => r.data);

// ---- Inventory ----------------------------------------------------------
export interface InventoryItemRow {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  cost_per_unit: number;
  supplier?: string | null;
  last_restocked_at?: string | null;
  low_stock: boolean;
}

export interface BurnRow {
  item_name: string;
  unit: string;
  current_qty: number;
  units_used_per_day: number;
  projected_days_remaining: number | null;
}

export const inventory = {
  list: () => api.get<InventoryItemRow[]>("/api/inventory").then((r) => r.data),
  analytics: () => api.get<BurnRow[]>("/api/inventory/analytics").then((r) => r.data),
  restock: (id: number, amount: number) =>
    api.post(`/api/inventory/${id}/restock`, { amount }).then((r) => r.data),
  updateQty: (id: number, quantity: number) =>
    api.put(`/api/inventory/${id}`, { quantity }).then((r) => r.data),
};

// ---- AI reorder ---------------------------------------------------------
export interface ReorderStep {
  tool: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ReorderRec {
  item: string;
  recommended_qty: number;
  estimated_cost: number;
  urgency: string;
  reason: string;
  reasoning_steps: ReorderStep[];
}

export const aiReorder = (items: Record<string, unknown>[]) =>
  api.post<ReorderRec[]>("/api/ai/reorder-recommendations", { items }).then((r) => r.data);

// ---- Staff & scheduling -------------------------------------------------
export interface ShiftInfo {
  id: number;
  staff_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
}

export interface StaffRow {
  id: number;
  name: string;
  role: string;
  shift_start: string | null;
  shift_end: string | null;
  hourly_rate: number;
  is_active: boolean;
  today_shift: ShiftInfo | null;
  on_shift_now: boolean;
}

export interface ScheduledShift {
  id: number;
  staff_id: number;
  staff_name: string;
  role: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
}

export interface ScheduleDay {
  date: string;
  day_of_week: string;
  shifts: ScheduledShift[];
}

export interface WeeklySchedule {
  week_start: string;
  week_end: string;
  days: ScheduleDay[];
}

export interface CoverageHour {
  hour: number;
  staff_count: number;
  needed: number;
  expected_orders: number;
  understaffed: boolean;
}

export interface ScheduleGap {
  date: string;
  day_of_week: string;
  hour: number;
  expected_orders: number;
  suggested_count: number;
  current_count: number;
  gap: number;
}

export interface ShiftUpsert {
  id?: number;
  staff_id: number;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
}

export const staff = {
  list: () => api.get<StaffRow[]>("/api/staff").then((r) => r.data),
  schedule: (week?: string) =>
    api
      .get<WeeklySchedule>(`/api/staff/schedule${week ? `?week=${week}` : ""}`)
      .then((r) => r.data),
  coverage: (day?: string) =>
    api.get<CoverageHour[]>(`/api/staff/coverage${day ? `?day=${day}` : ""}`).then((r) => r.data),
  upsertShift: (payload: ShiftUpsert) =>
    api.post<ShiftInfo>("/api/staff/shifts", payload).then((r) => r.data),
};

export const smartSchedule = () =>
  api.get<ScheduleGap[]>("/api/ai/smart-schedule").then((r) => r.data);

// ---- Demo controls (gated by DEMO_MODE on the backend) ------------------
export const demo = {
  startSimulation: () => api.post("/api/demo/start-simulation").then((r) => r.data),
  stopSimulation: () => api.post("/api/demo/stop-simulation").then((r) => r.data),
  triggerRush: () => api.post("/api/demo/trigger-rush").then((r) => r.data),
  triggerLowStock: () => api.post("/api/demo/trigger-low-stock").then((r) => r.data),
  reset: () => api.post("/api/demo/reset").then((r) => r.data),
};
