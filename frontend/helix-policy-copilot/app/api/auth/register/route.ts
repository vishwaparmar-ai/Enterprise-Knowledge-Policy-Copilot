import { NextResponse } from "next/server";

// Backend: POST /auth/register { email, full_name, password } -> 201 (409 duplicate email, 422 invalid)
export async function POST(req: Request) {
  const { email, full_name, password } = await req.json();

  let res: Response;
  try {
    res = await fetch(`${process.env.BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name, password }),
    });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }

  if (res.status === 201) return NextResponse.json({ ok: true }, { status: 201 });
  if (res.status === 409 || res.status === 422) return NextResponse.json({ error: "rejected" }, { status: res.status });
  return NextResponse.json({ error: "failed" }, { status: 502 });
}