import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  emoji?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => Promise<unknown> | void;
}

/** Friendly empty state with an optional async action button (e.g. "Simulate some orders"). */
export default function EmptyState({ emoji = "☕", title, message, actionLabel, onAction }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!onAction) return;
    setBusy(true);
    try {
      await onAction();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center animate-fade-in">
      <div className="mb-1 text-4xl opacity-80">{emoji}</div>
      <p className="font-semibold text-cream">{title}</p>
      {message && <p className="max-w-xs text-sm text-tan">{message}</p>}
      {actionLabel && onAction && (
        <button onClick={run} disabled={busy} className="btn mt-3">
          {busy && <Loader2 size={15} className="animate-spin" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
