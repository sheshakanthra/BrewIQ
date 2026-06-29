import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  /** e.g. "+37.5%" — colored by `deltaPositive`. */
  delta?: string;
  deltaPositive?: boolean;
  hint?: string;
}

export default function StatCard({ label, value, icon: Icon, delta, deltaPositive, hint }: Props) {
  return (
    <div className="card group relative overflow-hidden p-5 animate-fade-in">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-crema/5 blur-xl transition group-hover:bg-crema/10" />
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-crema/10 text-crema ring-1 ring-crema/20">
          <Icon size={18} />
        </span>
        {delta && (
          <span
            className={`chip ${
              deltaPositive ? "bg-success/10 text-success" : "bg-alert/10 text-alert"
            }`}
          >
            {deltaPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta}
          </span>
        )}
      </div>
      <p className="mt-4 text-sm text-tan">{label}</p>
      <p className="num mt-1 text-2xl font-medium text-cream">{value}</p>
      {hint && <p className="mt-1 text-xs text-tan/70">{hint}</p>}
    </div>
  );
}
