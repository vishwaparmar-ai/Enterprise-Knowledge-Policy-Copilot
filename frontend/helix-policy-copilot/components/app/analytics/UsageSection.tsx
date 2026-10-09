"use client";
import { useState } from "react";
import { Card, ErrorBox, Kpi, Section, Skeleton, fmtDay, useAnalytics } from "./shared";

type Totals = { questions: number; activeUsers: number; conversations: number; avgQuestionsPerConversation: number };
type Day = { date: string; questions: number; activeUsers: number };
type Usage = { rangeDays: number; start: string; end: string; totals: Totals; previous: Totals; daily: Day[] };

function UsageChart({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800, H = 260, m = { l: 40, r: 12, t: 12, b: 28 };
  const innerW = W - m.l - m.r, innerH = H - m.t - m.b;
  const n = daily.length;
  const peak = Math.max(...daily.map((d) => Math.max(d.questions, d.activeUsers)), 0);
  const max = Math.max(4, Math.ceil(peak / 4) * 4);
  const band = innerW / n;
  const barW = Math.max(2, band * 0.62);
  const x = (i: number) => m.l + band * i + band / 2;
  const y = (v: number) => m.t + innerH * (1 - v / max);
  const labelEvery = Math.ceil(n / 7);
  const line = daily.map((d, i) => `${x(i)},${y(d.activeUsers)}`).join(" ");
  const h = hover !== null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-slate-600">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-brand" aria-hidden="true" /> Questions</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-navy" aria-hidden="true" /> Active users</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Questions and active users per day, ${fmtDay(daily[0].date)} to ${fmtDay(daily[n - 1].date)}. Data table below.`} onMouseLeave={() => setHover(null)}>
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
            <rect key={d.date} x={x(i) - barW / 2} y={y(d.questions)} width={barW} height={Math.max(0, m.t + innerH - y(d.questions))} rx="2" fill="#2563EB" opacity={hover === null || hover === i ? 1 : 0.45} />
          ))}
          <polyline points={line} fill="none" stroke="#0F172A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {n <= 31 && daily.map((d, i) => <circle key={d.date} cx={x(i)} cy={y(d.activeUsers)} r="3" fill="#fff" stroke="#0F172A" strokeWidth="2" />)}
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
            <p className="mt-1 text-slate-600">Questions: <span className="font-semibold text-ink">{h.questions}</span></p>
            <p className="text-slate-600">Active users: <span className="font-semibold text-ink">{h.activeUsers}</span></p>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Questions and active users per day</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Questions</th><th scope="col">Active users</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.questions}</td><td>{d.activeUsers}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function UsageSection({ days }: { days: number }) {
  const { data, error, retry } = useAnalytics<Usage>("usage", days);

  return (
    <Section id="usage-h" title="Usage" subtitle="How much Copilot is being used.">
      {error ? (
        <ErrorBox error={error} endpoint="usage" label="usage data" onRetry={retry} />
      ) : !data ? (
        <Skeleton />
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Questions asked" value={data.totals.questions.toLocaleString()} current={data.totals.questions} previous={data.previous.questions} days={days} />
            <Kpi label="Active users" value={data.totals.activeUsers.toLocaleString()} current={data.totals.activeUsers} previous={data.previous.activeUsers} days={days} />
            <Kpi label="Conversations" value={data.totals.conversations.toLocaleString()} current={data.totals.conversations} previous={data.previous.conversations} days={days} />
            <Kpi label="Questions per conversation" value={data.totals.avgQuestionsPerConversation} current={data.totals.avgQuestionsPerConversation} previous={data.previous.avgQuestionsPerConversation} days={days} />
          </div>
          <div className="mt-4">
            <Card title="Questions and active users per day" note={`${fmtDay(data.start, true)} to ${fmtDay(data.end, true)} (UTC days)`}>
              {data.totals.questions === 0 ? <p className="py-10 text-center text-[14px] text-muted">No questions were asked in this period.</p> : <UsageChart daily={data.daily} />}
            </Card>
          </div>
        </>
      )}
    </Section>
  );
}