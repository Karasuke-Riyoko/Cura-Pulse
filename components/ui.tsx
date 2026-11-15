"use client";

import React from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, Info, Loader2, WifiOff } from "lucide-react";

/* ========================================================================== */
/*  CuraPulse Design System v1 — shared UI kit                                 */
/*  Calm by default · honest status · coral rationed for emergencies only     */
/* ========================================================================== */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- Buttons ---------------------------------- */

type BtnVariant = "primary" | "secondary" | "tertiary" | "emergency" | "emergencyOutline" | "quiet";
type BtnSize = "lg" | "md" | "sm";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed select-none";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand/30 disabled:bg-slate-200 disabled:text-slate-500",
  secondary:
    "bg-white text-brand border-[1.5px] border-brand hover:bg-sage focus-visible:ring-brand/25 disabled:border-slate-300 disabled:text-slate-400 disabled:bg-white",
  tertiary: "bg-transparent text-brand hover:bg-sage focus-visible:ring-brand/25 disabled:text-slate-400",
  emergency: "bg-coral text-white hover:bg-coral-dark focus-visible:ring-coral/30 disabled:opacity-60",
  emergencyOutline:
    "bg-white text-coral-dark border-[1.5px] border-coral hover:bg-coral-tint focus-visible:ring-coral/25 disabled:opacity-60",
  quiet: "bg-white text-ink border border-line hover:bg-canvas focus-visible:ring-brand/20 disabled:text-slate-400",
};

const BTN_SIZE: Record<BtnSize, string> = {
  lg: "h-12 px-5 text-[15px]",
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-[13px] rounded-lg",
};

export function Button({
  variant = "primary",
  size = "lg",
  full,
  icon,
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  full?: boolean;
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], full && "w-full", className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "lg",
  full,
  icon,
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: BtnVariant; size?: BtnSize; full?: boolean; icon?: React.ReactNode }) {
  return (
    <a {...rest} className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], full && "w-full", className)}>
      {icon}
      {children}
    </a>
  );
}

/* --------------------------- Badges / status ------------------------------ */

export type Tone = "ok" | "info" | "warn" | "crit" | "neutral" | "lav" | "brand";

const BADGE_TONE: Record<Tone, string> = {
  ok: "bg-sage text-sage-ink border-sage-300",
  info: "bg-mist text-mist-ink border-mist-line",
  warn: "bg-caution-tint text-caution-ink border-caution-line",
  crit: "bg-coral-tint text-coral-dark border-coral-line",
  neutral: "bg-slate-100 text-ink-muted border-slate-200",
  lav: "bg-lav text-lav-ink border-lav-line",
  brand: "bg-brand text-white border-brand",
};

const BADGE_ICON: Partial<Record<Tone, React.ReactNode>> = {
  ok: <Check className="h-3 w-3" />,
  info: <Clock className="h-3 w-3" />,
  warn: <AlertTriangle className="h-3 w-3" />,
  crit: <AlertTriangle className="h-3 w-3" />,
  lav: <Info className="h-3 w-3" />,
};

export function Badge({
  tone = "neutral",
  icon,
  noIcon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  noIcon?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-5",
        BADGE_TONE[tone],
        className
      )}
    >
      {!noIcon && (icon ?? BADGE_ICON[tone])}
      {children}
    </span>
  );
}

/* --------------------------------- Alerts --------------------------------- */

type AlertTone = "crit" | "warn" | "info" | "ok" | "offline" | "pending" | "lav";

const ALERT_TONE: Record<AlertTone, { box: string; title: string; icon: React.ReactNode }> = {
  crit: { box: "bg-coral-tint border-coral-line text-coral-dark", title: "text-coral-dark", icon: <AlertTriangle className="h-5 w-5" /> },
  warn: { box: "bg-caution-tint border-caution-line text-caution-ink", title: "text-caution-ink", icon: <AlertTriangle className="h-5 w-5" /> },
  info: { box: "bg-mist border-mist-line text-mist-ink", title: "text-mist-ink", icon: <Info className="h-5 w-5" /> },
  ok: { box: "bg-sage border-sage-300 text-sage-ink", title: "text-sage-ink", icon: <CheckCircle2 className="h-5 w-5" /> },
  offline: { box: "bg-caution-tint border-caution-line text-caution-ink", title: "text-caution-ink", icon: <WifiOff className="h-5 w-5" /> },
  pending: { box: "bg-mist border-mist-line text-mist-ink", title: "text-mist-ink", icon: <Clock className="h-5 w-5" /> },
  lav: { box: "bg-lav border-lav-line text-lav-ink", title: "text-lav-ink", icon: <Info className="h-5 w-5" /> },
};

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = ALERT_TONE[tone];
  return (
    <div role={tone === "crit" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border p-3.5", t.box, className)}>
      <span className="mt-0.5 shrink-0">{icon ?? t.icon}</span>
      <div className="min-w-0 flex-1 text-[14px] leading-snug">
        {title && <p className={cx("font-bold", t.title)}>{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "opacity-95")}>{children}</div>}
        {action && <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Cards --------------------------------- */

type CardTone = "plain" | "sage" | "lav" | "mist" | "emergency";

const CARD_TONE: Record<CardTone, string> = {
  plain: "bg-white border border-line shadow-card",
  sage: "bg-sage border border-sage-300",
  lav: "bg-lav border border-lav-line",
  mist: "bg-mist border border-mist-line",
  emergency: "bg-white border-[1.5px] border-coral",
};

export function Card({
  tone = "plain",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: CardTone }) {
  return (
    <div {...rest} className={cx("rounded-2xl", CARD_TONE[tone], className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[16px] font-bold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-[13px] text-ink-muted">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-muted", className)}>{children}</p>;
}

export function PageTitle({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------------------------------- Forms --------------------------------- */

export const inputCls =
  "w-full h-12 rounded-xl border-[1.5px] border-line-strong bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-slate-50";

export const inputErrCls = "border-coral focus:border-coral focus:ring-coral/15";

export function Field({
  label,
  help,
  error,
  children,
  htmlFor,
  className,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium text-coral-dark">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : help ? (
        <p className="mt-1.5 text-[12.5px] text-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}

export function ChoiceChip({
  on,
  onClick,
  children,
  disabled,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50",
        on ? "border-brand bg-sage text-sage-ink" : "border-line-strong bg-white text-ink hover:border-brand/60",
        className
      )}
    >
      {on && <Check className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-full border border-line bg-white p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-full px-3.5 text-[13px] font-semibold transition",
            value === o.value ? "bg-sage text-sage-ink ring-1 ring-brand/40" : "text-ink-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={cx(
        "relative h-7 w-12 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/25",
        on ? "bg-brand" : "bg-slate-300"
      )}
    >
      <span className={cx("absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
    </button>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[14px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line-strong accent-[#176B63]"
      />
      <span>{children}</span>
    </label>
  );
}

/* --------------------------------- Avatars -------------------------------- */

export function Avatar({ initials, size = 40, tone = "mist" }: { initials: string; size?: number; tone?: "mist" | "sage" | "lav" | "brand" }) {
  const t = { mist: "bg-mist text-mist-ink", sage: "bg-sage text-sage-ink", lav: "bg-lav text-lav-ink", brand: "bg-brand text-white" }[tone];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", t)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ----------------------------- Decorative 3D ------------------------------ */
/* 3D stays decorative: welcome + calm empty states only, never near SOS.     */

export function Orb({ size = 120 }: { size?: number }) {
  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 1.15 }} aria-hidden>
      <div
        className="absolute inset-x-0 top-0 rounded-full"
        style={{
          height: size,
          background: "radial-gradient(circle at 32% 28%, #ffffff 0%, #d7efe7 22%, #8fcab9 55%, #3f8f84 85%, #2a6f66 100%)",
          boxShadow: "inset -10px -14px 24px rgba(15,82,75,0.35), 0 18px 30px -12px rgba(23,107,99,0.45)",
        }}
      >
        <svg viewBox="0 0 48 24" className="absolute left-1/2 top-1/2 w-[36%] -translate-x-1/2 -translate-y-1/2" fill="none">
          <path d="M2 12h10l4-8 6 16 5-12 3 4h16" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-slate-400/25 blur-md"
        style={{ bottom: 0, width: size * 0.55, height: size * 0.09 }}
      />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Orb size={72} />
      <p className="mt-1 text-[16px] font-bold text-ink">{title}</p>
      {children && <p className="max-w-xs text-[14px] text-ink-muted">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("rounded-lg bg-slate-200/70", className)} />;
}

/* ---------------------------------- Charts -------------------------------- */
/* Direct labels, shape + line style so series differ without colour,          */
/* a target range and a text summary.                                          */

export interface LineSeries {
  name: string;
  values: number[];
  dashed?: boolean;
  marker?: "circle" | "square";
  color?: string;
}

export function LineChart({
  labels,
  series,
  min,
  max,
  target,
  height = 150,
  unit = "",
  showValues,
}: {
  labels: string[];
  series: LineSeries[];
  min: number;
  max: number;
  target?: { from: number; to: number; label: string };
  height?: number;
  unit?: string;
  showValues?: boolean;
}) {
  const W = 340;
  const H = height;
  const padL = 10;
  const padR = 34;
  const padT = target ? 22 : 14;
  const padB = 22;
  const n = Math.max(labels.length, 2);
  const x = (i: number) => padL + (i * (W - padL - padR)) / (n - 1);
  const y = (v: number) => padT + (1 - (Math.min(Math.max(v, min), max) - min) / (max - min)) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(" and ")}>
      {target && (
        <g>
          <rect x={padL} y={y(target.to)} width={W - padL - padR} height={Math.max(y(target.from) - y(target.to), 2)} fill="#DCEFE8" />
          <text x={padL + 4} y={y(target.to) - 5} fontSize="9.5" fontWeight="700" fill="#263746">
            {target.label}
          </text>
        </g>
      )}
      {labels.map((l, i) => (
        <text key={`${l}-${i}`} x={x(i)} y={H - 6} fontSize="9.5" textAnchor="middle" fill="#4F5F6A">
          {l}
        </text>
      ))}
      {series.map((s, si) => {
        const color = s.color ?? (si === 0 ? "#176B63" : "#263746");
        const last = s.values[s.values.length - 1];
        return (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={color}
              strokeWidth={2.2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {s.values.map((v, i) =>
              (s.marker ?? (si === 0 ? "circle" : "square")) === "circle" ? (
                <circle key={i} cx={x(i)} cy={y(v)} r={3.4} fill={color}>
                  <title>{`${labels[i]}: ${v}${unit ? ` ${unit}` : ""}`}</title>
                </circle>
              ) : (
                <rect key={i} x={x(i) - 3.2} y={y(v) - 3.2} width={6.4} height={6.4} fill={color}>
                  <title>{`${labels[i]}: ${v}${unit ? ` ${unit}` : ""}`}</title>
                </rect>
              )
            )}
            {showValues &&
              s.values.map((v, i) => (
                <text key={`v${i}`} x={x(i)} y={y(v) - 8} fontSize="9.5" fontWeight="700" textAnchor="middle" fill="#263746">
                  {v}
                </text>
              ))}
            {last !== undefined && !showValues && (
              <text x={x(s.values.length - 1) + 7} y={y(last) + 4} fontSize="10.5" fontWeight="700" fill="#263746">
                {last}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ labels, values, height = 150 }: { labels: string[]; values: number[]; height?: number }) {
  const W = 340;
  const H = height;
  const padT = 18;
  const padB = 22;
  const max = Math.max(...values, 1);
  const bw = (W / labels.length) * 0.56;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Bar chart">
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke="#C3D0CB" />
      {values.map((v, i) => {
        const cxv = (W / labels.length) * (i + 0.5);
        const h = ((H - padT - padB) * v) / max;
        return (
          <g key={i}>
            <rect x={cxv - bw / 2} y={H - padB - h} width={bw} height={h} rx={4} fill="#176B63" />
            <text x={cxv} y={H - padB - h - 5} fontSize="10" fontWeight="700" textAnchor="middle" fill="#263746">
              {v}
            </text>
            <text x={cxv} y={H - 6} fontSize="9.5" textAnchor="middle" fill="#4F5F6A">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressBar({ value, max = 100, tone = "brand" }: { value: number; max?: number; tone?: "brand" | "warn" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cx("h-full rounded-full", tone === "brand" ? "bg-brand" : "bg-caution")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------------------------- Toast --------------------------------- */

export function Toast({ msg, tone = "ok", onClose }: { msg: string; tone?: "ok" | "info" | "warn" | "crit"; onClose: () => void }) {
  const t = { ok: "bg-ink text-white", info: "bg-ink text-white", warn: "bg-caution-tint text-caution-ink border border-caution-line", crit: "bg-coral text-white" }[tone];
  return (
    <div role="status" className={cx("flex items-start gap-3 rounded-xl px-4 py-3 text-[14px] font-medium shadow-frame", t)}>
      <span className="flex-1">{msg}</span>
      <button type="button" onClick={onClose} className="text-[13px] font-bold underline-offset-2 hover:underline">
        Dismiss
      </button>
    </div>
  );
}

/* --------------------------------- Timeline ------------------------------- */

export function Timeline({
  items,
}: {
  items: { title: React.ReactNode; sub?: React.ReactNode; state: "done" | "active" | "pending" | "failed" }[];
}) {
  return (
    <ol className="space-y-0">
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-line-strong" aria-hidden />}
          <span
            className={cx(
              "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]",
              it.state === "done" && "border-brand bg-sage text-brand",
              it.state === "active" && "border-brand border-dashed bg-white text-brand",
              it.state === "pending" && "border-dashed border-line-strong bg-white text-ink-soft",
              it.state === "failed" && "border-coral bg-coral-tint text-coral-dark"
            )}
          >
            {it.state === "done" ? (
              <Check className="h-3.5 w-3.5" />
            ) : it.state === "failed" ? (
              <AlertTriangle className="h-3 w-3" />
            ) : it.state === "active" ? (
              <Clock className="h-3 w-3" />
            ) : null}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">{it.title}</p>
            {it.sub && <p className="text-[12.5px] text-ink-muted">{it.sub}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
