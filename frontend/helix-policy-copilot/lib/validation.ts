export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const passwordRules = (pw: string) => [
  { label: "At least 8 characters", ok: pw.length >= 8 },
  { label: "One uppercase letter", ok: /[A-Z]/.test(pw) },
  { label: "One number", ok: /\d/.test(pw) },
];

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  const passed = passwordRules(pw).filter((r) => r.ok).length;
  if (passed === 3) return 3;
  return passed === 2 ? 2 : 1;
}
