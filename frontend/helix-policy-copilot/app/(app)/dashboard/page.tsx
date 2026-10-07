import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/app/Icons";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    {children}
  </svg>
);

const TOPICS = [
  {
    title: "Human Resources",
    text: "Leave, benefits, conduct and workplace policies",
    question: "What are the key HR policies I should know, such as leave and the code of conduct?",
    icon: <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></Svg>,
  },
  {
    title: "Security",
    text: "Access, data protection and incident reporting",
    question: "What are our information security requirements for employees?",
    icon: <Svg><path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></Svg>,
  },
  {
    title: "Engineering",
    text: "Standards, code review and deployment practices",
    question: "What are our engineering standards for code review and deployment?",
    icon: <Svg><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14" /></Svg>,
  },
  {
    title: "Finance",
    text: "Expenses, reimbursements and procurement",
    question: "What is the process for expense reimbursement?",
    icon: <Svg><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16 14.5h2" /></Svg>,
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 md:py-16">
      <p className="text-[13.5px] font-medium text-brand">Helix Policy Copilot</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">Welcome back</h1>
      <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">
        Find answers across Helix Solutions policies, guidelines, and internal documentation.
      </p>

      <Link href="/chat" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-medium text-white shadow-btn transition-colors hover:bg-[#1d4fd8] active:bg-brand-dark">
        <AppIcon name="chat" /> Ask Copilot
      </Link>

      <h2 className="mb-3 mt-12 text-[13px] font-medium uppercase tracking-wide text-muted">Browse by topic</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOPICS.map((t) => (
          <Link
            key={t.title}
            href={`/chat?q=${encodeURIComponent(t.question)}`}
            className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 shadow-btn transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand">{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{t.title}</span>
              <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{t.text}</span>
            </span>
            <AppIcon name="arrow" className="mt-1 h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-brand" />
          </Link>
        ))}
      </div>
    </div>
  );
}