"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { REVIEW_LABEL, ROLE_LABEL, TEXT_STATUS_LABEL } from "@/lib/labels";
import type { ReviewStatus, SourceRole, TextStatus } from "@/lib/types";
import { textDiff } from "@/lib/diff";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-[#244ccc] border border-brand",
  secondary: "bg-white text-navy border border-gray-300 hover:bg-gray-50",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100 border border-transparent",
  danger: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  subtle: "bg-brand-50 text-brand border border-brand-100 hover:bg-brand-100",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  busy,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors whitespace-nowrap",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        VARIANT[variant],
        (disabled || busy) && "opacity-45 cursor-not-allowed hover:bg-inherit",
        className,
      )}
    >
      {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "navy" | "purple";
const TONE: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-brand-50 text-brand border-brand-100",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  navy: "bg-navy text-white border-navy",
  purple: "bg-violet-50 text-violet-700 border-violet-200",
};

export function Badge({ tone = "gray", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

const REVIEW_TONE: Record<ReviewStatus, Tone> = { pending: "gray", needs_fix: "red", approved: "green", needs_rereview: "amber" };
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <Badge tone={REVIEW_TONE[status]}>{REVIEW_LABEL[status]}</Badge>;
}

const ROLE_TONE: Record<SourceRole, Tone> = { legal_candidate: "navy", similar_ref: "purple", plan_reflect: "blue", needs_check: "amber" };
export function RoleBadge({ role }: { role: SourceRole }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>;
}

export function TextStatusBadge({ status }: { status: TextStatus }) {
  return <Badge tone={status === "registered" ? "green" : status === "failed" ? "red" : "amber"}>{TEXT_STATUS_LABEL[status]}</Badge>;
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-gray-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-navy">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        {desc && <p className="mt-1 text-[13px] text-gray-600">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="font-semibold text-gray-800">{title}</p>
      {children && <div className="mt-1 text-[13px] text-gray-600">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", children, className }: { tone?: "amber" | "blue" | "red" | "gray"; children: ReactNode; className?: string }) {
  const t = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-brand-100 bg-brand-50 text-navy",
    red: "border-red-200 bg-red-50 text-red-800",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
  }[tone];
  return <div className={cx("rounded-md border px-3 py-2 text-[13px]", t, className)}>{children}</div>;
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "green" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full", tone === "green" ? "bg-emerald-500" : "bg-brand")} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/** 【확인 필요】·【미확정】 표시를 강조해 보여준다 */
export function MarkedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(【[^】]*】)/g);
  return (
    <div className={cx("clause-text", className)}>
      {parts.map((p, i) => (p.startsWith("【") ? <span key={i} className="mark-check">{p}</span> : <span key={i}>{p}</span>))}
    </div>
  );
}

export function DiffView({ before, after, side }: { before: string; after: string; side: "before" | "after" }) {
  const parts = textDiff(before, after);
  return (
    <div className="clause-text text-[13px]">
      {parts.map((p, i) => {
        if (p.type === "same") return <span key={i}>{p.value}</span>;
        if (side === "before" && p.type === "removed") return <del key={i} className="bg-red-100 text-red-800 decoration-red-600">{p.value}</del>;
        if (side === "after" && p.type === "added") return <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline font-semibold">{p.value}</ins>;
        return null;
      })}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none";
