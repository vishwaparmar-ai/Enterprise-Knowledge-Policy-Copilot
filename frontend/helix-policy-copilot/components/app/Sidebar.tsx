"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/ui";
import { AppIcon, type AppIconName } from "./Icons";

const NAV: { href: string; label: string; icon: AppIconName; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/chat", label: "Chat", icon: "chat" },
  { href: "/documents", label: "Documents", icon: "doc", adminOnly: true },
  { href: "/analytics", label: "Analytics", icon: "chart", adminOnly: true },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export default function Sidebar({ isAdmin, role }: { isAdmin: boolean; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[15px] font-semibold tracking-tight">Policy Copilot</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-slate-100">
          <AppIcon name="menu" className="h-5 w-5" />
        </button>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-navy/40 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white transition-transform duration-200 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center justify-between px-5 md:h-16">
          <Wordmark />
          <button onClick={() => setOpen(false)} aria-label="Close navigation" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 md:hidden">
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-2">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors ${
                  active ? "bg-blue-50 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                }`}
              >
                <AppIcon name={n.icon} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-white">
              {(role || "E")[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] text-muted">Signed in as</p>
              <p className="truncate text-[13.5px] font-medium capitalize text-ink">{role || "Employee"}</p>
            </div>
          </div>
          <button onClick={signOut} className="mt-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-slate-600 hover:bg-slate-100 hover:text-ink">
            <AppIcon name="logout" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}