import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Boxes, Coffee, LayoutDashboard, Sparkles, Users } from "lucide-react";

import ErrorBoundary from "./ErrorBoundary";
import Header from "./Header";
import LiveClock from "./LiveClock";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/ai-hub", label: "AI Hub", icon: Sparkles },
];

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop only (220px) */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-espresso-border bg-espresso-card/70 px-4 py-5 backdrop-blur-md md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-crema to-[#8c5a22] text-espresso-bg shadow-lg shadow-crema/20">
            <Coffee size={22} strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-lg font-bold leading-none tracking-tight text-cream">BrewIQ</p>
            <p className="text-[11px] font-medium uppercase tracking-widest text-crema/80">Ops AI</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-crema/15 text-cream ring-1 ring-crema/25"
                    : "text-tan hover:bg-cream/5 hover:text-cream"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? "text-crema" : "text-tan group-hover:text-cream"} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-espresso-border bg-espresso-bg/60 p-3">
          <p className="text-sm font-semibold text-cream">The Daily Grind</p>
          <p className="text-[11px] text-tan">Campus · Open 7am–9pm</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-tan">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            <LiveClock className="text-cream" />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main key={pathname} className="flex-1 px-4 pb-24 pt-6 animate-fade-in md:px-8 md:pb-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-espresso-border bg-espresso-card/95 backdrop-blur-md md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                isActive ? "text-crema" : "text-tan"
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
