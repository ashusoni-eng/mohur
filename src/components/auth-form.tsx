"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Field } from "./ui";
import { useSubmit } from "./live";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [f, set] = useState({ name: "", business: "", email: "", password: "" });
  const { busy, errors, submit } = useSubmit();
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...f, [k]: e.target.value });
  const signup = mode === "signup";
  return (
    <form
      noValidate className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(async () => {
          await api(`/api/auth/${mode}`, "POST", signup ? f : { email: f.email, password: f.password });
          router.push(signup ? "/app/configuration?welcome=1" : "/app");
          router.refresh();
        });
      }}
    >
      {signup && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={errors.name}>{(a) => <input {...a} className="field" autoComplete="name" value={f.name} onChange={up("name")} />}</Field>
          <Field label="Business name" error={errors.business}>{(a) => <input {...a} className="field" autoComplete="organization" value={f.business} onChange={up("business")} />}</Field>
        </div>
      )}
      <Field label="Email" error={errors.email}>{(a) => <input {...a} className="field" type="email" autoComplete="email" value={f.email} onChange={up("email")} />}</Field>
      <Field label="Password" error={errors.password} hint={signup ? "At least 10 characters" : undefined}>{(a) => <input {...a} className="field" type="password" autoComplete={signup ? "new-password" : "current-password"} value={f.password} onChange={up("password")} />}</Field>
      {errors.form && <p role="alert" className="rounded-[9px] bg-carnelian-wash px-4 py-2.5 text-[14px] text-carnelian">{errors.form}</p>}
      <Button type="submit" size="lg" className="w-full" busy={busy}>{signup ? "Create account" : "Sign in"}</Button>
      <p className="pt-1 text-center text-ink-3">
        {signup ? "Already have an account? " : "New to Mohur? "}
        <Link href={signup ? "/login" : "/signup"} className="font-semibold text-emerald underline decoration-brass-mid underline-offset-4">{signup ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
