"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { Role, readSession, signOut } from "@/lib/auth";
import { Badge, cx } from "@/components/ui";

/* ========================================================================== */
/*  View mode: Phone (Riyo-style mobile frame + bottom tabs) or Desktop       */
/*  (sidebar workspace). Choice is remembered on this device.                 */
/* ========================================================================== */

export type ViewMode = "phone" | "desktop";
const VIEW_KEY = "curapulse_view_mode";

export interface ViewState {
  mode: ViewMode;
  /** true when content should lay out as a single phone column */
  isPhone: boolean;
  /** true when we draw the phone frame (desktop-size screen in phone mode) */
  framed: boolean;
  setMode: (m: ViewMode) => void;
  mounted: boolean;
}

export function useViewState(defaultMode: ViewMode): ViewState {
  const [mode, setModeState] = useState<ViewMode>(defaultMode);
  const [narrow, setNarrow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "phone" || saved === "desktop") setModeState(saved);
    } catch {
      // storage unavailable
    }
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    setMounted(true);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const setMode = useCallback((m: ViewMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(VIEW_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const isPhone = mode === "phone" || narrow;
  return { mode, isPhone, framed: mode === "phone" && !narrow, setMode, mounted };
}

const ViewCtx = createContext<ViewState | null>(null);
export function useView(): ViewState {
  const v = useContext(ViewCtx);
  if (!v) throw new Error("useView must be used inside <Shell>");
  return v;
}

/* ========================================================================== */
/*  Top bar: role switcher + view toggle                                      */
/* ========================================================================== */

const ROLES = [
  { href: "/", label: "Patient" },
  { href: "/doctor", label: "Doctor" },
  { href: "/support", label: "Support Desk" },
  { href: "/admin", label: "Admin" },
];

export function TopBar({ view, role }: { view: ViewState; role?: Role }) {
  const pathname = usePathname() || "/";
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav aria-label="CuraPulse role and view" className="no-print sticky top-0 z-[60] border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <svg viewBox="0 0 48 24" className="h-4 w-6" fill="none" aria-hidden>
              <path d="M2 12h10l4-8 6 16 5-12 3 4h16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="hidden font-brand text-[19px] font-semibold text-ink sm:block">CuraPulse</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-line bg-canvas p-1">
            {ROLES.map((r) => {
              const on = active(r.href);
              return (
                <Link
                  key={r.href}
                  href={r.href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition",
                    on ? "bg-brand text-white" : "text-ink-muted hover:bg-white hover:text-ink"
                  )}
                >
                  {r.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-canvas p-1 md:flex" role="group" aria-label="View mode">
            {(
              [
                ["phone", "Phone view", Smartphone],
                ["desktop", "Desktop view", Monitor],
              ] as [ViewMode, string, typeof Monitor][]
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={view.mode === m}
                onClick={() => view.setMode(m)}
                className={cx(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition",
                  view.mode === m ? "bg-sage text-sage-ink ring-1 ring-brand/40" : "text-ink-muted hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          {role && (
            <button
              type="button"
              onClick={() => {
                signOut(role);
                window.location.replace(`/login?role=${role}`);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ========================================================================== */
/*  Shell                                                                     */
/* ========================================================================== */

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function Shell({
  view,
  product,
  nav,
  active,
  onNav,
  user,
  children,
  overlay,
  hideTabs,
  topHeader,
  requireRole,
}: {
  view: ViewState;
  product: string;
  nav: NavItem[];
  active: string;
  onNav: (key: string) => void;
  user?: { name: string; sub: string; initials: string };
  children: React.ReactNode;
  /** overlays (modals, SOS countdown) — positioned inside the phone frame or the viewport */
  overlay?: React.ReactNode;
  /** hide bottom tabs (e.g. onboarding) */
  hideTabs?: boolean;
  /** top header bar inside the device frame */
  topHeader?: React.ReactNode;
  /** Sends visitors to /login unless they are signed in with this role. */
  requireRole?: Role;
}) {
  const [allowed, setAllowed] = useState(!requireRole);
  useEffect(() => {
    if (!requireRole) return;
    if (readSession(requireRole)) setAllowed(true);
    else window.location.replace(`/login?role=${requireRole}`);
  }, [requireRole]);
  if (!allowed) return <div className="min-h-screen bg-canvas" />;

  const tabs = (
    <nav aria-label={`${product} sections`} className="no-print grid shrink-0 border-t border-line bg-white" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0,1fr))` }}>
      {nav.map((n) => {
        const on = active === n.key;
        const Icon = n.icon;
        return (
          <button
            key={n.key}
            type="button"
            onClick={() => onNav(n.key)}
            aria-current={on ? "page" : undefined}
            className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold", on ? "text-brand" : "text-ink-muted")}
          >
            <span className={cx("flex h-7 w-12 items-center justify-center rounded-full", on && "bg-sage")}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="max-w-full truncate px-0.5">{n.label}</span>
            {!!n.badge && (
              <span className="absolute right-[18%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                {n.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <ViewCtx.Provider value={view}>
      <div className="min-h-screen bg-canvas">
        <TopBar view={view} role={requireRole} />

        {view.isPhone ? (
          <div className={cx(view.framed ? "flex justify-center px-4 py-5" : "")}>
            <div
              className={cx(
                "relative flex flex-col overflow-hidden bg-canvas",
                view.framed ? "h-[calc(100vh-96px)] max-h-[880px] min-h-[560px] w-[400px] rounded-[34px] border border-line shadow-frame" : "h-[calc(100dvh-56px)] w-full"
              )}
            >
              {topHeader}
              <div id="cp-scroll" className="cp-scroll flex-1 overflow-y-auto">
                {children}
              </div>
              {!hideTabs && tabs}
              {overlay && <div className="pointer-events-none absolute inset-0 z-50 [&>*]:pointer-events-auto">{overlay}</div>}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[1600px]">
            <aside className="no-print sticky top-14 flex h-[calc(100vh-56px)] w-60 shrink-0 flex-col border-r border-line bg-white px-3 py-4">
              <div className="mb-4 flex items-center gap-2.5 px-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
                  <svg viewBox="0 0 48 24" className="h-4 w-6" fill="none" aria-hidden>
                    <path d="M2 12h10l4-8 6 16 5-12 3 4h16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-[15px] font-bold leading-tight text-ink">CuraPulse</p>
                  <p className="text-[12px] text-ink-muted">{product}</p>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                {hideTabs
                  ? null
                  : nav.map((n) => {
                      const on = active === n.key;
                      const Icon = n.icon;
                      return (
                        <button
                          key={n.key}
                          type="button"
                          onClick={() => onNav(n.key)}
                          aria-current={on ? "page" : undefined}
                          className={cx(
                            "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-semibold transition",
                            on ? "bg-sage text-sage-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"
                          )}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="flex-1 truncate">{n.label}</span>
                          {!!n.badge && (
                            <Badge tone="crit" noIcon className="!bg-coral !text-white !border-coral px-1.5 text-[11px]">
                              {n.badge}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
              </div>
              {user && (
                <div className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas p-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-[13px] font-bold text-mist-ink">{user.initials}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink">{user.name}</p>
                    <p className="truncate text-[12px] text-ink-muted">{user.sub}</p>
                  </div>
                </div>
              )}
            </aside>
            <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
            {overlay && <div className="pointer-events-none fixed inset-0 z-[70] [&>*]:pointer-events-auto">{overlay}</div>}
          </div>
        )}
      </div>
    </ViewCtx.Provider>
  );
}

/** Grid helper: collapses to one column in phone view regardless of screen width. */
export function useCols(desktop: string, phone = "grid-cols-1"): string {
  const v = useView();
  return v.isPhone ? phone : desktop;
}
