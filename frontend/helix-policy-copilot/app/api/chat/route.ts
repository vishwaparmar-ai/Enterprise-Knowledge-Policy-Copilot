import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";

// Matches the FastAPI router:  POST /chat/  { query }  ->  { answer, citations: [{ source, page }] }
// The trailing slash is intentional: it avoids a 307 redirect from /chat to /chat/.
const CHAT_PATH = "/chat/";
const isDev = process.env.NODE_ENV !== "production";

async function readDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const d = body?.detail ?? body;
    return typeof d === "string" ? d : JSON.stringify(d);
  } catch {
    return "";
  }
}

// Error details are returned only in development, so employees never see backend internals.
function fail(status: number, error: string, detail = "") {
  console.error(`[chat] ${error}${detail ? `: ${detail}` : ""}`);
  return NextResponse.json({ error, ...(isDev && detail ? { detail } : {}) }, { status });
}

export async function POST(req: Request) {
  if (!process.env.BACKEND_URL) return fail(500, "config", "BACKEND_URL is not set in .env.local (restart `npm run dev` after editing it)");

  const { question } = await req.json();

  let res: Response;
  try {
    res = await backendFetch(CHAT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question }),
    });
  } catch (err) {
    return fail(503, "unreachable", `Could not reach ${process.env.BACKEND_URL}. Is the backend running? (${String(err)})`);
  }

  if (res.status === 401) return unauthorized(await readDetail(res));
  if (!res.ok) return fail(502, "backend_error", `HTTP ${res.status} from backend: ${await readDetail(res)}`);

  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sources = (data.citations ?? []).map((c: any) => ({
    document: c.source ?? "Document",
    page: c.page ?? null,
    snippet: c.snippet ?? "", // optional: add `snippet` to your Citation schema to enable click-to-expand excerpts
  }));
  return NextResponse.json({ answer: data.answer ?? "", sources, conversation_id: null });
}