"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui";

export const fmtDay = (iso: string, long = false) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" });

export const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

/* ---------------- loading data ---------------- */
export type LoadError = null | "missing" | "route" | "failed";

/** Fetches /api/analytics/<endpoint>?days=N and tracks loading, errors and retry. */
export function useAnalytics<T>(endpoint: string, days: number, extra = "") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/analytics/${endpoint}?days=${days}${extra}`, { signal: controller.signal });
        if (res.status === 401) { window.location.assign("/login"); return; }
        if (res.status === 404) {
          // Our route answers with JSON when the *backend* has no endpoint. Anything else means Next.js
          // itself could not find app/api/analytics/<endpoint>/route.ts.
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error === "endpoint_not_found" ? "missing" : "route");
        }
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error && (e.message === "missing" || e.message === "route") ? e.message : "failed");
      }
    })();
    return () => controller.abort();
  }, [endpoint, days, extra, attempt]);

  return { data, error, retry: () => setAttempt((a) => a + 1) };
}

/* ---------------- layout pieces ---------------- */
export function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[17px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

export function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-btn">
      <h3 className="text-[14.5px] font-semibold">{title}</h3>
      {note && <p className="mt-0.5 text-[12.5px] text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Skeleton({ chartHeight = 330 }: { chartHeight?: number }) {
  return (
    <div className="mt-4 animate-pulse space-y-4 motion-reduce:animate-none" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[112px] rounded-xl bg-slate-100" />)}</div>
      <div className="rounded-xl bg-slate-100" style={{ height: chartHeight }} />
    </div>
  );
}

export function ErrorBox({ error, endpoint, label, onRetry }: { error: Exclude<LoadError, null>; endpoint: string; label: string; onRetry: () => void }) {
  const code = (t: string) => <code className="rounded bg-slate-100 px-1">{t}</code>;
  return (
    <div className="mt-4 rounded-xl border border-line bg-white px-5 py-10 text-center text-[14px] shadow-btn">
      <p className="flex items-center justify-center gap-2 text-danger"><Icon name="alert" /> Couldn&apos;t load {label}.</p>
      {error === "route" ? (
        <p className="mx-auto mt-1 max-w-md text-muted">The page&apos;s data route wasn&apos;t found. Check that the file exists at {code(`app/api/analytics/${endpoint}/route.ts`)} (inside the {code("api")} folder, not next to the page).</p>
      ) : error === "missing" ? (
        <p className="mx-auto mt-1 max-w-md text-muted">The backend has no {code(`/analytics/${endpoint}`)} endpoint. Make sure you added the new code to {code("api/analytics.py")} and restarted the backend.</p>
      ) : (
        <p className="mt-1 text-muted">Check that the backend is running, then try again.</p>
      )}
      <button onClick={onRetry} className="mt-3 font-medium text-brand hover:underline">Retry</button>
    </div>
  );
}

/* ---------------- KPI card ---------------- */
type DeltaProps = {
  current: number | null;
  previous: number | null;
  days: number;
  unit?: "percent" | "points"; // percent: relative change of a count. points: change of a rate (0..1)
  good?: "up" | "down";         // which direction is an improvement
};

export function Delta({ current, previous, days, unit = "percent", good = "up" }: DeltaProps) {
  const note = (t: string) => <p className="mt-1 text-[12.5px] text-muted">{t}</p>;
  if (current === null) return note(previous === null ? "Nothing recorded yet" : "No data this period");
  if (previous === null) return note(`No data in the previous ${days} days`);
  if (unit === "percent" && previous === 0) return note(current === 0 ? "No activity in either period" : `New activity (none in the previous ${days} days)`);

  const change = unit === "percent" ? Math.round(((current - previous) / previous) * 100) : Math.round((current - previous) * 100);
  const flat = change === 0;
  const improved = good === "up" ? change > 0 : change < 0;
  const label = flat ? "No change" : unit === "percent" ? `${change > 0 ? "+" : ""}${change}%` : `${change > 0 ? "+" : ""}${change} pts`;
  return (
    <p className={`mt-1 flex items-center gap-1 text-[12.5px] ${flat ? "text-muted" : improved ? "text-success" : "text-danger"}`}>
      <span aria-hidden="true">{flat ? "–" : change > 0 ? "▲" : "▼"}</span>
      <span className="font-medium">{label}</span>
      <span className="text-muted">vs previous {days} days</span>
    </p>
  );
}

export function Kpi({ label, value, hint, ...delta }: { label: string; value: ReactNode; hint?: string } & DeltaProps) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-btn">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[12.5px] text-muted">{hint}</p>}
      <Delta {...delta} />
    </div>
  );
}