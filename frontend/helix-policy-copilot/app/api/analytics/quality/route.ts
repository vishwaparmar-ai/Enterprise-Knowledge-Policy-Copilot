import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend: GET /analytics/quality?days=30&limit=10  (admin only)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const days = Number(params.get("days") ?? 30);
  const limit = Number(params.get("limit") ?? 10);
  if (!Number.isInteger(days) || days < 1 || days > 365) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const res = await backendFetch(`/analytics/quality?days=${days}&limit=${limit}`);
    if (res.status === 401) return unauthorized();
    if (res.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // 404 means the backend has no such route (the new code isn't in analytics.py, or the backend wasn't restarted).
    if (res.status === 404) return NextResponse.json({ error: "endpoint_not_found" }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: 502 });
    const d = await res.json();
    const totals = (t: Record<string, number | null>) => ({
      answers: t.answers, rated: t.rated, up: t.up, down: t.down, helpfulRate: t.helpful_rate, ratingCoverage: t.rating_coverage,
    });
    return NextResponse.json({
      rangeDays: d.range_days,
      start: d.start,
      end: d.end,
      totals: totals(d.totals),
      previous: totals(d.previous),
      daily: d.daily,
      reasons: d.reasons,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      downvoted: d.downvoted.map((f: any) => ({
        messageId: f.message_id, askedAt: f.asked_at, ratedAt: f.rated_at, question: f.question,
        answer: f.answer, sources: f.sources ?? [], reason: f.reason, comment: f.comment,
      })),
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}