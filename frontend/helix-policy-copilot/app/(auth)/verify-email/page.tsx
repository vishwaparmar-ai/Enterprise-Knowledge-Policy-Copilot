"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Icon } from "@/components/ui";

const COOLDOWN = 30;

function VerifyContent() {
  const preview = useSearchParams().get("state"); // resend
  const [seconds, setSeconds] = useState(preview === "resend" ? COOLDOWN : 0);
  const [resent, setResent] = useState(preview === "resend");

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  function resend() {
    // call your resend endpoint here
    setResent(true);
    setSeconds(COOLDOWN);
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-canvas text-brand shadow-btn">
        <Icon name="mail" className="h-7 w-7" />
      </div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Verify your email</h1>
      <p className="mx-auto mt-2 max-w-xs text-[14.5px] leading-relaxed text-muted">
        We&apos;ve sent a verification link to your work email address.
      </p>
      <div className="mt-6 min-h-[44px]" aria-live="polite">
        {resent && (
          <p className="flex items-center justify-center gap-1.5 text-[13.5px] text-success">
            <Icon name="check" className="h-4 w-4" /> Verification email sent again.
          </p>
        )}
        {seconds > 0 && <p className="mt-1 text-[13.5px] text-muted">Resend available in {seconds} seconds</p>}
      </div>
      <div className="mt-2 space-y-3">
        <Button type="button" onClick={resend} disabled={seconds > 0}>Resend Verification Email</Button>
        <Link href="/login" className="block"><Button type="button" variant="secondary" tabIndex={-1}>Back to Sign In</Button></Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyContent /></Suspense>;
}
