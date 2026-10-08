import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend: GET / PATCH { title } / DELETE  on  /conversations/{id}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

async function guard(params: Ctx["params"]) {
  if (!(await getSession()).hasToken) return { error: unauthorized("no access_token cookie in the request") };
  const { id } = await params;
  if (!UUID.test(id)) return { error: NextResponse.json({ error: "invalid id" }, { status: 400 }) };
  return { id };
}

const unreachable = () => NextResponse.json({ error: "unreachable" }, { status: 503 });
const mapStatus = (s: number) => (s === 404 ? 404 : s === 422 ? 422 : 502);

export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard(params);
  if (g.error) return g.error;
  try {
    const res = await backendFetch(`/conversations/${g.id}`);
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: mapStatus(res.status) });
    const d = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (d.messages ?? []).map((m: any) => ({
      id: String(m.id),
      role: m.role,
      text: m.content,
      feedback: m.feedback ?? null, // this user's own rating of the answer: "up", "down" or null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources: (m.citations ?? []).map((c: any) => ({ document: c.source ?? "Document", page: c.page ?? null, snippet: "" })),
    }));
    return NextResponse.json({ id: String(d.id), title: d.title, messages });
  } catch {
    return unreachable();
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard(params);
  if (g.error) return g.error;
  try {
    const { title } = await req.json();
    const res = await backendFetch(`/conversations/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: mapStatus(res.status) });
    const d = await res.json();
    return NextResponse.json({ id: String(d.id), title: d.title, updatedAt: d.updated_at });
  } catch {
    return unreachable();
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard(params);
  if (g.error) return g.error;
  try {
    const res = await backendFetch(`/conversations/${g.id}`, { method: "DELETE" });
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: mapStatus(res.status) });
    return NextResponse.json({ ok: true });
  } catch {
    return unreachable();
  }
}