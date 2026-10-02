"use client";
import { forwardRef, useId, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/* ---------- Brand ---------- */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0F172A" />
      <path d="M10 6c0 6 12 6 12 12s-12 6-12 8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 6c0 6-12 6-12 12s12 6 12 8" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12.5 11.5h7M12.5 20.5h7" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-[15px] font-semibold tracking-tight ${dark ? "text-white" : "text-ink"}`}>Helix Solutions</span>
    </div>
  );
}

/* ---------- Icons ---------- */
type IconName = "eye" | "eyeOff" | "check" | "alert" | "mail" | "lock" | "chevron";
const paths: Record<IconName, ReactNode> = {
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7.5 8.5 6 8.5-6" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
};
export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "secondary" | "success";
};
const btnBase =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[14.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed";
const btnVariants = {
  primary: "bg-brand text-white shadow-btn hover:bg-[#1d4fd8] active:bg-brand-dark disabled:bg-brand/50",
  secondary: "border border-line bg-white text-ink shadow-btn hover:bg-slate-50 active:bg-slate-100 disabled:text-muted/60",
  success: "bg-success text-white shadow-btn",
};
export function Button({ loading, variant = "primary", className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button className={`${btnBase} ${btnVariants[variant]} ${className}`} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/* ---------- Fields ---------- */
const inputBase =
  "block h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] text-ink placeholder:text-slate-400 transition-shadow focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted";
const inputOk = "border-line hover:border-slate-300 focus:border-brand focus:ring-brand/15";
const inputErr = "border-danger focus:border-danger focus:ring-danger/15";

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger">
      <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; labelRight?: ReactNode };
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, labelRight, type = "text", className = "", ...rest },
  ref
) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">{label}</label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPw && show ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputBase} ${error ? inputErr : inputOk} ${isPw ? "pr-11" : ""} ${className}`}
          {...rest}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted hover:text-ink"
          >
            <Icon name={show ? "eyeOff" : "eye"} className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  );
});

export function SelectField({ label, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-[13.5px] font-medium text-ink">
        {label} <span className="text-[12.5px] font-normal text-muted">Optional</span>
      </label>
      <div className="relative">
        <select id={id} className={`${inputBase} ${inputOk} cursor-pointer appearance-none pr-10 text-slate-600`} {...rest}>
          {children}
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </div>
  );
}

/* ---------- Inline alert ---------- */
export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13.5px] text-red-800">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <span>{children}</span>
    </div>
  );
}

export function FormHeader({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

export function StatusIcon({ name, tone = "brand" }: { name: IconName; tone?: "brand" | "success" }) {
  const t = tone === "success" ? "bg-green-50 text-success ring-green-100" : "bg-blue-50 text-brand ring-blue-100";
  return (
    <div className={`pop mb-5 grid h-12 w-12 place-items-center rounded-full ring-4 ${t}`}>
      <Icon name={name} className="h-6 w-6" />
    </div>
  );
}

export const linkCls = "rounded font-medium text-brand underline-offset-2 hover:text-brand-dark hover:underline";
