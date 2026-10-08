import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend: PUT /feedback/{message_id} { rating, reason?, comment? }   DELETE /feedback/{message_id}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = ["inaccurate", "not_relevant", "incomplete", "other"];
type Ctx = { params: Promise<{ messageId: string }> };

async function guard(params: Ctx["params"]) {
  if (!(await getSession()).hasToken) return { error: unauthorized("no access_token cookie in the request") };
  const { messageId } = await params;
  if (!UUID.test(messageId)) return { error: NextResponse.json({ error: "invalid id" }, { status: 400 }) };
  return { id: messageId };
}

const mapStatus = (s: number) => (s === 404 ? 404 : s === 422 ? 422 : 502);

export async function PUT(req: Request, { params }: Ctx) {
  const g = await guard(params);
  if (g.error) return g.error;

  let body: { rating?: string; reason?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (body.rating !== "up" && body.rating !== "down") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (body.reason && !REASONS.includes(body.reason)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const res = await backendFetch(`/feedback/${g.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: body.rating, reason: body.reason ?? null, comment: body.comment?.slice(0, 500) ?? null }),
    });
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: mapStatus(res.status) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard(params);
  if (g.error) return g.error;
  try {
    const res = await backendFetch(`/feedback/${g.id}`, { method: "DELETE" });
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: mapStatus(res.status) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}