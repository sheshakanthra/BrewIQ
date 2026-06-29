import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  message?: string;
  onRetry?: () => void;
}

/** Inline, non-fatal error with a retry button. */
export default function ErrorState({ message = "Something went wrong loading this.", onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-alert/10 text-alert ring-1 ring-alert/20">
        <AlertTriangle size={20} />
      </span>
      <p className="max-w-xs text-sm text-tan">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost">
          <RotateCcw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
