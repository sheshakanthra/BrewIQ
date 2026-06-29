import { useEffect, useState } from "react";

interface Props {
  withDate?: boolean;
  className?: string;
}

/** Self-contained ticking clock — isolated so only it re-renders each second. */
export default function LiveClock({ withDate = false, className = "" }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <span className={`num ${className}`}>
      {time}
      {withDate && (
        <span className="ml-2 font-sans text-tan">
          {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      )}
    </span>
  );
}
