import KnowledgeVisual from "@/components/KnowledgeVisual";
import { Icon, LogoMark, Wordmark } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-[36%_1fr] lg:grid-cols-[42%_1fr]">
      {/* Branding panel: tablet and desktop */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy p-10 text-white md:flex xl:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-brand/20 blur-3xl" />
        <div className="relative">
          <Wordmark dark />
          <h2 className="mt-12 text-[28px] font-semibold leading-tight tracking-tight lg:text-[36px]">Helix Policy Copilot</h2>
          <p className="mt-3 text-lg text-slate-200">Your intelligent guide to company policies.</p>
          <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-slate-400">
            Find answers across Helix Solutions policies, guidelines, and internal documentation.
          </p>
        </div>
        <div className="relative my-6 flex min-h-0 flex-1 items-center justify-center">
          <KnowledgeVisual />
        </div>
        <p className="relative flex items-center gap-2 text-[13.5px] text-slate-400">
          <Icon name="lock" className="h-4 w-4" /> Secure access to Helix Solutions internal knowledge.
        </p>
      </aside>

      {/* Form side */}
      <main className="relative flex flex-col items-center justify-center bg-canvas px-5 py-10 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgb(37_99_235/0.06),transparent)]" />
        <div className="relative mb-6 flex flex-col items-center gap-3 md:hidden">
          <LogoMark size={40} />
          <span className="text-lg font-semibold tracking-tight">Helix Policy Copilot</span>
        </div>
        <div className="relative w-full max-w-[440px] rounded-xl border border-line bg-white p-6 shadow-card sm:p-8">{children}</div>
        <p className="relative mt-6 text-xs text-muted">© Helix Solutions. Internal use only.</p>
      </main>
    </div>
  );
}
