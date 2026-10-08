import { NextResponse } from "next/server";
import { backendFetch, unauthorized } from "@/lib/backend";
import { getSession } from "@/lib/session";

// Backend: GET /conversations -> [{ id, title, updated_at }]  (the signed-in user's chats, newest first)
export async function GET() {
  if (!(await getSession()).hasToken) return unauthorized("no access_token cookie in the request");
  try {
    const res = await backendFetch("/conversations");
    if (res.status === 401) return unauthorized();
    if (!res.ok) return NextResponse.json({ error: "failed" }, { status: 502 });
    const list = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversations = list.map((c: any) => ({ id: String(c.id), title: c.title, updatedAt: c.updated_at }));
    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}