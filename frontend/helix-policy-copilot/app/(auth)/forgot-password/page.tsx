"use client";
import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Field, FormHeader, StatusIcon, linkCls } from "@/components/ui";
import { isEmail } from "@/lib/validation";

function ForgotForm() {
  const preview = useSearchParams().get("state"); // sent
  const [email, setEmail] = useState(preview === "sent" ? "you@helixsolutions.com" : "");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(preview === "sent");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setErr("Please enter a valid work email address.");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000)); // replace with a real API call
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="py-2">
        <StatusIcon name="mail" />
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Check your email</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          If an account exists for this email address, you&apos;ll receive instructions to reset your password.
        </p>
        <Link href="/login" className="mt-7 block"><Button type="button" variant="secondary" tabIndex={-1}>Back to Sign In</Button></Link>
      </div>
    );
  }

  return (
    <>
      <FormHeader title="Forgot your password?" text="Enter your work email and we'll send you instructions to reset your password." />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Work Email" type="email" autoComplete="email" placeholder="you@helixsolutions.com" value={email} error={err}
          onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
        <div className="pt-1"><Button type="submit" loading={loading}>{loading ? "Sending..." : "Send Reset Link"}</Button></div>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Remember your password? <Link href="/login" className={linkCls}>Sign in</Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense><ForgotForm /></Suspense>;
}
