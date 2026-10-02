"use client";

import { FormEvent, Suspense, useState } from "react";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Button,
  Field,
  FormHeader,
  Icon,
  SelectField,
  StatusIcon,
  InlineAlert,
  linkCls,
} from "@/components/ui";

import {
  isEmail,
  passwordRules,
  passwordStrength,
} from "@/lib/validation";

import { register } from "@/lib/api";

const DEPARTMENTS = [
  "Engineering",
  "Human Resources",
  "Security",
  "Finance",
  "Operations",
  "Management",
  "Other",
];

const STRENGTH = [
  { label: "", bar: "" },
  { label: "Weak", bar: "bg-danger" },
  { label: "Medium", bar: "bg-amber-500" },
  { label: "Strong", bar: "bg-success" },
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preview = searchParams.get("state");

  const [name, setName] = useState(
    preview ? "John Doe" : ""
  );

  const [email, setEmail] = useState(
    preview
      ? "john.doe@helixsolutions.com"
      : ""
  );

  const [pw, setPw] = useState(
    preview === "password"
      ? "helix1"
      : preview === "mismatch"
        ? "Helix1234"
        : ""
  );

  const [confirm, setConfirm] = useState(
    preview === "mismatch"
      ? "Helix123"
      : ""
  );

  const [dept, setDept] = useState("");

  const [errs, setErrs] = useState<{
    name?: string;
    email?: string;
    pw?: string;
    confirm?: string;
  }>(
    preview === "mismatch"
      ? {
          confirm: "Passwords do not match.",
        }
      : {}
  );

  const [formErr, setFormErr] = useState("");

  const [loading, setLoading] = useState(false);

  const [done, setDone] = useState(
    preview === "success"
  );

  const rules = passwordRules(pw);
  const score = passwordStrength(pw);

  async function onSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setFormErr("");

    const next = {
      name: name.trim()
        ? ""
        : "Enter your full name.",

      email: isEmail(email.trim())
        ? ""
        : "Please enter a valid work email address.",

      pw: rules.every((r) => r.ok)
        ? ""
        : "Password doesn't meet the requirements.",

      confirm: confirm === pw
        ? ""
        : "Passwords do not match.",
    };

    setErrs(next);

    if (Object.values(next).some(Boolean)) {
      return;
    }

    setLoading(true);

    try {
      await register({
        email: email.trim().toLowerCase(),
        full_name: name.trim(),
        password: pw,
      });

      setDone(true);
    } catch (error) {
      if (error instanceof Error) {
        setFormErr(error.message);
      } else {
        setFormErr(
          "We couldn't create your account. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="py-2">
        <StatusIcon
          name="check"
          tone="success"
        />

        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          Account created successfully
        </h1>

        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Your Helix Policy Copilot account has been created successfully.
        </p>

        <Button
          className="mt-7"
          onClick={() => router.push("/login")}
        >
          Continue to Sign In
        </Button>
      </div>
    );
  }

  return (
    <>
      <FormHeader
        title="Create your account"
        text="Join Helix Policy Copilot and access your company's knowledge securely."
      />

      {formErr && (
        <InlineAlert>
          {formErr}
        </InlineAlert>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4"
      >
        <Field
          label="Full Name"
          autoComplete="name"
          placeholder="John Doe"
          value={name}
          error={errs.name}
          disabled={loading}
          onChange={(e) => {
            setName(e.target.value);

            setErrs((s) => ({
              ...s,
              name: "",
            }));

            setFormErr("");
          }}
        />

        <Field
          label="Work Email"
          type="email"
          autoComplete="email"
          placeholder="you@helixsolutions.com"
          value={email}
          error={errs.email}
          disabled={loading}
          onChange={(e) => {
            setEmail(e.target.value);

            setErrs((s) => ({
              ...s,
              email: "",
            }));

            setFormErr("");
          }}
        />

        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={pw}
            error={errs.pw}
            disabled={loading}
            onChange={(e) => {
              setPw(e.target.value);

              setErrs((s) => ({
                ...s,
                pw: "",
              }));

              setFormErr("");
            }}
          />

          {pw && (
            <div
              className="mt-3 flex items-center gap-3"
              aria-live="polite"
            >
              <div
                className="flex flex-1 gap-1.5"
                aria-hidden="true"
              >
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= score
                        ? STRENGTH[score].bar
                        : "bg-line"
                    }`}
                  />
                ))}
              </div>

              <span className="w-14 text-right text-[12.5px] font-medium text-ink">
                {STRENGTH[score].label}
              </span>
            </div>
          )}

          <ul className="mt-3 space-y-1.5">
            {rules.map((r) => (
              <li
                key={r.label}
                className={`flex items-center gap-2 text-[13px] ${
                  r.ok
                    ? "text-success"
                    : "text-muted"
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full ${
                    r.ok
                      ? "bg-success text-white"
                      : "border border-slate-300"
                  }`}
                >
                  {r.ok && (
                    <Icon
                      name="check"
                      className="h-3 w-3"
                    />
                  )}
                </span>

                {r.label}

                <span className="sr-only">
                  {r.ok
                    ? "(met)"
                    : "(not met)"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Field
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm your password"
          value={confirm}
          error={errs.confirm}
          disabled={loading}
          onChange={(e) => {
            setConfirm(e.target.value);

            setErrs((s) => ({
              ...s,
              confirm: "",
            }));

            setFormErr("");
          }}
        />

        <SelectField
          label="Department"
          value={dept}
          disabled={loading}
          onChange={(e) =>
            setDept(e.target.value)
          }
        >
          <option value="">
            Select your department
          </option>

          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectField>

        <div className="pt-1">
          <Button
            type="submit"
            loading={loading}
          >
            {loading
              ? "Creating account..."
              : "Create Account"}
          </Button>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className={linkCls}
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}