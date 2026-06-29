import { TrendingDown, TrendingUp } from "lucide-react";

import { percent } from "../utils/format";

interface Props {
  value: number;
  suffix?: string;
  className?: string;
}

/** Color-coded percentage chip with a + / - sign and trend arrow. */
export default function Delta({ value, suffix, className = "" }: Props) {
  const positive = value >= 0;
  return (
    <span
      className={`chip ${positive ? "bg-success/10 text-success" : "bg-alert/10 text-alert"} ${className}`}
    >
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <span className="num">{percent(value)}</span>
      {suffix && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  );
}
