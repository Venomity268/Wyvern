"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalSquare } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      } catch (err) {
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

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <TerminalSquare className="h-6 w-6 text-zinc-300" />
          </div>
          <CardTitle>{totpRequired ? "Two-Factor Verification" : "wterm Bastion"}</CardTitle>
          <p className="text-sm text-zinc-500">
            {totpRequired
              ? "Enter the 6-digit code from your authenticator app"
              : "Sign in to manage SSH and VNC connections"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {totpRequired ? (
              <div className="space-y-2">
                <Label htmlFor="code" className="text-zinc-300">
                  Authentication Code
                </Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="text-center text-lg tracking-widest"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-300">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-zinc-300">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : totpRequired ? "Verify" : "Sign in"}
            </Button>
            {totpRequired && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-zinc-400 hover:text-zinc-200 mt-2"
                onClick={() => {
                  setTotpRequired(false);
                  setCode("");
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
