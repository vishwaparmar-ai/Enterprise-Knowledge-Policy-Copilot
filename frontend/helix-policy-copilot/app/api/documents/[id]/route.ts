import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";
import { normStatus } from "../route";

// Backend: GET /upload/documents/{doc_id} -> { status, stage, error, title, page_count, ... }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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