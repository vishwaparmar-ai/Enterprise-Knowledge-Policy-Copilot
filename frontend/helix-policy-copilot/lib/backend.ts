// import { NextResponse } from "next/server";
// import { getSession } from "./session";

// /** Server-only fetch to your FastAPI backend, forwarding the JWT as a Bearer token. */
// export async function backendFetch(path: string, init: RequestInit = {}) {
//   const { token } = await getSession();
//   const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
//   if (token) headers.Authorization = `Bearer ${token}`;
//   return fetch(`${process.env.BACKEND_URL}${path}`, { ...init, headers, cache: "no-store" });
// }

// /**
//  * Backend rejected the token (missing, expired or invalid). Clear the stale cookies so the proxy
//  * stops treating the user as signed in; otherwise /login would bounce back to /dashboard forever.
//  */
// export function unauthorized(detail = "") {
//   console.error(`[auth] backend returned 401${detail ? `: ${detail}` : ""}`);
//   const isDev = process.env.NODE_ENV !== "production";
//   const res = NextResponse.json({ error: "unauthorized", ...(isDev && detail ? { detail } : {}) }, { status: 401 });
//   res.cookies.delete("access_token");
//   res.cookies.delete("role");
//   return res;
// }

import { getSession } from "./session";

export async function backendFetch(
  path: string,
  init: RequestInit = {},
) {
  const { token } = await getSession();

  console.log("[backendFetch] path:", path);
  console.log("[backendFetch] has token:", !!token);
  console.log(
    "[backendFetch] token preview:",
    token ? `${token.slice(0, 20)}...` : "NONE"
  );

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  console.log(
    "[backendFetch] Authorization header:",
    headers.Authorization ? "Bearer token present" : "MISSING"
  );

  return fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}