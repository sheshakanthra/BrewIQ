import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Coffee, PlayCircle, RotateCcw, Sparkles, Zap } from "lucide-react";

import { useApi } from "../hooks/useApi";
import { demo, getHealth } from "../utils/api";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Operations Dashboard", subtitle: "Live view of The Daily Grind" },
  "/inventory": { title: "Inventory", subtitle: "Stock levels & reorder alerts" },
  "/staff": { title: "Staff & Scheduling", subtitle: "Shifts and coverage" },
  "/ai-hub": { title: "AI Hub", subtitle: "Briefings, insights & assistants" },
};

export default function Header() {
  const { pathname } = useLocation();
  const meta = TITLES[pathname] ?? { title: "BrewIQ", subtitle: "" };

  // Doubles as the connection check and the "last updated" source.
  const { error, lastUpdated, loading } = useApi(getHealth, { intervalMs: 30000 });
  const online = !error;

  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setStatus(null);
    try {
      await fn();
      setStatus(`${label} ✓`);
    } catch {
      setStatus(`${label} failed — is the backend running with DEMO_MODE=true?`);
    } finally {
      setBusy(null);
    }
  };

  const updated = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-espresso-border bg-espresso-bg/80 px-4 py-4 backdrop-blur-md md:px-8">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-crema to-[#8c5a22] text-espresso-bg md:hidden">
        <Coffee size={18} strokeWidth={2.4} />
      </span>

      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold text-cream md:text-xl">{meta.title}</h1>
        <p className="truncate text-xs text-tan">{meta.subtitle}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Live / Offline badge with pulsing dot */}
        <span
          className={`chip ${online ? "bg-success/10 text-success" : "bg-alert/10 text-alert"}`}
          title={online ? "Connected to backend" : "Backend offline"}
        >
          <span className="relative flex h-2 w-2">
            {online && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-success animate-live-ping" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                online ? "bg-success" : "bg-alert"
              }`}
            />
          </span>
          {loading && !lastUpdated ? "Connecting" : online ? "Live" : "Offline"}
        </span>

        <span className="hidden text-xs text-tan sm:inline">
          Updated <span className="num text-cream">{updated}</span>
        </span>

        {/* Demo controls */}
        <div className="relative">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="btn-ghost"
            aria-expanded={panelOpen}
          >
            <Sparkles size={16} className="text-crema" />
            <span className="hidden sm:inline">Demo</span>
          </button>

          {panelOpen && (
            <div className="absolute right-0 mt-2 w-72 animate-fade-in rounded-2xl border border-espresso-border bg-espresso-card p-3 shadow-2xl">
              <p className="panel-title mb-3 px-1">Demo Controls</p>
              <div className="space-y-2">
                <button
                  onClick={() => run("Start live stream", demo.startSimulation)}
                  disabled={!!busy}
                  className="btn-ghost w-full justify-start"
                >
                  <PlayCircle size={16} className="text-sage" /> Start live order stream
                </button>
                <button
                  onClick={() => run("Trigger rush", demo.triggerRush)}
                  disabled={!!busy}
                  className="btn-ghost w-full justify-start"
                >
                  <Zap size={16} className="text-crema" /> Trigger morning rush
                </button>
                <button
                  onClick={() => run("Trigger alert", demo.triggerLowStock)}
                  disabled={!!busy}
                  className="btn-ghost w-full justify-start"
                >
                  <AlertTriangle size={16} className="text-alert" /> Trigger low-stock alert
                </button>
                <button
                  onClick={() => run("Reset demo", demo.reset)}
                  disabled={!!busy}
                  className="btn-ghost w-full justify-start"
                >
                  <RotateCcw size={16} className="text-tan" /> Reset to seed data
                </button>
              </div>
              <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-tan">
                <Coffee size={12} />
                {busy ? `${busy}…` : status ?? "Make the dashboard feel live."}
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
