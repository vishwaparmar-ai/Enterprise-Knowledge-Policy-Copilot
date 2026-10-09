import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend: GET /analytics/usage?days=30  (admin only)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const res = await backendFetch(`/analytics/usage?days=${days}`);
    if (res.status === 401) return unauthorized();
    if (res.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: 502 });
    const d = await res.json();
    const totals = (t: Record<string, number>) => ({
      questions: t.questions,
      activeUsers: t.active_users,
      conversations: t.conversations,
      avgQuestionsPerConversation: t.avg_questions_per_conversation,
    });
    return NextResponse.json({
      rangeDays: d.range_days,
      start: d.start,
      end: d.end,
      totals: totals(d.totals),
      previous: totals(d.previous),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      daily: d.daily.map((x: any) => ({ date: x.date, questions: x.questions, activeUsers: x.active_users })),
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}