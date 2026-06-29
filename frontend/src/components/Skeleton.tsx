interface Props {
  className?: string;
  style?: React.CSSProperties;
}

/** A single shimmering placeholder block. Compose these to match content shape. */
export default function Skeleton({ className = "", style }: Props) {
  return <div className={`skeleton ${className}`} style={style} />;
}

const LINE_WIDTHS = ["100%", "92%", "97%", "68%", "85%"];

/** A few stacked lines of shimmer, for paragraph-shaped content. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: LINE_WIDTHS[i % LINE_WIDTHS.length] }} />
      ))}
    </div>
  );
}
