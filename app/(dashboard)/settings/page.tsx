"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { resizeImageToDataUrl } from "@/lib/client/avatar-image";
import { Shield, Users } from "lucide-react";
import QRCode from "qrcode";

interface ProfileUser {
  id: string;
  email: string;
  role: "user" | "admin";
  displayName: string | null;
  createdAt: string;
  totpEnabled?: boolean;
  avatarUrl?: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // 2FA states
  const [totpSecret, setTotpSecret] = useState("");
  const [totpQrUri, setTotpQrUri] = useState("");
  const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [totpVerifyError, setTotpVerifyError] = useState("");
  const [totpSuccessMsg, setTotpSuccessMsg] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.user);
      setDisplayName(data.user.displayName || "");
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError("");
    setProfileSuccess(false);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    const data = await res.json();
    setProfileLoading(false);
    if (!res.ok) {
      setProfileError(data.error || "Failed to update profile");
      return;
    }
    setProfile(data.user);
    setProfileSuccess(true);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file");
      return;
    }

    setAvatarLoading(true);
    setAvatarError("");

    try {
      const avatarDataUrl = await resizeImageToDataUrl(file);
      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(data.error || "Failed to update avatar");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      router.refresh();
    } catch {
      setAvatarError("Failed to update avatar");
    } finally {
      setAvatarLoading(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarLoading(true);
    setAvatarError("");

    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setAvatarError(data.error || "Failed to remove avatar");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      router.refresh();
    } catch {
      setAvatarError("Failed to remove avatar");
    } finally {
      setAvatarLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setPasswordLoading(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPasswordLoading(false);

    if (!res.ok) {
      setPasswordError(data.error || "Failed to change password");
      return;
    }

    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSetupTotp() {
    setSetupLoading(true);
    setTotpVerifyError("");
    setTotpSuccessMsg("");
    try {
      const res = await fetch("/api/auth/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTotpVerifyError(data.error || "Failed to initiate 2FA setup");
        return;
      }
      setTotpSecret(data.secret);
      setTotpQrUri(data.qrUri);

      const dataUrl = await QRCode.toDataURL(data.qrUri, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      setTotpQrDataUrl(dataUrl);

      setShowTotpSetup(true);
    } catch (err) {
      setTotpVerifyError("Failed to initiate 2FA setup");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setTotpVerifyError("");
    setTotpSuccessMsg("");
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTotpVerifyError(data.error || "Invalid verification code");
        return;
      }
      setTotpSuccessMsg("Two-factor authentication has been enabled successfully.");
      setShowTotpSetup(false);
      setTotpCode("");
      if (profile) {
        setProfile({ ...profile, totpEnabled: true });
      }
    } catch (err) {
      setTotpVerifyError("Failed to verify code");
    }
  }

  async function handleDisableTotp(e: React.FormEvent) {
    e.preventDefault();
    setDisableError("");
    setTotpSuccessMsg("");
    setDisableLoading(true);
    try {
      const res = await fetch("/api/auth/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDisableError(data.error || "Failed to disable 2FA");
        return;
      }
      setTotpSuccessMsg("Two-factor authentication has been disabled.");
      setDisablePassword("");
      if (profile) {
        setProfile({ ...profile, totpEnabled: false });
      }
    } catch (err) {
      setDisableError("Failed to disable 2FA");
    } finally {
      setDisableLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" description="Account profile and security." />

      {profile?.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>User management</CardTitle>
            <p className="text-sm text-muted">Create accounts, assign roles, and manage access.</p>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/users"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Users className="h-4 w-4" />
              Manage users
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted">Your account details. Email is managed by an administrator.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-border pb-6">
            <UserAvatar
              displayName={displayName || profile?.displayName}
              email={profile?.email || ""}
              avatarUrl={profile?.avatarUrl}
              size="lg"
            />
            <div className="space-y-2">
              <p className="text-sm text-muted">Your avatar appears in the sidebar and across the app.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarLoading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarLoading ? "Uploading…" : "Change photo"}
                </Button>
                {profile?.avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={avatarLoading}
                    onClick={() => void handleAvatarRemove()}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleAvatarChange(e)}
              />
              {avatarError && <p className="text-sm text-destructive">{avatarError}</p>}
            </div>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile?.email || ""}
                readOnly
                className="text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you appear in the app"
                maxLength={80}
              />
            </div>
            {profile?.createdAt && (
              <p className="text-xs text-muted">
                Member since {new Date(profile.createdAt + "Z").toLocaleDateString()}
              </p>
            )}
            {profileError && <p className="text-sm text-destructive">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-success">Profile updated.</p>}
            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <p className="text-sm text-muted">Change your login password.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-success">Password updated.</p>}
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? "Saving…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
          <p className="text-sm text-muted">Secure your account with a time-based verification code (TOTP).</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {totpSuccessMsg && <p className="text-sm font-medium text-success">{totpSuccessMsg}</p>}

          {profile?.totpEnabled ?
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-semibold text-foreground">2FA is enabled</span>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <span className="text-muted-foreground">
                    Your account is protected by an additional verification code step at login.
                  </span>
                </div>
              </div>

              <form onSubmit={handleDisableTotp} className="space-y-3 border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground">Disable 2FA</h4>
                <div className="space-y-2">
                  <Label htmlFor="disable-password">Enter password to disable</Label>
                  <Input
                    id="disable-password"
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Your account password"
                    required
                  />
                </div>
                {disableError && <p className="text-sm text-destructive">{disableError}</p>}
                <Button type="submit" variant="destructive" disabled={disableLoading}>
                  {disableLoading ? "Disabling…" : "Disable 2FA"}
                </Button>
              </form>
            </div>
          : <div className="space-y-4">
              {!showTotpSetup ?
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Two-factor authentication is currently disabled. Enable it to require a 6-digit verification code from apps like Google Authenticator or Authy when logging in.
                  </p>
                  <Button onClick={handleSetupTotp} disabled={setupLoading}>
                    {setupLoading ? "Loading setup…" : "Setup 2FA"}
                  </Button>
                </div>
              : <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <h4 className="text-sm font-semibold text-foreground">Setup two-factor authentication</h4>
                  
                  <div className="flex flex-col items-center gap-3">
                    {totpQrDataUrl && (
                      <img
                        src={totpQrDataUrl}
                        alt="Scan this QR code with your authenticator app"
                        className="border border-zinc-700 bg-white p-2 rounded"
                        width={200}
                        height={200}
                      />
                    )}
                    <p className="text-center text-xs text-muted-foreground">
                      Scan the QR code, or manually enter the key below into your authenticator app:
                    </p>
                    <code className="rounded bg-input px-3 py-1.5 font-mono text-sm tracking-wider text-foreground select-all">
                      {totpSecret}
                    </code>
                  </div>

                  <form onSubmit={handleVerifyTotp} className="space-y-3 border-t border-border pt-4">
                    <div className="space-y-1">
                      <Label htmlFor="totp-code">Verification code</Label>
                      <Input
                        id="totp-code"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="e.g. 123456"
                        required
                        maxLength={6}
                        className="font-mono text-center tracking-widest text-lg"
                      />
                    </div>
                    {totpVerifyError && <p className="text-sm text-destructive">{totpVerifyError}</p>}
                    <div className="flex gap-2">
                      <Button type="submit">Verify and enable</Button>
                      <Button type="button" variant="outline" onClick={() => setShowTotpSetup(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              }
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
