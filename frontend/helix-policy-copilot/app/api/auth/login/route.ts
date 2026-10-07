import { NextResponse } from "next/server";

// Backend: POST /auth/login { email, password } -> { access_token, role }  (401 on bad credentials)
export async function POST(req: Request) {
  const { email, password } = await req.json();

  let res: Response;
  try {
    res = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }

  if (res.status === 401) return NextResponse.json({ error: "invalid" }, { status: 401 });
  if (!res.ok) return NextResponse.json({ error: "failed" }, { status: 502 });

  const { access_token, role } = await res.json();
  const secure = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 8; // keep this at or below your JWT expiry

  const response = NextResponse.json({ role });
  // JWT: httpOnly, so browser JavaScript can never read it
  response.cookies.set("access_token", access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  // Role: for showing/hiding UI only. The backend enforces real permissions.
  response.cookies.set("role", String(role), { secure, sameSite: "lax", path: "/", maxAge });
  return response;
}