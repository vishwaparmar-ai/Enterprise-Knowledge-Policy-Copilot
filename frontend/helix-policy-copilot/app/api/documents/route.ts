import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend contract:
//   POST /upload/   multipart field "file" -> 202 { doc_id, original_filename, size_bytes, status, stage }
//   GET  /upload/documents   -> list of documents (NEW endpoint, snippet provided in the chat reply)
const UPLOAD_PATH = "/upload/";
const LIST_PATH = "/upload/documents";

export type DocStatus = "indexed" | "processing" | "failed";

/** DB statuses: queued, processing, ingested, indexed, failed. "ingested" still means indexing is running. */
export function normStatus(s: unknown): DocStatus {
  const v = String(s ?? "").toLowerCase();
  if (v === "indexed") return "indexed";
  if (v === "failed") return "failed";
  return "processing";
}

/** Surface the backend's own `detail` message (e.g. "Only .pdf and .docx files are allowed."). */
export async function backendDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.detail === "string" ? body.detail : "";
  } catch {
    return "";
  }
}

// The real permission check lives in your backend (require_role); this is a UI-layer guard.
export async function GET() {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const res = await backendFetch(LIST_PATH);
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: res.status === 403 ? 403 : 502 });
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.documents ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents = list.map((d: any) => ({
      id: String(d.doc_id ?? d.id),
      name: d.title || d.original_filename || "Untitled",
      status: normStatus(d.status),
      stage: d.stage ?? null,
      size: d.size_bytes ?? null,
      pages: d.page_count ?? null,
      uploadedAt: d.ingested_at ?? d.created_at ?? null,
      error: d.error ?? null,
    }));
    return NextResponse.json({ documents });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await getSession()).isAdmin) return NextResponse.json({ error: "You don't have permission to upload documents." }, { status: 403 });
  try {
    const form = await req.formData();
    const res = await backendFetch(UPLOAD_PATH, { method: "POST", body: form });
    if (res.status === 401) return unauthorized(await backendDetail(res));
    if (res.ok) {
      const d = await res.json(); // 202 Accepted: ingestion continues in the background
      return NextResponse.json({ docId: d.doc_id, status: normStatus(d.status), stage: d.stage ?? "queued" }, { status: 202 });
    }
    const detail = await backendDetail(res);
    const status = [400, 403, 413, 415, 422].includes(res.status) ? res.status : 502;
    return NextResponse.json({ error: detail }, { status });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}