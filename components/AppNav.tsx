"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut, Users, Home, FolderOpen, Settings, Plus, Zap } from "lucide-react";
import type { WorkspaceWithRole } from "@/lib/db/workspaces";

interface NavProps {
  user: { email: string; role: "user" | "admin"; displayName?: string | null };
  workspaces: WorkspaceWithRole[];
}

export function AppNav({ user, workspaces }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const adminLinks =
    user.role === "admin"
      ? [{ href: "/admin/users", label: "Users", icon: Users }]
      : [];

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link href="/" className="shrink-0 text-lg font-semibold text-foreground">
            wterm Bastion
          </Link>
          <nav className="flex min-w-0 flex-wrap items-center gap-1">
            <Link
              href="/"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === "/"
                  ? "bg-zinc-800 font-medium text-foreground"
                  : "text-muted hover:bg-zinc-900 hover:text-foreground",
              )}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                href={`/workspace/${ws.id}`}
                className={cn(
                  "flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname === `/workspace/${ws.id}`
                    ? "bg-zinc-800 font-medium text-foreground"
                    : "text-muted hover:bg-zinc-900 hover:text-foreground",
                )}
                title={ws.name}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="truncate">{ws.name}</span>
              </Link>
            ))}
            <Link
              href="/connect"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === "/connect"
                  ? "bg-zinc-800 font-medium text-foreground"
                  : "text-muted hover:bg-zinc-900 hover:text-foreground",
              )}
            >
              <Zap className="h-4 w-4" />
              Quick
            </Link>
            <Link
              href="/workspaces/new"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname === "/workspaces/new"
                  ? "bg-zinc-800 font-medium text-foreground"
                  : "text-muted hover:bg-zinc-900 hover:text-foreground",
              )}
            >
              <Plus className="h-4 w-4" />
              New
            </Link>
            {adminLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  pathname === href
                    ? "bg-zinc-800 font-medium text-foreground"
                    : "text-muted hover:bg-zinc-900 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/settings"
            className={cn(
              "rounded-md p-1.5 text-muted transition-colors hover:bg-zinc-900 hover:text-foreground",
              pathname === "/settings" && "bg-zinc-800 text-foreground",
            )}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <span className="hidden text-sm text-muted sm:inline">
            {user.displayName || user.email}
          </span>
          {user.role === "admin" && (
            <span className="rounded bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-900">
              Admin
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={logout} className="text-zinc-400">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
