"use client";
import { useState } from "react";
import QualitySection from "./analytics/QualitySection";
import UsageSection from "./analytics/UsageSection";

const RANGES = [7, 30, 90] as const;

/* Shell: the date range is shared by every section. Each new analytics feature adds a section below. */
export default function AnalyticsDashboard() {
  const [days, setDays] = useState<number>(30);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Analytics</h1>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">How Helix Policy Copilot is used, and how well it works. Only admins can see this page.</p>
        </div>
        <div role="group" aria-label="Date range" className="flex rounded-lg border border-line bg-white p-0.5 shadow-btn">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)} aria-pressed={days === r} className={`h-9 rounded-md px-3.5 text-[13.5px] font-medium transition-colors ${days === r ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-12">
        <UsageSection days={days} />
        <QualitySection days={days} />
      </div>
    </>
  );
}