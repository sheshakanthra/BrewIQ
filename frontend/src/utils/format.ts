import { formatDistanceToNowStrict } from "date-fns";

/** Money — always $ prefix, exactly 2 decimals (render inside a `.num` element for DM Mono). */
export const currency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

/** Percentage with explicit + / - sign, one decimal. */
export const percent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Relative timestamp like "2 hours ago" / "5 minutes ago". */
export const timeAgo = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNowStrict(date, { addSuffix: true });
};
