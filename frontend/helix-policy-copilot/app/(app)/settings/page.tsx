import { getSession } from "@/lib/session";

export default async function SettingsPage() {
  const { role, hasToken } = await getSession();
  const dev = process.env.NODE_ENV !== "production";
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:py-12">
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Settings</h1>
      <section className="mt-8 rounded-xl border border-line bg-white p-5 shadow-btn">
        <h2 className="text-[15px] font-semibold">Account</h2>
        <dl className="mt-4 flex items-center justify-between text-[14px]">
          <dt className="text-muted">Role</dt>
          <dd className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[13px] font-medium capitalize">{role || "Employee"}</dd>
        </dl>
      </section>

      {dev && (
        <section className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-[13.5px]">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Session debug (development only)</h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Login token cookie</dt><dd className="font-medium">{hasToken ? "present" : "MISSING: sign in again"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Role cookie (raw)</dt><dd className="font-mono">{role ? JSON.stringify(role) : "MISSING"}</dd></div>
          </dl>
        </section>
      )}
    </div>
  );
}