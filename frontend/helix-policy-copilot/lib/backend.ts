import { NextResponse } from "next/server";
import { getSession } from "./session";

const isDev = process.env.NODE_ENV !== "production";

/** Server-only fetch to your FastAPI backend, forwarding the JWT as a Bearer token. */
export async function backendFetch(path: string, init: RequestInit = {}) {
  const { token } = await getSession();

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  if (isDev) console.log(`[backendFetch] ${init.method ?? "GET"} ${path} | token: ${token ? "sent" : "MISSING"}`);

  return fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/**
 * Backend rejected the token (missing, expired or invalid). Clear the stale cookies so the
 * middleware stops treating the user as signed in; otherwise /login would bounce back to /dashboard forever.
 */
export function unauthorized(detail = "") {
  console.error(`[auth] backend returned 401${detail ? `: ${detail}` : ""}`);
  const res = NextResponse.json({ error: "unauthorized", ...(isDev && detail ? { detail } : {}) }, { status: 401 });
  res.cookies.delete("access_token");
  res.cookies.delete("role");
  return res;
}