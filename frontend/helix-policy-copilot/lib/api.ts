const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  role: Role;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

async function parseResponse<T>(
  response: Response
): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      data?.detail ||
      data?.message ||
      "Something went wrong. Please try again.";

    throw new Error(detail);
  }

  return data as T;
}

export async function login(
  payload: LoginRequest
): Promise<TokenResponse> {
  const response = await fetch(
    `${API_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return parseResponse<TokenResponse>(response);
}

export async function register(
  payload: RegisterRequest
): Promise<UserResponse> {
  const response = await fetch(
    `${API_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return parseResponse<UserResponse>(response);
}

export function saveAuth(token: TokenResponse) {
  localStorage.setItem(
    "access_token",
    token.access_token
  );

  localStorage.setItem(
    "user_role",
    token.role
  );
}

export function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getUserRole(): Role | null {
  return localStorage.getItem(
    "user_role"
  ) as Role | null;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user_role");
}