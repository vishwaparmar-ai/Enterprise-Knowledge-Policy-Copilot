import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { backendDetail, normStatus } from "@/lib/documents";
import { getSession } from "@/lib/session";

// Backend: GET    /upload/documents/{doc_id} -> { status, stage, error, ... }
//          DELETE /upload/documents/{doc_id} -> 204 (409 while the document is still being processed)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const res = await backendFetch(`/upload/documents/${id}`);
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: res.status === 404 ? 404 : 502 });
    const d = await res.json();
    return NextResponse.json({ status: normStatus(d.status), stage: d.stage ?? null, error: d.error ?? null });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "You don't have permission to delete documents." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const res = await backendFetch(`/upload/documents/${id}`, { method: "DELETE" });
    if (res.status === 401) return unauthorized();
    if (res.ok) return NextResponse.json({ ok: true });
    const detail = await backendDetail(res);
    return NextResponse.json({ error: detail }, { status: [403, 404, 409].includes(res.status) ? res.status : 502 });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}