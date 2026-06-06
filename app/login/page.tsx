"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { LoginBrandPanel, LoginSplitLayout } from "@/components/auth/LoginSplitLayout";
import { PixelSnow } from "@/components/auth/PixelSnow";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, KeyRound, Mail, Shield } from "lucide-react";

type LoginTab = "credentials" | "totp";

function LoginField({
  id,
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  trailing,
  inputClassName,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
  inputClassName?: string;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-500" />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          className={cn(
            "h-11 w-full rounded-sm border border-zinc-700/80 bg-zinc-100 py-2 pl-10 pr-10 font-mono text-sm text-zinc-900 placeholder:text-zinc-400",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            inputClassName,
          )}
        />
        {trailing && <div className="absolute right-2">{trailing}</div>}
      </div>
    </div>
  );
}

function LoginFormPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const activeTab: LoginTab = totpRequired ? "totp" : "credentials";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, code: totpRequired ? code : undefined }),
    });

    if (!res.ok) {
      let errorMessage = "Login failed";
      try {
        const data = await res.json();
        errorMessage = data.error || errorMessage;
      } catch {
        errorMessage = `Login failed (${res.statusText || res.status})`;
      }
      setError(errorMessage);
      setLoading(false);
      return;
    }

    const data = await res.json();
    if (data.totpRequired) {
      setTotpRequired(true);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  function switchToCredentials() {
    setTotpRequired(false);
    setCode("");
    setError("");
  }

  return (
    <main className="relative flex h-full min-h-screen flex-col items-center justify-center bg-background/80 px-4 py-10 backdrop-blur-[1px] sm:px-8">
      <div className="mb-8 text-center lg:hidden">
        <h1 className="font-mono text-2xl font-bold uppercase tracking-[0.3em] text-foreground">
          {APP_NAME}
        </h1>
        <div className="mx-auto mt-3 h-0.5 w-10 bg-primary" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex gap-0">
          <button
            type="button"
            onClick={switchToCredentials}
            className={cn(
              "flex-1 border px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
              activeTab === "credentials" ?
                "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/90 text-muted-foreground hover:text-foreground",
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            disabled={!totpRequired}
            className={cn(
              "flex-1 border border-l-0 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
              activeTab === "totp" ?
                "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/90 text-muted-foreground",
              !totpRequired && "cursor-not-allowed opacity-50",
            )}
          >
            2FA
          </button>
        </div>

        <div className="space-y-1">
          <h2 className="font-mono text-xl font-semibold text-foreground">
            {activeTab === "totp" ? "Two-factor verification" : `Sign in to ${APP_NAME}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {activeTab === "totp" ?
              "Enter the 6-digit code from your authenticator app."
            : "Use your account email and password to continue."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {activeTab === "totp" ?
            <LoginField
              id="code"
              label="Authentication code"
              icon={Shield}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
              inputClassName="pr-4 text-center text-lg tracking-[0.4em]"
            />
          : <>
              <LoginField
                id="email"
                label="Email"
                icon={Mail}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                required
                autoFocus
                inputClassName="pr-4"
              />
              <LoginField
                id="password"
                label="Password"
                icon={KeyRound}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded p-1.5 text-zinc-500 hover:text-zinc-800"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ?
                      <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </>
          }

          {error && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-primary font-mono text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {loading ? "Verifying…" : activeTab === "totp" ? "Verify" : "Sign in"}
          </button>

          {activeTab === "totp" && (
            <button
              type="button"
              onClick={switchToCredentials}
              className="w-full py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to sign in
            </button>
          )}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <PixelSnow />
      <div className="relative z-10">
        <LoginSplitLayout
          brand={<LoginBrandPanel className="bg-sidebar/90 backdrop-blur-[1px]" />}
          form={<LoginFormPanel />}
        />
      </div>
    </div>
  );
}
