"use client";
import { useState } from "react";
import { AppIcon } from "../Icons";
import Markdown from "../Markdown";
import { Card, ErrorBox, Kpi, Section, Skeleton, fmtDay, pct, useAnalytics } from "./shared";

type QTotals = { answers: number; rated: number; up: number; down: number; helpfulRate: number | null; ratingCoverage: number | null };
type QDay = { date: string; up: number; down: number };
type Reason = { reason: string; count: number };
type Flagged = {
  messageId: string; askedAt: string; ratedAt: string; question: string; answer: string;
  sources: { source: string; page: number | null }[]; reason: string | null; comment: string | null;
};
type Quality = { rangeDays: number; start: string; end: string; totals: QTotals; previous: QTotals; daily: QDay[]; reasons: Reason[]; downvoted: Flagged[] };

const REASON_LABEL: Record<string, string> = {
  inaccurate: "Inaccurate", not_relevant: "Not relevant", incomplete: "Incomplete", other: "Other", none: "No reason given",
};
const LIMIT = 10;

/* ---------------- stacked bars: helpful / not helpful per day ---------------- */
function RatingsChart({ daily }: { daily: QDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800, H = 240, m = { l: 40, r: 12, t: 12, b: 28 };
  const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
  const n = daily.length;
  const peak = Math.max(...daily.map((d) => d.up + d.down), 0);
  const max = Math.max(4, Math.ceil(peak / 4) * 4);
  const band = innerW / n;
  const barW = Math.max(2, band * 0.62);
  const x = (i: number) => m.l + band * i + band / 2;
  const y = (v: number) => m.t + innerH * (1 - v / max);
  const labelEvery = Math.ceil(n / 7);
  const h = hover !== null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-slate-600">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-success" aria-hidden="true" /> Helpful (👍)</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-danger" aria-hidden="true" /> Not helpful (👎)</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Helpful and not helpful ratings per day, ${fmtDay(daily[0].date)} to ${fmtDay(daily[n - 1].date)}. Data table below.`} onMouseLeave={() => setHover(null)}>
          {[0, 1, 2, 3, 4].map((t) => {
            const v = (max / 4) * t;
            return (
              <g key={t}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748B">{v}</text>
              </g>
            );
          })}
          {daily.map((d, i) => (
            <g key={d.date} opacity={hover === null || hover === i ? 1 : 0.45}>
              <rect x={x(i) - barW / 2} y={y(d.up)} width={barW} height={Math.max(0, m.t + innerH - y(d.up))} fill="#16A34A" rx="2" />
              <rect x={x(i) - barW / 2} y={y(d.up + d.down)} width={barW} height={Math.max(0, y(d.up) - y(d.up + d.down))} fill="#DC2626" rx="2" />
            </g>
          ))}
          {daily.map((d, i) => i % labelEvery === 0 && (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B">{fmtDay(d.date)}</text>
          ))}
          {daily.map((d, i) => (
            <rect key={d.date} x={m.l + band * i} y={m.t} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} />
          ))}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] shadow-card" style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}>
            <p className="font-medium">{fmtDay(h.date, true)}</p>
            <p className="mt-1 text-slate-600">Helpful: <span className="font-semibold text-ink">{h.up}</span></p>
            <p className="text-slate-600">Not helpful: <span className="font-semibold text-ink">{h.down}</span></p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Helpful and not helpful ratings per day</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Helpful</th><th scope="col">Not helpful</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.up}</td><td>{d.down}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/* ---------------- why answers were downvoted ---------------- */
function Reasons({ reasons, total }: { reasons: Reason[]; total: number }) {
  const top = Math.max(...reasons.map((r) => r.count), 1);
  return (
    <ul className="space-y-3">
      {reasons.map((r) => (
        <li key={r.reason}>
          <div className="mb-1 flex items-baseline justify-between text-[13.5px]">
            <span className="font-medium">{REASON_LABEL[r.reason] ?? r.reason}</span>
            <span className="text-muted">{r.count}{total > 0 && ` · ${Math.round((r.count / total) * 100)}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-2 rounded-full bg-slate-700" style={{ width: `${(r.count / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- downvoted answers to review ---------------- */
function Flaggeds({ items }: { items: Flagged[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return <p className="py-6 text-center text-[14px] text-muted">No downvoted answers in this period. Nothing to review.</p>;

  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((f) => {
          const isOpen = open === f.messageId;
          return (
            <li key={f.messageId}>
              <button onClick={() => setOpen(isOpen ? null : f.messageId)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <AppIcon name="chat" className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-6 text-brand" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] font-medium ${isOpen ? "" : "truncate"}`}>{f.question || "(question not found)"}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{new Date(f.askedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-medium text-red-700 ring-1 ring-inset ring-red-200">{REASON_LABEL[f.reason ?? "none"]}</span>
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-line bg-canvas px-4 py-4">
                  {f.comment && (
                    <div>
                      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">User&apos;s comment</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-white px-3 py-2 text-[13.5px]">{f.comment}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Answer given</p>
                    <div className="mt-1 rounded-lg border border-line bg-white px-3 py-2"><Markdown text={f.answer} /></div>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Sources used</p>
                    {f.sources.length === 0 ? (
                      <p className="mt-1 text-[13.5px] text-muted">None cited. The answer may have come without matching documents.</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {f.sources.map((s, i) => (
                          <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-medium text-slate-700">
                            <AppIcon name="doc" className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{s.source}{s.page != null ? ` · p.${s.page}` : ""}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {items.length >= LIMIT && <p className="mt-2 text-[12.5px] text-muted">Showing the {LIMIT} most recent.</p>}
    </>
  );
}

/* ---------------- section ---------------- */
export default function QualitySection({ days }: { days: number }) {
  const { data, error, retry } = useAnalytics<Quality>("quality", days, `&limit=${LIMIT}`);
  const t = data?.totals;
  const p = data?.previous;

  return (
    <Section id="quality-h" title="Answer quality" subtitle="How users rate the answers. Counted by the day the answer was given.">
      {error ? (
        <ErrorBox error={error} endpoint="quality" label="quality data" onRetry={retry} />
      ) : !data || !t || !p ? (
        <Skeleton chartHeight={300} />
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Helpful rate" value={pct(t.helpfulRate)} hint={t.rated ? `${t.up} helpful of ${t.rated} rated` : "No ratings yet"} current={t.helpfulRate} previous={p.helpfulRate} days={days} unit="points" good="up" />
            <Kpi label="Answers rated" value={t.rated.toLocaleString()} current={t.rated} previous={p.rated} days={days} />
            <Kpi label="Downvoted answers" value={t.down.toLocaleString()} current={t.down} previous={p.down} days={days} good="down" />
            <Kpi label="Rating coverage" value={pct(t.ratingCoverage)} hint={t.answers ? `${t.rated} of ${t.answers} answers rated` : "No answers yet"} current={t.ratingCoverage} previous={p.ratingCoverage} days={days} unit="points" good="up" />
          </div>

          {t.rated === 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-white px-5 py-12 text-center shadow-btn">
              <p className="text-[14.5px] font-medium">No answers were rated in this period</p>
              <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">Ratings appear here when people use the 👍 and 👎 buttons under answers in Chat.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <Card title="Ratings per day" note={`${fmtDay(data.start, true)} to ${fmtDay(data.end, true)} (UTC days)`}>
                    <RatingsChart daily={data.daily} />
                  </Card>
                </div>
                <div className="lg:col-span-2">
                  <Card title="Why answers were downvoted" note={t.down ? `${t.down} downvoted answer${t.down === 1 ? "" : "s"}` : "No downvotes"}>
                    <Reasons reasons={data.reasons} total={t.down} />
                  </Card>
                </div>
              </div>
              <Card title="Downvoted answers to review" note="Open an item to see the answer, the sources it used, and the user's comment.">
                <Flaggeds items={data.downvoted} />
              </Card>
            </div>
          )}
        </>
      )}
    </Section>
  );
}