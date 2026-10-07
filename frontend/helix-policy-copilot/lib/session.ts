import { cookies } from "next/headers";

/** Server-side session info from the cookies set by /api/auth/login. */
export async function getSession() {
  const store = await cookies();
  const role = store.get("role")?.value ?? "";
  const token = store.get("access_token")?.value;
  return {
    role,
    // Tolerant match: "admin", "Admin", "ADMIN", "Role.ADMIN" all count.
    isAdmin: /admin/i.test(role),
    token,
    hasToken: !!token,
  };
}