"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Button,
  Field,
  FormHeader,
  Icon,
  InlineAlert,
  linkCls,
} from "@/components/ui";

import { isEmail } from "@/lib/validation";
import { login, saveAuth } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preview = searchParams.get("state");

  const [email, setEmail] = useState(
    preview === "validation"
      ? "john.doe@helix"
      : ""
  );

  const [password, setPassword] = useState(
    preview ? "password123" : ""
  );

  const [emailErr, setEmailErr] = useState(
    preview === "validation"
      ? "Please enter a valid work email address."
      : ""
  );

  const [pwErr, setPwErr] = useState("");

  const [formErr, setFormErr] = useState(
    preview === "credentials"
      ? "We couldn't sign you in. Please check your email and password."
      : ""
  );

  const [status, setStatus] = useState<
    "idle" | "loading" | "success"
  >(
    preview === "loading"
      ? "loading"
      : preview === "success"
        ? "success"
        : "idle"
  );

  async function onSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setFormErr("");

    const normalizedEmail =
      email.trim().toLowerCase();

    const eErr = isEmail(normalizedEmail)
      ? ""
      : "Please enter a valid work email address.";

    const pErr = password
      ? ""
      : "Enter your password.";

    setEmailErr(eErr);
    setPwErr(pErr);

    if (eErr || pErr) {
      return;
    }

    setStatus("loading");

    try {
      const result = await login({
        email: normalizedEmail,
        password,
      });

      saveAuth(result);

      setStatus("success");

      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } catch (error) {
      setStatus("idle");

      if (error instanceof Error) {
        setFormErr(error.message);
      } else {
        setFormErr(
          "We couldn't sign you in. Please check your email and password."
        );
      }
    }
  }

  const busy = status !== "idle";

  return (
    <>
      <FormHeader
        title="Welcome back"
        text="Sign in to continue to Helix Policy Copilot."
      />

      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4"
      >
        {formErr && (
          <InlineAlert>
            {formErr}
          </InlineAlert>
        )}

        <Field
          label="Work Email"
          type="email"
          autoComplete="email"
          placeholder="you@helixsolutions.com"
          value={email}
          error={emailErr}
          disabled={busy}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailErr("");
            setFormErr("");
          }}
        />

        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          error={pwErr}
          disabled={busy}
          onChange={(e) => {
            setPassword(e.target.value);
            setPwErr("");
            setFormErr("");
          }}
          labelRight={
            <Link
              href="/forgot-password"
              className={`text-[13px] ${linkCls}`}
            >
              Forgot password?
            </Link>
          }
        />

        <div className="pt-1">
          {status === "success" ? (
            <Button
              type="button"
              variant="success"
              disabled
              className="disabled:opacity-100"
            >
              <Icon
                name="check"
                className="pop h-4 w-4"
              />
              Signed in
            </Button>
          ) : (
            <Button
              type="submit"
              loading={status === "loading"}
            >
              {status === "loading"
                ? "Signing in..."
                : "Sign In"}
            </Button>
          )}
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className={linkCls}
        >
          Create account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}