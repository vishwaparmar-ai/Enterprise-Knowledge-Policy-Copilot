import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Streams the answer from the backend to the browser as it is written.
//   Backend: POST /chat/stream { query, conversation_id? } -> NDJSON lines:
//     {"type":"status","stage":"searching"|"generating"} | {"type":"delta","text"} |
//     {"type":"done",...} | {"type":"error","message"}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isDev = process.env.NODE_ENV !== "production";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const d = body?.detail ?? body;
    return typeof d === "string" ? d : JSON.stringify(d);
  } catch {
    return "";
  }
}

function fail(status: number, error: string, detail = "") {
  console.error(`[chat/stream] ${error}${detail ? `: ${detail}` : ""}`);
  return NextResponse.json({ error, ...(isDev && detail ? { detail } : {}) }, { status });
}

export async function POST(req: Request) {
  if (!process.env.BACKEND_URL) return fail(500, "config", "BACKEND_URL is not set in .env.local (restart `npm run dev` after editing it)");
  if (!(await getSession()).hasToken) return unauthorized("no access_token cookie in the request (sign in through /login again)");

  const { question, conversation_id } = await req.json();
  if (conversation_id && !UUID.test(conversation_id)) return fail(400, "bad_request", "invalid conversation id");

  let res: Response;
  try {
    res = await backendFetch("/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question, conversation_id: conversation_id ?? null }),
      signal: req.signal, // the user pressing Stop (or leaving) also cancels the backend request
    });
  } catch (err) {
    return fail(503, "unreachable", `Could not reach ${process.env.BACKEND_URL}. Is the backend running? (${String(err)})`);
  }

  if (res.status === 401) return unauthorized(`${await readDetail(res)} (a login token WAS sent to the backend)`);
  if (res.status === 404) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  if (!res.ok || !res.body) return fail(502, "backend_error", `HTTP ${res.status} from backend: ${await readDetail(res)}`);

  // Pass the stream straight through, without buffering.
  return new Response(res.body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}