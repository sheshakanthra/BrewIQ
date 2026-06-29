export interface Order {
  id: number;
  item: string;
  category: string;
  quantity: number;
  price: number;
  total: number;
  status: string;
  created_at: string;
}

export interface NewOrder {
  item: string;
  category: string;
  quantity: number;
  price: number;
  status?: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  cost_per_unit: number;
  updated_at: string;
  low_stock: boolean;
}

export interface StaffMember {
  id: number;
  name: string;
  role: string;
  shift: string;
  hourly_rate: number;
  is_active: boolean;
  created_at: string;
}

export interface DashboardSummary {
  total_revenue: number;
  todays_revenue: number;
  total_orders: number;
  todays_orders: number;
  avg_order_value: number;
  low_stock_count: number;
  active_staff: number;
  total_staff: number;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  item: string;
  revenue: number;
  quantity: number;
}

export interface CategoryBreakdown {
  category: string;
  revenue: number;
}

export interface OrderStats {
  summary: DashboardSummary;
  sales_trend: SalesTrendPoint[];
  top_items: TopItem[];
  category_breakdown: CategoryBreakdown[];
}

export interface AIResponse {
  answer: string;
  model: string;
}
