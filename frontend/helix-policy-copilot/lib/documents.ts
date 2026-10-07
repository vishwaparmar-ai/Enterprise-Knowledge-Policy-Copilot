// Shared helpers for the documents API routes.
// (Next.js route.ts files may only export HTTP handlers, so helpers live here.)

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