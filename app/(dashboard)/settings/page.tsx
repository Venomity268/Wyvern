"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QRCode from "qrcode";

interface ProfileUser {
  id: string;
  email: string;
  role: "user" | "admin";
  displayName: string | null;
  createdAt: string;
  totpEnabled?: boolean;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

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
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted">Account profile and security.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted">Your account details. Email is managed by an administrator.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={profile?.email || ""}
                readOnly
                className="bg-zinc-900 text-muted"
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
            {profileError && <p className="text-sm text-red-400">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-emerald-400">Profile updated.</p>}
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
            {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
            {passwordSuccess && <p className="text-sm text-emerald-400">Password updated.</p>}
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
          {totpSuccessMsg && <p className="text-sm text-emerald-400 font-medium">{totpSuccessMsg}</p>}

          {profile?.totpEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-950 bg-emerald-950/20 p-3 text-sm text-emerald-400">
                <span className="text-lg">🛡️</span>
                <div>
                  <span className="font-semibold block">2FA is Enabled</span>
                  <span>Your account is protected by an additional verification code step at login.</span>
                </div>
              </div>

              <form onSubmit={handleDisableTotp} className="space-y-3 pt-2 border-t border-zinc-800">
                <h4 className="text-sm font-medium text-zinc-200">Disable 2FA</h4>
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
                {disableError && <p className="text-sm text-red-400">{disableError}</p>}
                <Button type="submit" variant="destructive" disabled={disableLoading}>
                  {disableLoading ? "Disabling…" : "Disable 2FA"}
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              {!showTotpSetup ? (
                <div>
                  <p className="text-sm text-zinc-400 mb-3">
                    Two-factor authentication is currently disabled. Enable it to require a 6-digit verification code from apps like Google Authenticator or Authy when logging in.
                  </p>
                  <Button onClick={handleSetupTotp} disabled={setupLoading}>
                    {setupLoading ? "Loading setup..." : "Setup 2FA"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                  <h4 className="text-sm font-semibold text-zinc-100">Setup two-factor authentication</h4>
                  
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
                    <p className="text-xs text-zinc-400 text-center">
                      Scan the QR code, or manually enter the key below into your authenticator app:
                    </p>
                    <code className="bg-zinc-950 px-3 py-1.5 rounded font-mono text-sm tracking-wider select-all text-zinc-300">
                      {totpSecret}
                    </code>
                  </div>

                  <form onSubmit={handleVerifyTotp} className="space-y-3 pt-2 border-t border-zinc-800">
                    <div className="space-y-1">
                      <Label htmlFor="totp-code">Verification Code</Label>
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
                    {totpVerifyError && <p className="text-sm text-red-400">{totpVerifyError}</p>}
                    <div className="flex gap-2">
                      <Button type="submit">Verify and Enable</Button>
                      <Button type="button" variant="outline" onClick={() => setShowTotpSetup(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
